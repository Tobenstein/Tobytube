import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "src", "tv-detail.generated.json");
const showId = "bobs-burgers";
const tmdbId = 32726;

if (!hasTmdbCredentials()) {
  throw new Error("Set TMDB_READ_ACCESS_TOKEN, TMDB_BEARER_TOKEN, or TMDB_API_KEY before running this script.");
}

const existing = await readJson(outputPath, { shows: {} });
const current = existing.shows?.[showId] ?? { id: showId, title: "Bob's Burgers", mediaType: "tv" };
const details = await fetchTmdb(`/tv/${tmdbId}`, {
  append_to_response: "content_ratings,external_ids,aggregate_credits",
});

const seasons = [];
for (const season of details.seasons ?? []) {
  if (season.season_number <= 0) continue;
  const seasonDetails = await fetchTmdb(`/tv/${tmdbId}/season/${season.season_number}`, {
    append_to_response: "credits",
  });
  seasons.push(normalizeSeason(seasonDetails, details));
}

const hydrated = {
  ...current,
  id: showId,
  mediaType: "tv",
  status: "complete",
  matched: true,
  tmdbId,
  title: details.name ?? current.title ?? "Bob's Burgers",
  year: Number(String(details.first_air_date ?? "").slice(0, 4)) || current.year || 2011,
  genre: current.genre ?? "Animation",
  tagline: details.tagline ?? current.tagline ?? "",
  overview: details.overview ?? current.overview ?? "",
  summary: details.overview ?? current.summary ?? "",
  firstAirDate: details.first_air_date ?? current.firstAirDate ?? null,
  statusLabel: details.status ?? current.statusLabel ?? null,
  rating: getUsRating(details) ?? current.rating ?? "NR",
  averageRuntime: details.episode_run_time?.[0] ?? current.averageRuntime ?? null,
  genres: details.genres?.map((genre) => genre.name).filter(Boolean) ?? current.genres ?? ["Animation", "Comedy"],
  posterUrl: imageUrl("w342", details.poster_path) ?? current.posterUrl ?? null,
  backdropUrl: imageUrl("w780", details.backdrop_path) ?? current.backdropUrl ?? null,
  ratings: {
    tmdb: details.vote_average ?? current.ratings?.tmdb ?? null,
    imdb: current.ratings?.imdb ?? null,
    rottenTomatoes: current.ratings?.rottenTomatoes ?? null,
  },
  externalIds: details.external_ids ?? current.externalIds ?? {},
  cast: normalizeCast(details.aggregate_credits?.cast ?? details.credits?.cast ?? current.cast ?? []),
  seasons,
  watchProgress: current.watchProgress ?? 0,
  inWatchlist: current.inWatchlist ?? false,
  addedAt: current.addedAt ?? "2011-01-09",
};

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      ...existing,
      generatedAt: new Date().toISOString(),
      source: existing.source ?? "TMDB + curated manifest",
      shows: {
        ...(existing.shows ?? {}),
        [showId]: hydrated,
      },
    },
    null,
    2,
  )}\n`,
);

const episodeCount = hydrated.seasons.reduce((total, season) => total + season.episodes.length, 0);
console.log(`Hydrated ${hydrated.title}: ${hydrated.seasons.length} seasons, ${episodeCount} episodes.`);

function normalizeSeason(season, seriesDetails) {
  return {
    seasonNumber: season.season_number,
    title: season.name || `Season ${season.season_number}`,
    overview: season.overview ?? "",
    airDate: season.air_date ?? null,
    episodeCount: season.episodes?.length ?? season.episode_count ?? null,
    posterUrl: imageUrl("w342", season.poster_path) ?? imageUrl("w342", seriesDetails.poster_path),
    cast: normalizeCast(season.credits?.cast ?? []),
    episodes: (season.episodes ?? []).map((episode) => normalizeEpisode(episode, seriesDetails)),
  };
}

function normalizeEpisode(episode, seriesDetails) {
  const seasonNumber = episode.season_number;
  const episodeNumber = episode.episode_number;
  return {
    id: `${showId}-s${pad(seasonNumber)}-e${pad(episodeNumber)}`,
    seasonNumber,
    episodeNumber,
    title: episode.name || `Episode ${episodeNumber}`,
    overview: episode.overview ?? "",
    airDate: episode.air_date ?? null,
    runtime: episode.runtime ?? seriesDetails.episode_run_time?.[0] ?? null,
    stillUrl: imageUrl("w300", episode.still_path),
    voteAverage: episode.vote_average ?? null,
  };
}

function normalizeCast(cast) {
  return cast
    .map((member) => {
      const role =
        member.roles?.map((item) => item.character).filter(Boolean).join(" / ") ??
        member.character ??
        "";
      const profileUrl = imageUrl("w185", member.profile_path);
      return {
        name: member.name,
        role,
        character: role,
        profileUrl,
        imageUrl: profileUrl,
      };
    })
    .filter((member) => member.name)
    .slice(0, 24);
}

async function fetchTmdb(endpoint, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB request failed for ${endpoint}: ${response.status}`);
  return response.json();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function imageUrl(size, value) {
  return value ? `https://image.tmdb.org/t/p/${size}${value}` : null;
}

function getUsRating(details) {
  return (
    details.content_ratings?.results?.find((entry) => entry.iso_3166_1 === "US")?.rating ??
    details.content_ratings?.results?.find((entry) => entry.rating)?.rating ??
    null
  );
}

function hasTmdbCredentials() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY);
}

function tmdbHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pad(value) {
  return String(value).padStart(2, "0");
}
