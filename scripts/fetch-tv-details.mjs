import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const curatedManifestPath = path.join(root, "src", "curated-manifest.generated.json");
const outputPath = path.join(root, "src", "tv-detail.generated.json");
const specialsOverridesPath = path.join(root, "config", "tv-specials-overrides.json");
const args = new Set(process.argv.slice(2));
const refreshExisting = args.has("--refresh-existing") || args.has("--refresh-all");
const targetShowId = process.argv.find((arg) => arg.startsWith("--show-id="))?.split("=").slice(1).join("=") ?? null;

if (!hasTmdbCredentials()) {
  throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY before running this script.");
}

const existing = await readJson(outputPath, { shows: {} });
const manifest = await readJson(curatedManifestPath, { collections: {} });
const specialsOverrides = await readJson(specialsOverridesPath, { shows: {} });
const targetedExistingShow = targetShowId && existing.shows?.[targetShowId]
  ? [{
      id: targetShowId,
      title: existing.shows[targetShowId].title,
      year: existing.shows[targetShowId].year ?? (Number(String(existing.shows[targetShowId].firstAirDate ?? "").slice(0, 4)) || null),
      mediaType: "tv",
      genre: existing.shows[targetShowId].genre ?? existing.shows[targetShowId].genres?.[0] ?? "TV",
    }]
  : [];
const shows = dedupeShows([...extractManifestShows(manifest), ...targetedExistingShow]);
const hydrated = { ...(existing.shows ?? {}) };

for (const show of shows) {
  if (targetShowId && show.id !== targetShowId) continue;
  if (hydrated[show.id]?.matched && !refreshExisting) continue;
  const tmdb = await searchTv(show);
  if (!tmdb?.id) {
    hydrated[show.id] = { ...show, mediaType: "tv", matched: false };
    continue;
  }

  const details = await fetchTvDetails(tmdb.id);
  const seasons = await fetchSeasonDetails(tmdb.id, details.seasons ?? []);
  hydrated[show.id] = normalizeShow(show, details, seasons, specialsOverrides.shows?.[show.id]);
}

await writeFile(
  outputPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), source: "TMDB + curated manifest", shows: hydrated }, null, 2)}\n`,
);

console.log(`Wrote ${Object.keys(hydrated).length} TV detail records to ${outputPath}`);

function extractManifestShows(manifest) {
  return Object.entries(manifest.collections ?? {}).flatMap(([collectionId, collection]) =>
    (collection.sections ?? []).flatMap((section) =>
      (section.items ?? [])
        .filter((item) => (item.mediaType ?? "movie") === "tv")
        .map((item) => ({
          id: item.id ?? `curated-${slugify(item.title)}-${item.year ?? "tba"}`,
          title: item.title,
          year: item.year ? Number(item.year) : null,
          mediaType: "tv",
          genre: section.title,
          collectionId,
          seasonNumber: item.season ?? null,
        })),
    ),
  );
}

function dedupeShows(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

async function searchTv(show) {
  return (await searchTvWithYear(show)) ?? (await searchTvWithYear({ ...show, year: null }));
}

async function searchTvWithYear(show) {
  const url = new URL("https://api.themoviedb.org/3/search/tv");
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("query", show.title);
  if (show.year) url.searchParams.set("first_air_date_year", String(show.year));

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB TV search failed for ${show.title}: ${response.status}`);
  const json = await response.json();
  return json.results?.[0] ?? null;
}

