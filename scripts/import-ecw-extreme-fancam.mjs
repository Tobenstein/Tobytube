import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "src", "ecw-extreme-fancam.generated.json");
const posterCachePath = path.join(root, "src", "tmdb-posters.generated.json");
const showId = 127378;

loadEnvFile();

const show = await fetchTmdb(`/tv/${showId}`, { append_to_response: "external_ids" });
const seasons = [];
for (const season of (show.seasons ?? []).filter((entry) => entry.season_number > 0)) {
  seasons.push(await fetchTmdb(`/tv/${showId}/season/${season.season_number}`, { append_to_response: "external_ids" }));
}

const items = seasons.flatMap((season) => {
  const year = seasonYear(season);
  const seasonPosterUrl = imageUrl(season.poster_path, "w500") ?? imageUrl(show.poster_path, "w500");
  return (season.episodes ?? []).map((episode) => {
    const parsedMatches = parseMatchCard(episode.overview);
    return {
    id: `library-ecw-extreme-fancam-${episode.id}`,
    referenceId: `ecw-extreme-fancam-${episode.id}`,
    recordType: "episode",
    mediaType: "wrestling",
    promotionId: "ecw",
    promotionName: "Extreme Championship Wrestling",
    series: "ECW Extreme Fancam",
    seriesId: "ecw-extreme-fancam",
    title: episode.name || `ECW Extreme Fancam ${episode.episode_number}`,
    displayTitle: episode.name || `ECW Extreme Fancam ${episode.episode_number}`,
    season: year,
    seasonNumber: season.season_number,
    year,
    episodeNumber: episode.episode_number,
    date: episode.air_date ?? season.air_date ?? `${year}-01-01`,
    eventType: "Home Video",
    eventLabel: "Extreme Fancam",
    catalogSection: "extreme-fancam",
    summary: summaryWithoutMatchCard(episode.overview, parsedMatches),
    sourceSummary: episode.overview ?? "",
    matches: parsedMatches,
    matchCount: parsedMatches.length,
    posterUrl: seasonPosterUrl,
    stillUrl: imageUrl(episode.still_path, "w780"),
    tmdbId: episode.id,
    tmdbShowId: showId,
    art: {
      posterUrl: seasonPosterUrl,
      stillUrl: imageUrl(episode.still_path, "w780"),
      source: "tmdb-season-and-episode",
      tmdbId: episode.id,
      seasonNumber: season.season_number,
      seasonName: season.name,
    },
    status: "dummy",
    source: "tmdb-ecw-extreme-fancam",
    posterCode: "EF",
    posterA: "#17111f",
    posterB: "#8b2fc9",
    };
  });
});

const posterCache = await readJson(posterCachePath, {});
for (const season of seasons) {
  const year = seasonYear(season);
  const posterUrl = imageUrl(season.poster_path, "w500") ?? imageUrl(show.poster_path, "w500");
  if (!posterUrl) continue;
  posterCache[`season-ecw-ecw-extreme-fancam-${year}`] = {
    posterUrl,
    source: "tmdb-season",
    tmdbId: showId,
    seasonNumber: season.season_number,
    seasonName: season.name,
  };
}

await writeFile(outputPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "TMDB TV 127378",
  show: { id: showId, title: show.name, posterUrl: imageUrl(show.poster_path, "w500") },
  years: [...new Set(items.map((item) => item.year))].sort((a, b) => a - b),
  items: items.sort((a, b) => a.date.localeCompare(b.date) || a.episodeNumber - b.episodeNumber),
}, null, 2)}\n`);
await writeFile(posterCachePath, `${JSON.stringify(posterCache, null, 2)}\n`);
console.log(`ECW Extreme Fancam: ${items.length} releases across ${new Set(items.map((item) => item.year)).size} years.`);

function seasonYear(season) {
  const named = String(season.name ?? "").match(/\b(19\d{2}|20\d{2})\b/)?.[1];
  const aired = String(season.air_date ?? season.episodes?.find((episode) => episode.air_date)?.air_date ?? "").slice(0, 4);
  return Number(named ?? aired ?? 0);
}

function imageUrl(value, size) {
  return value ? `https://image.tmdb.org/t/p/${size}${value}` : null;
}

function parseMatchCard(summary = "") {
  const source = String(summary);
  const normalized = source.replace(/\s+/g, " ").trim();
  const matches = [];
  const pattern = /(?:^|\s)(\d{1,2})[.)]\s+(.+?)(?=\s+\d{1,2}[.)]\s+|$)/g;
  let result;
  while ((result = pattern.exec(normalized))) {
    const entry = matchCardEntry(result[2], matches.length + 1);
    if (entry) matches.push(entry);
  }
  if (matches.length) return matches;
  source
    .split(/\r?\n+|\s{2,}(?=(?:"|[A-Z]))/)
    .map((entry) => entry.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean)
    .forEach((text) => {
      const entry = matchCardEntry(text, matches.length + 1);
      if (entry) matches.push(entry);
    });
  return matches;
}

function matchCardEntry(value, order) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!/\b(?:vs\.?|versus)\b/i.test(text)) return null;
  const stipulation = text.match(/\(([^)]+(?:match|rules|challenge|battle|rumble|clipped|cut off)[^)]*)\)\s*$/i)?.[1] ?? "Match";
  return { order, match: text, stipulation, spoilerSafe: true };
}

function summaryWithoutMatchCard(summary = "", matches = []) {
  const normalized = String(summary).replace(/\s+/g, " ").trim();
  if (!matches.length) return normalized;
  const firstMatch = normalized.search(/(?:^|\s)1[.)]\s+/);
  const introduction = firstMatch > 0 ? normalized.slice(0, firstMatch).trim() : "";
  return introduction || "Home-video release from ECW Extreme Fancam.";
}

async function fetchTmdb(pathname, parameters = {}) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) throw new Error("TMDB credentials are not configured");
  const url = new URL(`https://api.themoviedb.org/3${pathname}`);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("language", "en-US");
  if (!token && apiKey) url.searchParams.set("api_key", apiKey);
  const response = await fetch(url, { headers: token ? { authorization: `Bearer ${token}`, accept: "application/json" } : { accept: "application/json" } });
  if (!response.ok) throw new Error(`TMDB returned ${response.status} for ${pathname}`);
  return response.json();
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return fallback; }
}
