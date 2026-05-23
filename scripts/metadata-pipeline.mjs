import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getYearEvents,
  movies,
  promotions,
  tvShows,
  years,
} from "../src/data.js";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = {
  metadataOut: path.join(root, "src", "metadata.generated.json"),
  posterOut: path.join(root, "src", "tmdb-posters.generated.json"),
  referenceDb: path.join(root, "src", "wrestling-reference.generated.json"),
};
const videoExtensions = new Set([".mkv", ".mp4", ".avi", ".mov", ".m4v", ".webm"]);
const weeklyProviderQueries = {
  "Monday Night Raw": { tmdbType: "tv", title: "WWE Monday Night RAW", year: 1993 },
  SmackDown: { tmdbType: "tv", title: "WWE SmackDown", year: 1999 },
  "Sunday Night Heat": { tmdbType: "tv", title: "WWF Sunday Night Heat", year: 1998 },
  Jakked: { tmdbType: "tv", title: "WWF Jakked", year: 1999 },
  "Monday Nitro": { tmdbType: "tv", title: "WCW Monday Nitro", year: 1995 },
  Thunder: { tmdbType: "tv", title: "WCW Thunder", year: 1998 },
  "WCW Saturday Night": { tmdbType: "tv", title: "WCW Saturday Night", year: 1992 },
};
const args = parseArgs(process.argv.slice(2));

const posterCache = await readJson(args.posterOut ?? defaults.posterOut, {});
const wrestlingReference = await readJson(args.referenceDb ?? defaults.referenceDb, {});
const scannedFiles = (
  await Promise.all(args.mediaRoots.map((mediaRoot) => scanMediaRoot(mediaRoot)))
).flat();
const parsedFiles = scannedFiles.map(parseMediaFile);
const seedRecords = buildSeedRecords(posterCache);
const matches = matchFiles(parsedFiles, seedRecords);
const unmatchedFiles = parsedFiles.filter((file) => !matches.some((match) => match.file.path === file.path));
const records = seedRecords.map((record) => {
  const matchedFiles = matches
    .filter((match) => match.record.id === record.id)
    .map((match) => ({
      path: match.file.path,
      confidence: match.confidence,
      parsed: match.file.parsed,
    }));

  return {
    ...applyWrestlingReference(record, wrestlingReference),
    files: matchedFiles,
    matchState: matchedFiles.length ? "matched" : record.matchState,
  };
});

if (args.refreshProviders) {
  await hydrateProviders(records, posterCache);
  await writeFile(args.posterOut ?? defaults.posterOut, `${JSON.stringify(posterCache, null, 2)}\n`);
}

const output = {
  generatedAt: new Date().toISOString(),
  mediaRoots: args.mediaRoots.map((mediaRoot) => path.resolve(mediaRoot)),
  mediaRoot: args.mediaRoots[0] ? path.resolve(args.mediaRoots[0]) : null,
  stats: {
    records: records.length,
    filesScanned: parsedFiles.length,
    filesMatched: matches.length,
    filesUnmatched: unmatchedFiles.length,
    posters: Object.keys(posterCache).length,
  },
  records,
  unmatchedFiles: unmatchedFiles.map((file) => ({
    path: file.path,
    parsed: file.parsed,
  })),
};

await writeFile(args.metadataOut ?? defaults.metadataOut, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `Metadata: ${output.stats.records} records, ${output.stats.filesMatched}/${output.stats.filesScanned} files matched, ${output.stats.posters} posters.`,
);

