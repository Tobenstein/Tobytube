import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "src", "data.js");
const appPath = path.join(root, "src", "app.js");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const outputPath = path.join(root, "src", "movie-detail.generated.json");
const curatedManifestPath = path.join(root, "src", "curated-manifest.generated.json");

if (!hasTmdbCredentials()) {
  throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY before running this script.");
}

const dataSource = await readFile(dataPath, "utf8");
const appSource = await readFile(appPath, "utf8");
const curatedManifest = await readJson(curatedManifestPath, { collections: {}, criterion: {} });
const movies = dedupeMovies([...extractMovies(dataSource), ...extractProfileMovies(appSource), ...extractManifestMovies(curatedManifest)]);
const posterManifest = await readJson(posterPath, {});
const existingDetails = await readJson(outputPath, { movies: {} });
const hydrated = { ...(existingDetails.movies ?? {}) };

let processed = 0;
for (const movie of movies) {
  if (hydrated[movie.id]?.matched) continue;
  try {
    const tmdbId = posterManifest[movie.id]?.tmdbId ?? (await searchMovie(movie))?.id;
    if (!tmdbId) {
      hydrated[movie.id] = { ...movie, matched: false };
      continue;
    }

    const details = await fetchMovieDetails(tmdbId);
    hydrated[movie.id] = normalizeMovie(movie, details);
  } catch (error) {
    console.warn(`Skipping ${movie.title}: ${error.message}`);
    hydrated[movie.id] = { ...movie, matched: false, error: error.message };
  } finally {
    processed += 1;
    if (processed % 25 === 0) await writeMovieDetails(hydrated);
  }
}

await writeMovieDetails(hydrated);

console.log(`Wrote ${Object.keys(hydrated).length} movie detail records to ${outputPath}`);

async function writeMovieDetails(movies) {
  const payload = `${JSON.stringify({ generatedAt: new Date().toISOString(), source: "TMDB", movies }, null, 2)}\n`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await writeFile(outputPath, payload);
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await sleep(250 * attempt);
    }
  }
}

