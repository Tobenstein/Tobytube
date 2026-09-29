import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const overridePath = path.join(root, "config", "metadata-overrides.json");
const args = parseArgs(process.argv.slice(2));
if (!hasTmdbAuth()) throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY.");

const reference = JSON.parse(await readFile(referencePath, "utf8"));
const posters = await readJson(posterPath, {});
const overrides = await readJson(overridePath, { items: {} });
const records = [...(reference.events ?? []), ...(args.eventsOnly ? [] : (reference.episodes ?? []))]
  .filter((record) => {
    const year = Number((record.date ?? "").slice(0, 4));
    return record.promotionId === args.promotion && year >= args.fromYear && year <= args.toYear;
  })
  .filter((record) => record.libraryVisible !== false);
const groups = groupTargets(records).filter((group) =>
  !group.records.every((record) => posters[record.id]?.posterUrl || hasManualArtwork(record)),
);
let matchedGroups = 0;
let mappedRecords = 0;
let searched = 0;

for (let start = 0; start < groups.length; start += args.concurrency) {
  const batch = groups.slice(start, start + args.concurrency);
  await Promise.all(batch.map(async (group) => {
    let match = null;
    let query = null;
    for (const candidate of buildQueries(group)) {
      const results = await searchMulti(candidate);
      searched += 1;
      match = bestMatch(results, candidate, group);
      query = candidate;
      if (match) break;
    }
    if (!match) return;
    for (const record of group.records) {
      if (hasManualArtwork(record)) continue;
      const confidence = titleScore(group.searchTitle, match.title ?? match.name ?? "");
      posters[record.id] = {
        source: "tmdb", tmdbId: match.id, mediaType: match.media_type,
        posterUrl: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : null,
        backdropUrl: match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : null,
        query, matchedTitle: match.title ?? match.name ?? null, matchedYear: mediaYear(match), confidence,
      };
      record.externalIds = { ...(record.externalIds ?? {}), tmdb: { id: match.id, mediaType: match.media_type } };
      if (!record.summary && match.overview && group.records.length === 1 && confidence >= 0.9) record.summary = match.overview;
      mappedRecords += 1;
    }
    matchedGroups += 1;
  }));
  if (start % (args.concurrency * 10) === 0) console.log(`${args.promotion.toUpperCase()} TMDB ${Math.min(start + batch.length, groups.length)}/${groups.length}: ${matchedGroups} groups matched.`);
  await delay(args.delay);
}

reference.generatedAt = new Date().toISOString();
await Promise.all([writeJsonAtomic(referencePath, reference), writeJsonAtomic(posterPath, posters)]);
console.log(`${args.promotion.toUpperCase()} TMDB: ${matchedGroups}/${groups.length} previously-unmapped groups matched, ${mappedRecords} records mapped after ${searched} searches.`);

function groupTargets(items) {
  const groups = new Map();
  for (const record of items) {
    const key = record.catalogSection === "tours" && record.tourName ? `tour:${normalize(record.tourName)}` : `record:${record.id}`;
    const current = groups.get(key) ?? { searchTitle: record.tourName || record.title, records: [] };
    current.records.push(record); groups.set(key, current);
  }
  return [...groups.values()];
}
function buildQueries(group) { const title = group.searchTitle.replace(/\s+-\s+Day\s+\d+\b.*$/i, "").trim(); const date = group.records[0]?.date ?? ""; const year = date.slice(0, 4); const impactEraTitle = args.promotion === "tna" && date >= "2017-03-02" && date <= "2024-01-13" ? title.replace(/^TNA\s+/i, "Impact Wrestling ") : title; const prefix = new RegExp(`^(?:${args.promotion}|Impact Wrestling)\\s+`, "i"); const without = impactEraTitle.replace(prefix, ""); return [...new Set([impactEraTitle, `${impactEraTitle} ${year}`, title, without].filter(Boolean))]; }
async function searchMulti(query) { for (let attempt = 1; attempt <= 3; attempt += 1) { const url = new URL("https://api.themoviedb.org/3/search/multi"); url.searchParams.set("query", query); url.searchParams.set("include_adult", "false"); const headers = tmdbHeaders(); if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY); const response = await fetch(url, { headers }); if (response.ok) return (await response.json()).results ?? []; if (response.status !== 429 || attempt === 3) return []; await delay(500 * attempt); } return []; }
function bestMatch(results, query, group) { const targetYear = Number(group.records[0]?.date?.slice(0, 4)); return results.filter((item) => ["movie", "tv"].includes(item.media_type) && item.poster_path).map((item) => { const score = Math.max(titleScore(group.searchTitle, item.title ?? item.name ?? ""), titleScore(query, item.title ?? item.name ?? "")); const year = Number(mediaYear(item)); const penalty = Number.isFinite(year) && Number.isFinite(targetYear) ? Math.min(Math.abs(year - targetYear) * 0.035, 0.2) : 0; return { item, score: score - penalty }; }).filter(({ score }) => score >= 0.62).sort((a, b) => b.score - a.score)[0]?.item ?? null; }
function titleScore(left, right) { const a = tokens(left), b = tokens(right); if (!a.size || !b.size) return 0; const common = [...a].filter((token) => b.has(token)).length; return (2 * common) / (a.size + b.size); }
function tokens(value) { const ignored = new Set(["njpw", "ajpw", "wwe", "aew", "tna", "roh", "new", "japan", "pro", "wrestling", "day", "in", "at", "the"]); return new Set(normalize(value).split(/\s+/).filter((token) => token && !ignored.has(token))); }
function normalize(value = "") { return String(value).toLowerCase().replace(/\b20\d{2}\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim(); }
function mediaYear(item) { return (item.release_date ?? item.first_air_date ?? "").slice(0, 4) || null; }
function hasTmdbAuth() { return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY); }
function hasManualArtwork(record) {
  const items = overrides.items ?? {};
  return [record.id, `library-${record.id}`].some((key) => {
    const override = items[key];
    return Boolean(override?.metadata?.posterUrl || override?.match?.posterUrl);
  });
}
function tmdbHeaders() { const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN; return token ? { Authorization: `Bearer ${token}` } : {}; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function readJson(filePath, fallback) { try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return fallback; } }
async function writeJsonAtomic(filePath, value) { const temporaryPath = `${filePath}.tmp`; await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`); await rename(temporaryPath, filePath); }
function parseArgs(raw) { const parsed = { promotion: "njpw", fromYear: 2010, toYear: 9999, concurrency: 8, delay: 180, eventsOnly: false }; for (let i = 0; i < raw.length; i += 1) { if (raw[i] === "--promotion") parsed.promotion = raw[++i]; if (raw[i] === "--from-year") parsed.fromYear = Number(raw[++i]); if (raw[i] === "--to-year") parsed.toYear = Number(raw[++i]); if (raw[i] === "--concurrency") parsed.concurrency = Number(raw[++i]); if (raw[i] === "--delay") parsed.delay = Number(raw[++i]); if (raw[i] === "--events-only") parsed.eventsOnly = true; } return parsed; }