function buildSeedRecords(posters) {
  const movieRecords = movies.map((movie) => ({
    id: movie.id,
    mediaType: "movie",
    title: movie.title,
    year: movie.year,
    sortTitle: sortTitle(movie.title),
    country: movie.country,
    genre: movie.genre,
    status: movie.status,
    providerQuery: {
      tmdbType: "movie",
      title: movie.title,
      year: movie.year,
    },
    art: buildArt(movie, posters),
    matchState: movie.status === "unmatched" ? "needs-review" : "seeded",
    source: "seed",
  }));

  const tvRecords = tvShows.map((show) => ({
    id: show.id,
    mediaType: "tv",
    title: show.title,
    years: show.years,
    sortTitle: sortTitle(show.title),
    country: show.country,
    status: show.status,
    seasonsAvailable: show.seasonsAvailable,
    episodesAvailable: show.episodesAvailable,
    episodesTotal: show.episodesTotal,
    episodes: show.episodes ?? [],
    providerQuery: {
      tmdbType: "tv",
      title: show.title,
    },
    art: buildArt(show, posters),
    matchState: show.status === "unmatched" ? "needs-review" : "seeded",
    source: "seed",
  }));

  const promotionRecords = promotions.map((promotion) => ({
    id: `promotion-${promotion.id}`,
    mediaType: "promotion",
    title: promotion.name,
    sortTitle: promotion.name,
    summary: promotion.summary,
    shows: promotion.shows.map((show) => show.name),
    eventCount: promotion.ppvs.length,
    art: {
      logoUrl: promotion.logoUrl,
      posterUrl: promotion.logoUrl,
      source: "wikipedia",
    },
    matchState: promotion.ppvs.length || promotion.shows.length ? "seeded" : "placeholder",
    source: "seed",
  }));

  const wrestlingRecords = promotions.flatMap((promotion) =>
    years.flatMap((year) =>
      getYearEvents(promotion, year)
        .filter((event) => event.type !== "weekly" || event.episodeNumber <= 3)
        .map((event) => {
          const id = `wrestling-${promotion.id}-${event.id}`;
          return {
            id,
            mediaType: "wrestling",
            title: event.type === "weekly" ? event.showName : event.title,
            sortTitle: sortTitle(event.type === "weekly" ? event.showName : event.title),
            date: event.date,
            year: event.year,
            promotion: promotion.name,
            series: event.showName ?? null,
            eventType: event.type,
            season: event.season ?? event.year,
            episodeNumber: event.episodeNumber,
            providerQuery: {
              ...providerQueryForWrestlingEvent(promotion, event),
            },
            art: buildWrestlingArt(id, promotion, posters),
            matchState: "seeded",
            source: "generated-schedule",
          };
        }),
    ),
  );

  return [...movieRecords, ...tvRecords, ...promotionRecords, ...wrestlingRecords];
}

function buildArt(item, posters) {
  const cached = posters[item.id];
  return {
    posterUrl: cached?.posterUrl ?? item.posterUrl ?? null,
    source: cached?.source ?? (item.posterUrl ? "seed" : "fallback"),
    page: cached?.page ?? null,
    fallbackCode: item.posterCode,
    colors: [item.posterA, item.posterB],
  };
}

function buildWrestlingArt(id, promotion, posters) {
  const cached = posters[id];
  return {
    posterUrl: cached?.posterUrl ?? promotion.logoUrl,
    logoUrl: promotion.logoUrl,
    source: cached?.source ?? "promotion-logo",
    page: cached?.page ?? null,
    colors: cached ? [null, null] : promotion.colors,
  };
}

function applyWrestlingReference(record, referenceDb) {
  if (record.mediaType !== "wrestling") return record;

  const reference =
    findReferenceEpisode(record, referenceDb.episodes ?? []) ??
    findReferenceEvent(record, referenceDb.events ?? []);
  if (!reference) return record;

  return {
    ...record,
    referenceId: reference.id,
    venue: reference.venue ?? record.venue ?? null,
    location: reference.location ?? record.location ?? null,
    attendance: reference.attendance ?? record.attendance ?? null,
    tagline: reference.tagline ?? record.tagline ?? null,
    summary: reference.summary ?? record.summary ?? null,
    source: "reference-db",
    referenceSourceIds: reference.sourceIds ?? [],
    matchState: "reference-matched",
  };
}

