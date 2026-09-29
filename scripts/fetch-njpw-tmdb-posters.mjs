import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
if (!hasTmdbAuth()) throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY before running this script.");

const reference = JSON.parse(await readFile(referencePath, "utf8"));
const posters = await readJson(posterPath, {});
const events = (reference.events ?? []).filter((event) => event.promotionId === "njpw" && /^202[456]-/.test(event.date ?? ""));
const groups = groupTargets(events);
let matchedGroups = 0;
let mappedEvents = 0;
let searched = 0;

for (const group of groups) {
  if (group.events.every((event) => posters[event.id]?.posterUrl)) continue;
  let match = null;
  let matchedQuery = null;
  for (const query of buildQueries(group)) {
    const results = await searchMulti(query);
    searched += 1;
    match = bestMatch(results, query, group);
    matchedQuery = query;
    if (match) break;
    await delay(130);
  }
  if (!match) continue;
  const year = mediaYear(match);
  for (const event of group.events) {
    posters[event.id] = {
      source: "tmdb",
      tmdbId: match.id,
      mediaType: match.media_type,
      posterUrl: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : null,
      backdropUrl: match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : null,
      query: matchedQuery,
      matchedTitle: match.title ?? match.name ?? null,
      matchedYear: year,
      confidence: titleScore(group.searchTitle, match.title ?? match.name ?? ""),
    };
    event.externalIds = { ...(event.externalIds ?? {}), tmdb: { id: match.id, mediaType: match.media_type } };
    if (!event.summary && match.overview && group.events.length === 1 && posters[event.id].confidence >= 0.85) event.summary = match.overview;
    mappedEvents += 1;
  }
  matchedGroups += 1;
  if (matchedGroups % 10 === 0) console.log(`TMDB checkpoint: ${matchedGroups} groups matched / ${mappedEvents} event mappings.`);
}

for (const event of events) {
  const mapping = posters[event.id];
  if (event.externalIds?.tmdb && (event.catalogSection === "tours" || (mapping?.confidence ?? 0) < 0.85)) event.summary = null;
}

reference.generatedAt = new Date().toISOString();
await Promise.all([
  writeFile(referencePath, `${JSON.stringify(reference, null, 2)}\n`),
  writeFile(posterPath, `${JSON.stringify(posters, null, 2)}\n`),
]);
console.log(`TMDB NJPW enrichment: ${matchedGroups}/${groups.length} groups matched, ${mappedEvents}/${events.length} event posters mapped after ${searched} searches.`);

function groupTargets(records) {
  const groups = new Map();
  for (const event of records) {
    const key = event.catalogSection === "tours" && event.tourName ? `tour:${normalize(event.tourName)}` : `event:${event.id}`;
    const current = groups.get(key) ?? { searchTitle: event.tourName || event.title, events: [] };
    current.events.push(event);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => a.searchTitle.localeCompare(b.searchTitle));
}

function buildQueries(group) {
  const year = group.events[0]?.date?.slice(0, 4);
  const title = group.searchTitle.replace(/\s+-\s+Day\s+\d+\b.*$/i, "").trim();
  const withoutPrefix = title.replace(/^NJPW\s+/i, "");
  return [...new Set([title, `${title} ${year}`, withoutPrefix, `New Japan Pro Wrestling ${withoutPrefix}`].filter(Boolean))];
}

async function searchMulti(query) {
  const url = new URL("https://api.themoviedb.org/3/search/multi");
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB search failed (${response.status}) for ${query}`);
  return (await response.json()).results ?? [];
}

function bestMatch(results, query, group) {
  const targetYear = Number(group.events[0]?.date?.slice(0, 4));
  return results
    .filter((item) => ["movie", "tv"].includes(item.media_type) && item.poster_path)
    .map((item) => {
      const score = Math.max(titleScore(group.searchTitle, item.title ?? item.name ?? ""), titleScore(query, item.title ?? item.name ?? ""));
      const year = Number(mediaYear(item));
      const yearPenalty = Number.isFinite(year) && Number.isFinite(targetYear) ? Math.min(Math.abs(year - targetYear) * 0.04, 0.2) : 0;
      return { item, score: score - yearPenalty };
    })
    .filter(({ score }) => score >= 0.58)
    .sort((a, b) => b.score - a.score)[0]?.item ?? null;
}

function titleScore(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return (2 * intersection) / (a.size + b.size);
}
function tokens(value) { return new Set(normalize(value).split(/\s+/).filter((token) => token && !new Set(["njpw", "new", "japan", "pro", "wrestling", "day", "in", "at", "the"]).has(token))); }
function normalize(value = "") { return String(value).toLowerCase().replace(/\b20\d{2}\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim(); }
function mediaYear(item) { return (item.release_date ?? item.first_air_date ?? "").slice(0, 4) || null; }
function hasTmdbAuth() { return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY); }
function tmdbHeaders() { const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN; return token ? { Authorization: `Bearer ${token}` } : {}; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function readJson(filePath, fallback) { try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return fallback; } }