function extractMovies(text) {
  return [...text.matchAll(/\["([^"]+)",\s*"([^"]+)",\s*(\d{4}),\s*"([^"]+)",\s*"([^"]+)"/g)].map(
    ([, id, title, year, country, genre]) => ({
      id,
      title,
      year: Number(year),
      country,
      genre,
    }),
  );
}

function extractProfileMovies(text) {
  return ["david-cronenberg", "wes-anderson"].flatMap((profileId) => {
    const profileStart = text.indexOf(`id: "${profileId}"`);
    if (profileStart === -1) return [];
    const nextProfile = text.indexOf("\n  {\n    id:", profileStart + 1);
    const block = text.slice(profileStart, nextProfile === -1 ? undefined : nextProfile);
    return [...block.matchAll(/curatedItem\("([^"]+)",\s*(\d{4})(?:,\s*"([^"]+)")?(?:,\s*"([^"]+)")?\)/g)]
      .map(([, title, year, mediaType = "movie", genre = "Collection"]) => ({
        id: `curated-${slugify(title)}-${year}`,
        title,
        year: Number(year),
        country: "Curated",
        genre,
        mediaType,
      }))
      .filter((item) => item.mediaType === "movie");
  });
}

function extractManifestMovies(manifest) {
  const collectionItems = Object.entries(manifest.collections ?? {}).flatMap(([collectionId, collection]) =>
    (collection.sections ?? []).flatMap((section) =>
      (section.items ?? []).map((item) => manifestMovie(item, section.title, collectionId)),
    ),
  );
  const criterionItems = ["noir", "directorShowcase", "boxedSets", "officialChannelCollections"].flatMap((bucket) =>
    (manifest.criterion?.[bucket] ?? []).flatMap((collection) =>
      (collection.items ?? []).map((item) => manifestMovie(item, collection.title, `criterion-${bucket}`)),
    ),
  );
  return [...collectionItems, ...criterionItems].filter((item) => item.mediaType === "movie");
}

function manifestMovie(item, genre = "Collection", collectionId = "curated") {
  return {
    id: item.id ?? `curated-${slugify(item.title)}-${item.year ?? "tba"}`,
    title: item.title,
    year: item.year ? Number(item.year) : null,
    country: "Curated",
    genre,
    mediaType: item.mediaType ?? "movie",
    collectionId,
  };
}

function dedupeMovies(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

async function searchMovie(movie) {
  return (await searchMovieWithYear(movie)) ?? (await searchMovieWithYear({ ...movie, year: null }));
}

async function searchMovieWithYear(movie) {
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("query", movie.title);
  if (movie.year) url.searchParams.set("year", String(movie.year));

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB search failed for ${movie.title}: ${response.status}`);
  const json = await response.json();
  return json.results?.[0] ?? null;
}

async function fetchMovieDetails(tmdbId) {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("append_to_response", "credits,release_dates,external_ids");

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB detail fetch failed for ${tmdbId}: ${response.status}`);
  return response.json();
}

function normalizeMovie(seed, details) {
  const director = details.credits?.crew?.find((person) => person.job === "Director");
  const certification = getCertification(details.release_dates?.results, "US") ?? getCertification(details.release_dates?.results);
  const countries = details.production_countries?.map((country) => country.name).filter(Boolean);
  const cast = (details.credits?.cast ?? []).slice(0, 30).map((person) => ({
    id: `tmdb-person-${person.id}`,
    tmdbId: person.id,
    name: person.name,
    role: person.character || "Cast",
    imageUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
  }));
  const crew = (details.credits?.crew ?? [])
    .filter((person) => person.job === "Director" || /Writing|Production/i.test(person.department ?? "") || /Writer|Screenplay|Story|Producer/i.test(person.job ?? ""))
    .map((person) => ({
      id: `tmdb-person-${person.id}`,
      tmdbId: person.id,
      name: person.name,
      job: person.job,
      department: person.department,
      imageUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
    }));
  const writers = [...new Set(crew.filter((person) => /Writing/i.test(person.department) || /Writer|Screenplay|Story/i.test(person.job)).map((person) => person.name))];
  const producers = [...new Set(crew.filter((person) => /Production/i.test(person.department) || /Producer/i.test(person.job)).map((person) => person.name))];

  return {
    id: seed.id,
    mediaType: "movie",
    status: "complete",
    matched: true,
    tmdbId: details.id,
    imdbId: details.external_ids?.imdb_id ?? null,
    title: details.title ?? seed.title,
    year: seed.year,
    genre: seed.genre,
    tagline: details.tagline ?? "",
    summary: details.overview ?? "",
    releaseDate: details.release_date ?? seed.year,
    country: countries?.length ? countries.join(", ") : seed.country,
    language: details.original_language?.toUpperCase() ?? null,
    director: director?.name ?? null,
    runtime: details.runtime ?? null,
    rating: certification ?? "NR",
    genres: details.genres?.map((genre) => genre.name).filter(Boolean) ?? [seed.genre],
    ratings: {
      tmdb: details.vote_average ?? null,
      imdb: null,
      rottenTomatoesCritic: null,
      rottenTomatoesAudience: null,
    },
    posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : null,
    backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : null,
    posterA: "#171717",
    posterB: "#c6a35d",
    posterCode: buildPosterCode(details.title ?? seed.title),
    watchProgress: 0,
    inWatchlist: false,
    addedAt: seed.year ? `${seed.year}-01-01` : "2000-01-01",
    cast,
    crew,
    writers,
    producers,
  };
}

function getCertification(releaseCountries = [], countryCode = null) {
  const country = countryCode
    ? releaseCountries.find((entry) => entry.iso_3166_1 === countryCode)
    : releaseCountries.find((entry) => entry.release_dates?.some((release) => release.certification));
  return country?.release_dates?.find((release) => release.certification)?.certification || null;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
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

function buildPosterCode(title) {
  return String(title)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