function findReferenceEpisode(record, episodes) {
  return episodes.find(
    (episode) =>
      normalize(episode.promotion) === normalize(record.promotion) &&
      normalize(episode.series) === normalize(record.series) &&
      episode.date === record.date,
  );
}

function findReferenceEvent(record, events) {
  return events.find(
    (event) =>
      normalize(event.promotion) === normalize(record.promotion) &&
      normalize(event.title) === normalize(record.title) &&
      event.date === record.date,
  );
}

async function hydrateProviders(records, posters) {
  if (!hasTmdbCredentials()) {
    console.warn("TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY is not set; provider refresh skipped.");
    return;
  }

  const queryCache = new Map();
  for (const record of records) {
    if (!["movie", "tv", "wrestling"].includes(record.mediaType) || posters[record.id]?.source === "tmdb") continue;
    const key = JSON.stringify(record.providerQuery);
    const cached = queryCache.get(key);
    const tmdb = cached ?? (await searchTmdb(record.providerQuery));
    if (!queryCache.has(key)) {
      queryCache.set(key, tmdb);
      await delay(180);
    }
    if (!tmdb?.poster_path) continue;

    posters[record.id] = {
      source: "tmdb",
      tmdbId: tmdb.id,
      posterUrl: `https://image.tmdb.org/t/p/w342${tmdb.poster_path}`,
    };
    record.art = buildArt(record, posters);
  }
}

