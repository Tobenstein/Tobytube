import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const args = parseArgs(process.argv.slice(2));

if (!hasTmdbCredentials()) {
  throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY before running this script.");
}

const reference = await readJson(referencePath, {});
const posters = await readJson(posterPath, {});
const seasonTargets = collectSeasonTargets(reference, args);
const showCache = new Map();
let written = 0;

for (const target of seasonTargets) {
  const key = target.cacheKey;
  if (posters[key]?.source === "tmdb-season") continue;

  const show = showCache.get(target.queryTitle) ?? (await searchTv(target.queryTitle));
  showCache.set(target.queryTitle, show);
  await delay(180);
  if (!show?.id) continue;

  const details = await tvDetails(show.id);
  await delay(180);
  const season =
    details.seasons?.find((item) => yearFromSeason(item) === target.year) ??
    details.seasons?.find((item) => item.season_number === target.seasonNumber);
  const posterPath = season?.poster_path ?? show.poster_path;
  if (!posterPath) continue;

  posters[key] = {
    source: season?.poster_path ? "tmdb-season" : "tmdb",
    tmdbId: show.id,
    posterUrl: `https://image.tmdb.org/t/p/w342${posterPath}`,
    seasonNumber: season?.season_number ?? null,
    seasonName: season?.name ?? null,
    query: target.queryTitle,
  };
  written += 1;
}

await writeFile(posterPath, `${JSON.stringify(posters, null, 2)}\n`);
console.log(`Wrote ${written} wrestling season poster mappings.`);

function collectSeasonTargets(referenceDb, options) {
  const startYear = Number(options.startYear);
  const endYear = Number(options.endYear);
  const promotionId = options.promotionId;
  const seen = new Map();

  for (const episode of referenceDb.episodes ?? []) {
    if (episode.promotionId !== promotionId) continue;
    const year = Number(episode.date?.slice(0, 4));
    if (year < startYear || year > endYear) continue;
    const queryTitle = tmdbTitleForSeries(episode.seriesName);
    if (!queryTitle) continue;
    const cacheKey = `season-${promotionId}-${slug(episode.seriesName)}-${year}`;
    if (!seen.has(cacheKey)) {
      seen.set(cacheKey, {
        cacheKey,
        queryTitle,
        seriesName: episode.seriesName,
        year,
        seasonNumber: year,
      });
    }
  }

  return [...seen.values()];
}

function tmdbTitleForSeries(seriesName = "") {
  const normalized = seriesName.toLowerCase();
  if (normalized.includes("raw")) return "WWE Monday Night RAW";
  if (normalized.includes("smackdown")) return "WWE SmackDown";
  if (normalized.includes("heat")) return "WWE Sunday Night Heat";
  if (normalized.includes("jakked")) return "WWF Jakked";
  if (normalized.includes("metal")) return "WWF Jakked";
  if (normalized.includes("velocity")) return "WWE Velocity";
  if (normalized.includes("shotgun")) return "WWF Shotgun Saturday Night";
  if (normalized.includes("superstars")) return "WWF Superstars";
  if (normalized.includes("super astros") || normalized.includes("súper astros")) return "WWF Super Astros";
  if (normalized.includes("wrestling challenge") || normalized === "challenge") return "WWF Wrestling Challenge";
  if (normalized.includes("prime time")) return "WWF Prime Time Wrestling";
  if (normalized.includes("saturday night's main event")) return "WWF Saturday Night's Main Event";
  if (normalized.includes("main event")) return "WWF Saturday Night's Main Event";
  if (normalized.includes("all american")) return "WWF All American Wrestling";
  if (normalized.includes("livewire")) return "WWF LiveWire";
  if (normalized.includes("excess")) return "WWE Excess";
  return null;
}

function yearFromSeason(season) {
  const fromName = String(season.name ?? "").match(/\b(19|20)\d{2}\b/)?.[0];
  if (fromName) return Number(fromName);
  const airYear = String(season.air_date ?? "").slice(0, 4);
  return Number(airYear) || null;
}

async function searchTv(title) {
  const url = new URL("https://api.themoviedb.org/3/search/tv");
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("query", title);
  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.warn(`TMDB search failed for ${title}: ${response.status}`);
    return null;
  }
  const json = await response.json();
  return json.results?.[0] ?? null;
}

async function tvDetails(tmdbId) {
  const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.warn(`TMDB TV details failed for ${tmdbId}: ${response.status}`);
    return {};
  }
  return response.json();
}

function hasTmdbCredentials() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY);
}

function tmdbHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function parseArgs(rawArgs) {
  const parsed = {
    promotionId: "wwe",
    startYear: "1990",
    endYear: "1999",
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--promotion") parsed.promotionId = rawArgs[++index];
    if (arg === "--start-year") parsed.startYear = rawArgs[++index];
    if (arg === "--end-year") parsed.endYear = rawArgs[++index];
  }
  return parsed;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
