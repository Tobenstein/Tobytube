import { readFile, rename, writeFile } from "node:fs/promises";
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
let stillsWritten = 0;

for (const target of seasonTargets) {
  const key = target.cacheKey;

  const show = showCache.get(target.queryTitle) ?? (await searchTv(target.queryTitle));
  showCache.set(target.queryTitle, show);
  await delay(180);
  if (!show?.id) continue;

  const details = await tvDetails(show.id);
  await delay(180);
  const season =
    details.seasons?.find((item) => yearFromSeason(item) === target.year) ??
    details.seasons?.find((item) => item.season_number === target.seasonNumber);
  const posterPath = season?.poster_path ?? details.poster_path;
  const posterSource = season?.poster_path ? "tmdb-season" : "tmdb-series-fallback";
  if (posterPath && (!posters[key]?.posterUrl || ["tmdb", "tmdb-season", "tmdb-series-fallback"].includes(posters[key]?.source))) {
    posters[key] = {
      source: posterSource,
      tmdbId: show.id,
      posterUrl: `https://image.tmdb.org/t/p/w342${posterPath}`,
      seasonNumber: season?.season_number ?? null,
      seasonName: season?.name ?? null,
      query: target.queryTitle,
    };
    written += 1;
  } else if (!posterPath && posters[key]?.source === "tmdb") {
    delete posters[key];
  }
  if (season?.season_number != null) {
    const seasonDetails = await tvSeasonDetails(show.id, season.season_number);
    for (const episode of target.episodes) {
      const tmdbEpisode = (seasonDetails.episodes ?? []).find((entry) => entry.air_date && entry.air_date === (episode.broadcastDate ?? episode.date))
        ?? (seasonDetails.episodes ?? []).find((entry) => Number(entry.episode_number) === Number(episode.episodeNumber));
      if (tmdbEpisode?.overview && !episode.summary) episode.summary = tmdbEpisode.overview;
      if (tmdbEpisode?.name) episode.sourceTitle = tmdbEpisode.name;
      if (tmdbEpisode?.runtime && !episode.runtime) episode.runtime = `${tmdbEpisode.runtime} min`;
      if (tmdbEpisode?.id) episode.tmdbEpisodeId = tmdbEpisode.id;
      if (!tmdbEpisode?.still_path) continue;
      episode.stillUrl = `https://image.tmdb.org/t/p/w780${tmdbEpisode.still_path}`;
      episode.art = { ...(episode.art ?? {}), stillUrl: episode.stillUrl, stillSource: "tmdb-episode", tmdbEpisodeId: tmdbEpisode.id };
      stillsWritten += 1;
    }
    await delay(180);
  }
}

reference.generatedAt = new Date().toISOString();
await Promise.all([
  writeJsonAtomic(posterPath, posters),
  writeJsonAtomic(referencePath, reference),
]);
console.log(`Wrote ${written} wrestling season poster mappings and ${stillsWritten} episode still mappings.`);

function collectSeasonTargets(referenceDb, options) {
  const startYear = Number(options.startYear);
  const endYear = Number(options.endYear);
  const promotionId = options.promotionId;
  const seen = new Map();

  for (const episode of referenceDb.episodes ?? []) {
    if (episode.promotionId !== promotionId) continue;
    const year = Number(episode.date?.slice(0, 4));
    if (year < startYear || year > endYear) continue;
    const queryTitle = tmdbTitleForSeries(episode.seriesName, episode.promotionId);
    if (!queryTitle) continue;
    const cacheKey = `season-${promotionId}-${slug(episode.seriesName)}-${year}`;
    if (!seen.has(cacheKey)) {
      seen.set(cacheKey, {
        cacheKey,
        queryTitle,
        seriesName: episode.seriesName,
        year,
        seasonNumber: seasonNumberForSeries(queryTitle, year),
        episodes: [],
      });
    }
    seen.get(cacheKey).episodes.push(episode);
  }

  return [...seen.values()];
}