async function searchTmdb(query) {
  const url = new URL(`https://api.themoviedb.org/3/search/${query.tmdbType}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("query", query.title);
  if (query.year && query.tmdbType === "movie") url.searchParams.set("year", query.year);
  if (query.year && query.tmdbType === "tv") url.searchParams.set("first_air_date_year", query.year);

  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.warn(`TMDB ${query.tmdbType} search failed for ${query.title}: ${response.status}`);
    return null;
  }

  const json = await response.json();
  return json.results?.[0] ?? null;
}

function providerQueryForWrestlingEvent(promotion, event) {
  if (event.type === "weekly") {
    return weeklyProviderQueries[event.showName] ?? {
      tmdbType: "tv",
      title: `${promotion.name} ${event.showName}`,
      year: event.year,
    };
  }

  return {
    tmdbType: "movie",
    title: `${promotion.name} ${event.title}`,
    year: event.year,
  };
}

function hasTmdbCredentials() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY);
}

function tmdbHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function scanMediaRoot(mediaRoot) {
  const absoluteRoot = path.resolve(mediaRoot);
  const found = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile() || !videoExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const details = await stat(fullPath);
      found.push({
        path: fullPath,
        relativePath: path.relative(absoluteRoot, fullPath),
        size: details.size,
        modifiedAt: details.mtime.toISOString(),
      });
    }
  }

  await visit(absoluteRoot);
  return found;
}

function parseMediaFile(file) {
  const parsedPath = path.parse(file.relativePath ?? file.path);
  const cleanName = cleanTitle(parsedPath.name);
  const parts = (file.relativePath ?? file.path).split(/[\\/]/).map(cleanTitle);
  const seasonEpisode = parsedPath.name.match(/s(\d{1,2})e(\d{1,3})/i);
  const date = parsedPath.name.match(/(19|20)\d{2}[ ._-]\d{2}[ ._-]\d{2}/)?.[0]?.replace(/[ ._]/g, "-");
  const year = Number(parsedPath.name.match(/\b(19|20)\d{2}\b/)?.[0]);

  let mediaType = "movie";
  if (seasonEpisode) mediaType = "tv";
  if (date || parts.some((part) => /\b(wwe|wwf|wcw|ecw|aew|njpw)\b/i.test(part))) {
    mediaType = "wrestling";
  }

  return {
    ...file,
    parsed: {
      mediaType,
      title: inferTitle(parts, cleanName, mediaType, year),
      year: Number.isFinite(year) ? year : null,
      date: date ?? null,
      season: seasonEpisode ? Number(seasonEpisode[1]) : null,
      episode: seasonEpisode ? Number(seasonEpisode[2]) : null,
      promotion: inferPromotion(parts),
    },
  };
}

function matchFiles(files, records) {
  const matches = [];

  for (const file of files) {
    const scored = records
      .filter((record) => record.mediaType === file.parsed.mediaType)
      .map((record) => ({
        record,
        confidence: scoreMatch(file.parsed, record),
      }))
      .filter((candidate) => candidate.confidence >= 0.62)
      .sort((a, b) => b.confidence - a.confidence);

    if (scored[0]) {
      matches.push({
        file,
        record: scored[0].record,
        confidence: Number(scored[0].confidence.toFixed(2)),
      });
    }
  }

  return matches;
}

function scoreMatch(parsed, record) {
  const titleScore = similarity(normalize(parsed.title), normalize(record.title));
  const yearScore = parsed.year && record.year ? (parsed.year === record.year ? 0.25 : -0.2) : 0;
  const promotionScore =
    parsed.promotion && record.promotion
      ? normalize(parsed.promotion) === normalize(record.promotion)
        ? 0.2
        : -0.1
      : 0;
  const episodeScore =
    parsed.season && record.season && parsed.episode && record.episodeNumber
      ? parsed.season === record.season && parsed.episode === record.episodeNumber
        ? 0.25
        : 0
      : 0;

  return Math.max(0, Math.min(1, titleScore + yearScore + promotionScore + episodeScore));
}

function inferTitle(parts, fileName, mediaType, year) {
  if (mediaType === "tv") {
    const showFolder = parts.at(-3) ?? parts.at(-2);
    return stripYear(showFolder ?? fileName);
  }
  if (mediaType === "wrestling") {
    return stripDate(fileName)
      .replace(/\b(wwe|wwf|wcw|ecw|aew|njpw)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return stripYear(fileName, year);
}

function inferPromotion(parts) {
  const joined = parts.join(" ");
  const match = joined.match(/\b(wwe|wwf|wcw|ecw|aew|njpw)\b/i);
  if (!match) return null;
  return match[1].toUpperCase() === "WWF" ? "WWE" : match[1].toUpperCase();
}

function cleanTitle(value) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\[[^\]]+\]|\([^)]+\)$/g, " ")
    .replace(/\b(720p|1080p|2160p|bluray|webrip|x264|x265|h264|h265|aac|dts)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripYear(value, explicitYear = null) {
  const yearPattern = explicitYear ? new RegExp(`\\b${explicitYear}\\b`) : /\b(19|20)\d{2}\b/;
  return value.replace(yearPattern, "").replace(/\s+/g, " ").trim();
}

function stripDate(value) {
  return value.replace(/\b(19|20)\d{2}[ ._-]\d{2}[ ._-]\d{2}\b/, "").trim();
}

function sortTitle(title) {
  return title.replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 0.8;
  if (a.includes(b) || b.includes(a)) return 0.68;

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? (intersection / union) * 0.78 : 0;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function parseArgs(rawArgs) {
  const parsed = {
    metadataOut: defaults.metadataOut,
    posterOut: defaults.posterOut,
    referenceDb: defaults.referenceDb,
    mediaRoots: [],
    refreshProviders: false,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--media-root") parsed.mediaRoots.push(rawArgs[++index]);
    if (arg === "--out") parsed.metadataOut = path.resolve(rawArgs[++index]);
    if (arg === "--posters-out") parsed.posterOut = path.resolve(rawArgs[++index]);
    if (arg === "--reference-db") parsed.referenceDb = path.resolve(rawArgs[++index]);
    if (arg === "--refresh-providers") parsed.refreshProviders = true;
  }

  return parsed;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
