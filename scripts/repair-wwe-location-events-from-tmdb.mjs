import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const reference = JSON.parse(await readFile(referencePath, "utf8"));
const posters = JSON.parse(await readFile(posterPath, "utf8"));
const candidates = [...(reference.events ?? []), ...(reference.episodes ?? [])].filter(isLocationPlaceholder);
const resultsByYear = new Map();
let repaired = 0;

for (const event of candidates) {
  const year = Number(event.date?.slice(0, 4));
  if (!resultsByYear.has(year)) resultsByYear.set(year, await searchWweMovies(year));
  const result = resultsByYear.get(year).find((item) => item.release_date === event.date && item.poster_path && !/kickoff|pre[-\s]?show|countdown/i.test(item.title ?? ""));
  if (!result) continue;
  event.title = result.title;
  event.name = result.title;
  event.displayTitle = result.title;
  event.externalIds = { ...(event.externalIds ?? {}), tmdb: result.id };
  posters[event.id] = {
    source: "tmdb",
    tmdbId: result.id,
    posterUrl: `https://image.tmdb.org/t/p/w342${result.poster_path}`,
  };
  repaired += 1;
}

reference.generatedAt = new Date().toISOString();
await Promise.all([
  writeFile(referencePath, `${JSON.stringify(reference, null, 2)}\n`),
  writeFile(posterPath, `${JSON.stringify(posters, null, 2)}\n`),
]);
console.log(`Repaired ${repaired} WWE event titles and posters that had been replaced by location labels.`);

function isLocationPlaceholder(event) {
  if (event.promotionId !== "wwe" || Number(event.date?.slice(0, 4)) < 1985) return false;
  if (!/special|pay.?per.?view|premium live/i.test(event.eventType ?? "")) return false;
  if (!/^WW[EF]\s+/i.test(event.title ?? "")) return false;
  return !/WrestleMania|Royal Rumble|SummerSlam|Survivor Series|Raw|SmackDown|NXT|Backlash|Judgment Day|Vengeance|No Mercy|Armageddon|Money in the Bank|Elimination Chamber|Extreme Rules|Night of Champions|Payback|Fastlane|TLC|Crown Jewel|Clash|Bash|Cyber Sunday|Taboo Tuesday|New Year|Over the Limit|Breaking Point|Bragging Rights|Fatal 4-Way|Capitol Punishment|Battleground|Hell in a Cell/i.test(event.title ?? "");
}

async function searchWweMovies(year) {
  const collected = [];
  for (let page = 1; page <= 5; page += 1) {
    const url = new URL("https://api.themoviedb.org/3/search/movie");
    url.searchParams.set("query", "WWE");
    url.searchParams.set("year", String(year));
    url.searchParams.set("page", String(page));
    const headers = tmdbHeaders();
    if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
    const response = await fetch(url, { headers });
    if (!response.ok) break;
    const payload = await response.json();
    collected.push(...(payload.results ?? []));
    if (page >= Number(payload.total_pages ?? 1)) break;
  }
  return collected;
}

function tmdbHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
