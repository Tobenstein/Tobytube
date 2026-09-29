import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const args = parseArgs(process.argv.slice(2));

if (!hasTmdbAuth()) {
  throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY before running this script.");
}

const reference = await readJson(referencePath, {});
const posters = await readJson(posterPath, {});
const events = collectTargets(reference, args);
let written = 0;
let searched = 0;

for (const event of events) {
  if (posters[event.id]?.posterUrl) continue;
  let result = null;
  const queries = buildQueries(event);
  for (const query of queries) {
    result = await searchMovie(query.title, query.year);
    searched += 1;
    await delay(120);
    if (result?.poster_path) break;
  }
  if (!result?.poster_path) continue;
  posters[event.id] = {
    source: "tmdb",
    tmdbId: result.id,
    posterUrl: `https://image.tmdb.org/t/p/w342${result.poster_path}`,
    query: queries[0].title,
    matchedTitle: result.title ?? result.name ?? null,
  };
  written += 1;
}

await writeFile(posterPath, `${JSON.stringify(posters, null, 2)}\n`);
console.log(`Wrote ${written} ECW event poster mappings after ${searched} TMDB searches.`);

function collectTargets(referenceDb, options) {
  const startYear = Number(options.startYear);
  const endYear = Number(options.endYear);
  return (referenceDb.events ?? [])
    .filter((event) => event.promotionId === "ecw")
    .filter((event) => {
      const year = Number(event.date?.slice(0, 4));
      return year >= startYear && year <= endYear;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

function buildQueries(event) {
  const year = event.date?.slice(0, 4);
  const title = normalizeTitle(event.title);
  const withoutPrefix = title.replace(/^ECW\s+/i, "");
  return uniqueByTitle([
    { title, year },
    { title: `${title} ${year}`, year: null },
    { title: withoutPrefix, year },
    { title: `ECW ${withoutPrefix}`, year },
    { title: `Extreme Championship Wrestling ${withoutPrefix}`, year },
  ]);
}

function normalizeTitle(title = "") {
  return String(title).replace(/\s+/g, " ").trim();
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
  return (payload.results ?? []).find((item) => item.poster_path) ?? null;
}

function parseArgs(rawArgs) {
  const parsed = { startYear: "1989", endYear: "2001" };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--start-year") parsed.startYear = rawArgs[++index];
    if (arg === "--end-year") parsed.endYear = rawArgs[++index];
  }
  return parsed;
}

function uniqueByTitle(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = `${value.title}|${value.year ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(value.title);
  });
}

function hasTmdbAuth() {
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
