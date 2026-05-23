import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "src", "data.js");

if (!hasTmdbCredentials()) {
  throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY before running this script.");
}

const source = await readFile(dataPath, "utf8");
const manifest = extractItems(source);
const hydrated = {};

for (const item of manifest) {
  const result = await searchTmdb(item);
  if (result?.poster_path) {
    hydrated[item.id] = {
      tmdbId: result.id,
      posterUrl: `https://image.tmdb.org/t/p/w342${result.poster_path}`,
    };
  }
}

const outputPath = path.join(root, "src", "tmdb-posters.generated.json");
await writeFile(outputPath, `${JSON.stringify(hydrated, null, 2)}\n`);
console.log(`Wrote ${Object.keys(hydrated).length} poster mappings to ${outputPath}`);

function extractItems(text) {
  const movieRows = [...text.matchAll(/\["([^"]+)",\s*"([^"]+)",\s*(\d{4}),/g)].map(
    ([, id, title, year]) => ({ id, title, year, tmdbType: "movie" }),
  );

  const tvBlocks = [...text.matchAll(/id:\s*"([^"]+)",\s*\n\s*title:\s*"([^"]+)"/g)].map(
    ([, id, title]) => ({ id, title, tmdbType: "tv" }),
  );

  return [...movieRows, ...tvBlocks].filter((item) =>
    ["movie", "tv"].includes(item.tmdbType),
  );
}

async function searchTmdb(item) {
  const endpoint = item.tmdbType === "movie" ? "movie" : "tv";
  const url = new URL(`https://api.themoviedb.org/3/search/${endpoint}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("query", item.title);
  if (item.year && item.tmdbType === "movie") {
    url.searchParams.set("year", item.year);
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`TMDB search failed for ${item.title}: ${response.status}`);
  }

  const json = await response.json();
  return json.results?.[0] ?? null;
}

function hasTmdbCredentials() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY);
}

function tmdbHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