async function fetchTvDetails(tmdbId) {
  const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("append_to_response", "content_ratings,external_ids");

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB TV detail fetch failed for ${tmdbId}: ${response.status}`);
  return response.json();
}

async function fetchSeasonDetails(tmdbId, seasons = []) {
  const hydrated = [];
  for (const season of seasons.filter((entry) => entry.season_number >= 0)) {
    const url = new URL(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}`);
    const headers = tmdbHeaders();
    if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
    url.searchParams.set("append_to_response", "credits");
    const response = await fetch(url, { headers });
    if (!response.ok) {
      hydrated.push(season);
      continue;
    }
    hydrated.push(await response.json());
  }
  return hydrated;
}
function normalizeShow(seed, details, hydratedSeasons = details.seasons ?? [], specialOverride = null) {
  const certification =
    details.content_ratings?.results?.find((entry) => entry.iso_3166_1 === "US")?.rating ??
    details.content_ratings?.results?.find((entry) => entry.rating)?.rating ??
    "NR";
  const seasons = (hydratedSeasons ?? [])
    .filter((season) => season.season_number >= 0)
    .map((season) => ({
      seasonNumber: season.season_number,
      title: season.season_number === 0 ? specialOverride?.seasonTitle || season.name || "Specials" : season.name || `Season ${season.season_number}`,
      overview: season.overview ?? "",
      airDate: season.air_date ?? null,
      episodeCount: season.episodes?.length ?? season.episode_count ?? null,
      posterUrl: season.poster_path ? `https://image.tmdb.org/t/p/w342${season.poster_path}` : null,
      cast: normalizeCast(season.credits?.cast ?? []),
      episodes: season.season_number === 0 && specialOverride?.episodes?.length
        ? buildAggregateSpecials(seed.id, season.episodes ?? [], specialOverride.episodes, details)
        : (season.episodes ?? []).map((episode) => normalizeEpisode(seed.id, episode, details)),
    }));

  return {
    id: seed.id,
    mediaType: "tv",
    status: "complete",
    matched: true,
    tmdbId: details.id,
    title: details.name ?? seed.title,
    year: seed.year ?? (Number(String(details.first_air_date ?? "").slice(0, 4)) || null),
    genre: seed.genre,
    tagline: details.tagline ?? "",
    overview: details.overview ?? "",
    summary: details.overview ?? "",
    firstAirDate: details.first_air_date ?? null,
    statusLabel: details.status ?? null,
    rating: certification,
    averageRuntime: details.episode_run_time?.[0] ?? null,
    genres: details.genres?.map((genre) => genre.name).filter(Boolean) ?? [seed.genre],
    posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : null,
    backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : null,
    ratings: {
      tmdb: details.vote_average ?? null,
      imdb: null,
      rottenTomatoes: null,
    },
    externalIds: details.external_ids ?? {},
    seasons,
    watchProgress: 0,
    inWatchlist: false,
    addedAt: seed.year ? `${seed.year}-01-01` : "2000-01-01",
  };
}

function buildAggregateSpecials(showId, tmdbEpisodes, overrides, details) {
  const byNumber = new Map(tmdbEpisodes.map((episode) => [Number(episode.episode_number), episode]));
  return overrides.map((override) => {
    const sources = (override.tmdbEpisodes ?? []).map((number) => byNumber.get(Number(number))).filter(Boolean);
    const first = sources[0] ?? null;
    const runtimes = sources.map((episode) => Number(episode.runtime)).filter(Number.isFinite);
    const overview = override.overview ?? sources.map((episode) => episode.overview).filter(Boolean).join(" ");
    const episodeNumber = Number(override.episodeNumber);
    return {
      id: `${showId}-s00-e${String(episodeNumber).padStart(2, "0")}`,
      seasonNumber: 0,
      episodeNumber,
      title: override.title || first?.name || `Special ${episodeNumber}`,
      overview,
      airDate: override.airDate ?? first?.air_date ?? null,
      runtime: runtimes.length ? runtimes.reduce((total, runtime) => total + runtime, 0) : details.episode_run_time?.[0] ?? null,
      stillUrl: first?.still_path ? `https://image.tmdb.org/t/p/w300${first.still_path}` : null,
      aggregate: sources.length > 1,
      tmdbEpisodeNumbers: sources.map((episode) => episode.episode_number),
    };
  });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeEpisode(showId, episode, details) {
  const seasonNumber = episode.season_number;
  const episodeNumber = episode.episode_number;
  return {
    id: `${showId}-s${String(seasonNumber).padStart(2, "0")}-e${String(episodeNumber).padStart(2, "0")}`,
    seasonNumber,
    episodeNumber,
    title: episode.name || `Episode ${episodeNumber}`,
    overview: episode.overview ?? "",
    airDate: episode.air_date ?? null,
    runtime: episode.runtime ?? details.episode_run_time?.[0] ?? null,
    stillUrl: episode.still_path ? `https://image.tmdb.org/t/p/w300${episode.still_path}` : null,
  };
}

function normalizeCast(cast = []) {
  return cast.slice(0, 24).map((person) => ({
    id: person.id ? `tmdb-person-${person.id}` : slugify(person.name ?? "person"),
    name: person.name ?? "Actor pending",
    role: person.character ?? "Character pending",
    character: person.character ?? "Character pending",
    profileUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
    order: person.order ?? 999,
  }));
}
function hasTmdbCredentials() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY);
}

function tmdbHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
