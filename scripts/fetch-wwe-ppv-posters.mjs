import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(path.join(root, ".env"));

const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const args = parseArgs(process.argv.slice(2));
const db = JSON.parse(await readFile(referencePath, "utf8"));
const posters = await readJson(posterPath, {});

if (!hasTmdbAuth()) throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY before running this script.");

const events = (db.events ?? [])
  .filter((event) => event.promotionId === "wwe")
  .filter((event) => event.libraryVisible !== false)
  .filter((event) => Number(event.date?.slice(0, 4)) >= args.fromYear)
  .filter((event) => /pay.?per.?view|premium live|special/i.test(event.eventType ?? "") || /^(?:WWE\s+|WWF\s+)?(?:WRESTLEMANIA|ROYAL RUMBLE|SUMMERSLAM|SURVIVOR SERIES|MONEY IN THE BANK|ELIMINATION CHAMBER|BACKLASH|EXTREME RULES|CROWN JEWEL|CLASH AT THE CASTLE|NIGHT OF CHAMPIONS|PAYBACK|FASTLANE|BAD BLOOD|BATTLEGROUND|EVOLUTION|DAY 1)\b/i.test(event.title))
  .sort((a, b) => a.date.localeCompare(b.date));

let written = 0;
for (const event of events) {
  if (event.nightCount === 2) {
    written += await writeNightPosterMappings(event);
  }

  if (posters[event.id]?.source === "tmdb") continue;
  const year = event.date?.slice(0, 4);
  const title = normalizeQueryTitle(event.title);
  const result = await searchMovie(title, year);
  if (!result?.poster_path) continue;
  posters[event.id] = {
    source: "tmdb",
    tmdbId: result.id,
    posterUrl: `https://image.tmdb.org/t/p/w342${result.poster_path}`,
  };
  written += 1;
  await sleep(120);
}

await writeFile(posterPath, `${JSON.stringify(posters, null, 2)}\n`);
console.log(`Wrote ${written} WWE PPV poster mappings for WrestleMania/Royal Rumble.`);

async function writeNightPosterMappings(event) {
  let count = 0;
  const nights = [
    { night: 1, day: "Saturday" },
    { night: 2, day: "Sunday" },
  ];

  for (const { night, day } of nights) {
    const key = `${event.id}-night-${night}`;
    const result = await searchMovieVariants(nightQueries(event.title, day), event.date?.slice(0, 4));
    if (!result?.poster_path) continue;
    posters[key] = {
      source: "tmdb-night",
      tmdbId: result.id,
      posterUrl: `https://image.tmdb.org/t/p/w342${result.poster_path}`,
      query: result.query,
    };
    count += 1;
    await sleep(120);
  }

  return count;
}

async function searchMovieVariants(queries, year) {
  for (const query of queries) {
    const result = await searchMovie(query, year);
    if (result?.poster_path) return { ...result, query };
    await sleep(120);
  }
  return null;
}

function nightQueries(title, day) {
  const cleanTitle = normalizeQueryTitle(title);
  const numberWord = day === "Saturday" ? "One" : "Two";
  const number = day === "Saturday" ? "1" : "2";
  return [
    `${cleanTitle}: ${day}`,
    `${cleanTitle} - ${day}`,
    `${cleanTitle} ${day}`,
    `${cleanTitle}: Night ${number}`,
    `${cleanTitle} - Night ${number}`,
    `${cleanTitle}: Night ${numberWord}`,
    `${cleanTitle}: Part ${number}`,
    `${cleanTitle} Part ${number}`,
    cleanTitle.replace(/\bXL\b/i, "40") + `: ${day}`,
    cleanTitle.replace(/\b40\b/i, "XL") + `: ${day}`,
  ];
}

function normalizeQueryTitle(title = "") {
  const clean = title.replace(/^WW[EF]\s+/i, "").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  return `WWE ${clean}`;
}

function parseArgs(rawArgs) {
  const parsed = { fromYear: 1985 };
  for (let index = 0; index < rawArgs.length; index += 1) {
    if (rawArgs[index] === "--from-year") parsed.fromYear = Number(rawArgs[++index]);
  }
  return parsed;
}

async function searchMovie(title, year) {
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  url.searchParams.set("query", title);
  if (year) url.searchParams.set("year", year);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.warn(`TMDB search failed for ${title}: ${response.status}`);
    return null;
  }
  const payload = await response.json();
  const results = payload.results ?? [];
  return (
    results.find((item) => item.poster_path && !/kickoff|pre[-\s]?show|countdown/i.test(item.title ?? item.name ?? "")) ??
    results.find((item) => item.poster_path) ??
    null
  );
}

function hasTmdbAuth() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY);
}

function tmdbHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function loadDotEnv(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Optional local file.
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