function tmdbTitleForSeries(seriesName = "", promotionId = "") {
  const normalized = seriesName.toLowerCase();
  if (promotionId === "tna" && normalized.includes("before the impact")) return "Before the Impact";
  if (promotionId === "tna" && normalized.includes("xplosion")) return "TNA Xplosion";
  if (promotionId === "tna" && (normalized.includes("weekly ppv") || normalized.includes("nwa-tna"))) return "NWA-TNA Weekly PPV";
  if (promotionId === "tna" && normalized.includes("impact")) return "TNA iMPACT!";
  if (promotionId === "wwe" && normalized.includes("saturday night's main event")) return "WWE Saturday Night's Main Event";
  if (promotionId === "wwe" && normalized.includes("evolve")) return "WWE Evolve";
  if (promotionId === "wwe" && normalized.includes("lfg")) return "WWE LFG: Legends & Future Greats";
  if (promotionId === "wwe" && normalized.includes("main event")) return "WWE Main Event";
  if (promotionId === "wcw" && normalized.includes("nitro")) return "WCW Monday Nitro";
  if (promotionId === "wcw" && normalized.includes("thunder")) return "WCW Thunder";
  if (promotionId === "wcw" && normalized.includes("saturday night")) return "WCW Saturday Night";
  if (promotionId === "wcw" && normalized.includes("worldwide")) return "WCW Worldwide";
  if (promotionId === "wcw" && normalized.includes("main event")) return "WCW Main Event";
  if (promotionId === "wcw" && normalized.includes("pro")) return "WCW Pro";
  if (promotionId === "wcw" && normalized.includes("power hour")) return "WCW Power Hour";
  if (normalized.includes("raw")) return "WWE Monday Night RAW";
  if (normalized.includes("smackdown")) return "WWE SmackDown";
  if (normalized.includes("nxt uk")) return "WWE NXT UK";
  if (normalized === "nxt" || normalized.includes("wwe nxt")) return "WWE NXT";
  if (normalized.includes("205 live")) return "WWE 205 Live";
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
  if (normalized === "dynamite" || normalized.includes("aew dynamite")) return "AEW Dynamite";
  if (normalized === "collision" || normalized.includes("aew collision")) return "AEW Collision";
  if (normalized === "rampage" || normalized.includes("aew rampage")) return "AEW Rampage";
  if (normalized === "dark" || normalized.includes("aew dark")) return "AEW Dark";
  if (normalized.includes("elevation")) return "AEW Dark: Elevation";
  if (normalized.includes("hardcore tv")) return "ECW Hardcore TV";
  if (normalized.includes("ecw on tnn") || normalized === "tnn") return "ECW on TNN";
  return null;
}

function seasonNumberForSeries(queryTitle, year) {
  if (queryTitle === "NWA-TNA Weekly PPV") return 1;
  if (queryTitle === "TNA Xplosion") return Math.max(1, year - 2001);
  return year;
}

function yearFromSeason(season) {
  const fromName = String(season.name ?? "").match(/\b(19|20)\d{2}\b/)?.[0];
  if (fromName) return Number(fromName);
  const airYear = String(season.air_date ?? "").slice(0, 4);
  return Number(airYear) || null;
}

async function searchTv(title) {
  const canonicalIds = {
    "WWE Monday Night RAW": 4656,
    "WWE SmackDown": 1549,
    "TNA Xplosion": 628,
    "NWA-TNA Weekly PPV": 25506,
  };
  if (canonicalIds[title]) return { id: canonicalIds[title] };
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
  return (json.results ?? []).find((result) => isPlausibleSeriesResult(title, result)) ?? null;
}

function isPlausibleSeriesResult(query, result) {
  const expected = slug(query).replace(/^(?:wwe|wwf)-/, "");
  const actual = slug(result?.name ?? result?.original_name ?? "").replace(/^(?:wwe|wwf)-/, "");
  if (!expected || !actual) return false;
  return actual === expected || actual.includes(expected) || expected.includes(actual);
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

async function tvSeasonDetails(tmdbId, seasonNumber) {
  const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.warn(`TMDB season details failed for ${tmdbId}/${seasonNumber}: ${response.status}`);
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

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
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
