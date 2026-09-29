import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { copyFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";
import { resolveMediaBinary } from "./media-runtime.mjs";
import {
  canonicalizeWrestlingSeries,
  inferWrestlingDate,
  inferWrestlingSeriesFromParts,
  isGenericWrestlingDirectory,
  narrowNumberedWrestlingEventCandidates,
} from "./wrestling-scan-logic.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  getYearEvents,
  movies,
  promotions,
  tvShows,
  years,
} = await importBrowserDataModule();
const defaults = {
  metadataOut: path.join(root, "src", "metadata.generated.json"),
  posterOut: path.join(root, "src", "tmdb-posters.generated.json"),
  referenceDb: path.join(root, "src", "wrestling-reference.generated.json"),
};
const videoExtensions = new Set([".mkv", ".mp4", ".avi", ".mov", ".m4v", ".webm"]);
const ffprobePath = await resolveMediaBinary("ffprobe", { configuredPath: process.env.FFPROBE_PATH, root });
const weeklyProviderQueries = {
  "Monday Night Raw": { tmdbType: "tv", title: "WWE Monday Night RAW", year: 1993 },
  SmackDown: { tmdbType: "tv", title: "WWE SmackDown", year: 1999 },
  "Sunday Night Heat": { tmdbType: "tv", title: "WWF Sunday Night Heat", year: 1998 },
  Jakked: { tmdbType: "tv", title: "WWF Jakked", year: 1999 },
  "Monday Nitro": { tmdbType: "tv", title: "WCW Monday Nitro", year: 1995 },
  Thunder: { tmdbType: "tv", title: "WCW Thunder", year: 1998 },
  "WCW Saturday Night": { tmdbType: "tv", title: "WCW Saturday Night", year: 1992 },
};
const wrestlingMatchesByReferenceCache = new WeakMap();
const args = parseArgs(process.argv.slice(2));

if (!args.mediaSources.length && !args.mediaRoots.length) {
  const sharedConfig = await readJson(path.join(root, "config", "tobytube.config.json"), {});
  const localConfig = await readJson(path.join(root, "config", "tobytube.local.json"), {});
  const activeConfig = localConfig.mediaSources?.length || localConfig.mediaRoots?.length ? localConfig : sharedConfig;
  args.mediaSources = normalizeMediaSources(activeConfig.mediaSources, activeConfig.mediaRoots);
}
if (!args.mediaSources.length) args.mediaSources = normalizeMediaSources([], args.mediaRoots);
if (!args.mediaSources.length) {
  throw new Error("No media sources configured. Add mediaSources to config/tobytube.local.json or pass --media-source.");
}
await validateMediaSources(args.mediaSources);
args.mediaRoots = args.mediaSources.map((source) => source.path);

const posterCache = await readJson(args.posterOut ?? defaults.posterOut, {});
const wrestlingReference = await readJson(args.referenceDb ?? defaults.referenceDb, {});
const previousMetadata = await readJson(args.metadataOut ?? defaults.metadataOut, { records: [], unmatchedFiles: [] });
const previousFilesByPath = new Map([
  ...(previousMetadata.records ?? []).flatMap((record) => record.files ?? []),
  ...(previousMetadata.unmatchedFiles ?? []),
].filter((file) => file?.path).map((file) => [normalizeFileIdentity(file.path), file]));
const metadataOverrides = await readJson(path.join(root, "config", "metadata-overrides.json"), { items: {} });
const previousFilePaths = new Set([
  ...(previousMetadata.records ?? []).flatMap((record) => (record.files ?? []).map((file) => file.path)),
  ...(previousMetadata.unmatchedFiles ?? []).map((file) => file.path),
]);
let posterCacheDirty = false;
const streamProbeCache = buildStreamProbeCache(previousMetadata);
const sourceScanResults = await Promise.all(args.mediaSources.map(async (source) => ({
  source,
  files: await scanMediaRoot(source),
})));
for (const result of sourceScanResults) {
  if (!result.files.length) throw new Error(`Media source contains no supported video files; catalog was not changed: ${result.source.id} (${result.source.path})`);
}
const scannedFiles = sourceScanResults.flatMap((result) => result.files).filter((file) => !isSeparatelyCataloguedOrAuxiliary(file.path));
const observedAt = new Date().toISOString();
const parsedFiles = await mapWithConcurrency(scannedFiles, 8, async (file) => ({
  ...parseMediaFile(file),
  ...resolveLibraryActivity(file, previousFilesByPath, observedAt),
  streams: getCachedMediaStreams(file, streamProbeCache)
    ?? (args.skipStreamProbe ? defaultStreamInfo(file.path) : await probeMediaStreams(file.path)),
}));
assignMissingTvEpisodeNumbers(parsedFiles);
const seedRecords = buildSeedRecords(posterCache);
const matches = matchFiles(parsedFiles, seedRecords);
const unmatchedFiles = parsedFiles.filter((file) => !matches.some((match) => match.file.path === file.path));
const unmatchedProviderRecords = buildUnmatchedProviderRecords(unmatchedFiles, wrestlingReference);
const seededRecords = seedRecords.map((record) => {
  const matchedFiles = matches
    .filter((match) => match.record.id === record.id)
    .map((match) => ({
      path: match.file.path,
      mediaSourceId: match.file.mediaSourceId,
      size: match.file.size,
      modifiedAt: match.file.modifiedAt,
      addedAt: match.file.addedAt,
      libraryUpdatedAt: match.file.libraryUpdatedAt,
      streams: match.file.streams,
      confidence: match.confidence,
      parsed: match.file.parsed,
    }));

  const recordWithFiles = {
    ...record,
    files: matchedFiles,
    matchState: matchedFiles.length ? "matched" : record.matchState,
  };
  return matchedFiles.length ? applyWrestlingReference(recordWithFiles, wrestlingReference) : recordWithFiles;
});
// A newly added movie must exist in the local catalogue immediately, even
// before a provider-artwork pass has had a chance to create a seed record.
const records = consolidateWrestlingRecords([...seededRecords, ...unmatchedProviderRecords]);
preservePreviousProviderMatches(records, previousMetadata);
const relocatedOverrideCount = applyManualMetadataMatches(records, metadataOverrides);
if (relocatedOverrideCount > 0) {
  metadataOverrides.updatedAt = new Date().toISOString();
  await writeFile(path.join(root, "config", "metadata-overrides.json"), `${JSON.stringify(metadataOverrides, null, 2)}\n`, "utf8");
}

if (args.refreshProviders) {
  await hydrateProviders(records, posterCache);
} else if (args.refreshNewProviders) {
  const newFileRecords = records.filter((record) =>
    (record.files ?? []).some((file) => !previousFilePaths.has(file.path))
  );
  const newIds = new Set(newFileRecords.map((record) => record.id));
  const unresolvedBackfill = records
    .filter((record) => !newIds.has(record.id))
    .filter((record) => record.source === "scan" && record.art?.source !== "tmdb")
    .slice(0, args.providerBackfillLimit);
  await hydrateProviders([...newFileRecords, ...unresolvedBackfill], posterCache);
}
if (args.refreshProviders || posterCacheDirty) {
  await writeFile(args.posterOut ?? defaults.posterOut, `${JSON.stringify(posterCache, null, 2)}\n`);
}

for (const record of records) {
  if (record.source === "scan" && record.art?.source === "tmdb") record.matchState = "provider-matched";
}
const providerMatchedPaths = new Set(
  records
    .filter((record) => record.matchState === "provider-matched")
    .flatMap((record) => (record.files ?? []).map((file) => file.path)),
);
const unresolvedFiles = unmatchedFiles.filter((file) => !providerMatchedPaths.has(file.path));

const output = {
  generatedAt: new Date().toISOString(),
  mediaSources: args.mediaSources.map((source) => ({ ...source, path: path.resolve(source.path) })),
  mediaRoots: args.mediaRoots.map((mediaRoot) => path.resolve(mediaRoot)),
  mediaRoot: args.mediaRoots[0] ? path.resolve(args.mediaRoots[0]) : null,
  stats: {
    records: records.length,
    filesScanned: parsedFiles.length,
    filesMatched: matches.length,
    filesUnmatched: unresolvedFiles.length,
    filesBySource: Object.fromEntries(sourceScanResults.map(({ source, files }) => [source.id, files.length])),
    posters: Object.keys(posterCache).length,
  },
  records,
  unmatchedFiles: unresolvedFiles.map((file) => ({
    path: file.path,
    mediaSourceId: file.mediaSourceId,
    size: file.size,
    modifiedAt: file.modifiedAt,
    addedAt: file.addedAt,
    libraryUpdatedAt: file.libraryUpdatedAt,
    streams: file.streams,
    parsed: file.parsed,
    provider: unmatchedProviderRecords.find((record) => record.id === providerRecordIdForFile(file))?.provider ?? null,
    art: unmatchedProviderRecords.find((record) => record.id === providerRecordIdForFile(file))?.art ?? null,
  })),
};

await publishMetadataSafely(args.metadataOut ?? defaults.metadataOut, output);
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

  const wrestlingRecords = promotions.flatMap((promotion) => {
    const promotionYears = [...new Set([...years, ...(promotion.ppvs ?? []).map((event) => event.year).filter(Boolean)])];
    return promotionYears.flatMap((year) =>
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
            summary: event.summary ?? null,
            venue: event.venue ?? null,
            location: event.location ?? null,
            attendance: event.attendance ?? null,
            posterUrl: event.posterUrl ?? null,
            backdropUrl: event.backdropUrl ?? null,
            providerQuery: {
              ...providerQueryForWrestlingEvent(promotion, event),
            },
            art: buildWrestlingArt(id, promotion, posters, event),
            matchState: "seeded",
            source: "generated-schedule",
          };
        }),
    );
  });

  return [...movieRecords, ...tvRecords, ...promotionRecords, ...wrestlingRecords];
}

function buildUnmatchedProviderRecords(files, referenceDb) {
  const movieGroups = new Map();
  files.filter((file) => file.parsed.mediaType === "movie" && file.parsed.title).forEach((file) => {
    const key = `${normalize(file.parsed.title)}|${file.parsed.year ?? "tba"}`;
    const group = movieGroups.get(key) ?? [];
    group.push(file);
    movieGroups.set(key, group);
  });
  const movieRecords = [...movieGroups.values()].map((group) => {
    const first = group[0];
    const id = providerRecordIdForFile(first);
    return {
      id,
      mediaType: "movie",
      title: first.parsed.title,
      year: first.parsed.year,
      sortTitle: sortTitle(first.parsed.title),
      providerQuery: {
        tmdbType: "movie",
        title: first.parsed.title,
        year: first.parsed.year,
      },
      art: buildArt({ id, title: first.parsed.title, year: first.parsed.year }, posterCache),
      files: group.map((file) => ({
        path: file.path,
        mediaSourceId: file.mediaSourceId,
        size: file.size,
        modifiedAt: file.modifiedAt,
        addedAt: file.addedAt,
        libraryUpdatedAt: file.libraryUpdatedAt,
        streams: file.streams,
        confidence: 0.5,
        parsed: file.parsed,
      })),
      matchState: "provider-candidate",
      source: "scan",
    };
  });

  const tvGroups = new Map();
  files
    .filter((file) => file.parsed.mediaType === "tv" && file.parsed.title)
    .forEach((file) => {
      const key = sortTitle(file.parsed.title);
      const list = tvGroups.get(key) ?? [];
      list.push(file);
      tvGroups.set(key, list);
    });

  const tvRecords = [...tvGroups.values()].map((group) => {
    const first = group[0];
    const title = first.parsed.title;
    const id = `scan-tv-${slugify(title)}`;
    const years = group.map((file) => file.parsed.year).filter(Boolean).sort();
    return {
      id,
      mediaType: "tv",
      title,
      year: years[0] ?? null,
      sortTitle: sortTitle(title),
      providerQuery: {
        tmdbType: "tv",
        title,
        year: years[0] ?? null,
      },
      art: buildArt({ id, title, year: years[0] ?? null }, posterCache),
      files: group.map((file) => ({
        path: file.path,
        mediaSourceId: file.mediaSourceId,
        size: file.size,
        modifiedAt: file.modifiedAt,
        addedAt: file.addedAt,
        libraryUpdatedAt: file.libraryUpdatedAt,
        streams: file.streams,
        confidence: 0.5,
        parsed: file.parsed,
        episodeId: buildEpisodeId(id, file.parsed.season, file.parsed.episode),
      })),
      matchState: "provider-candidate",
      source: "scan",
    };
  });

  const wrestlingRecords = files
    .filter((file) => file.parsed.mediaType === "wrestling" && file.parsed.title)
    .map((file) => {
      const parsed = file.parsed;
      const base = {
        id: `scan-wrestling-${slugify(file.path)}`,
        mediaType: "wrestling",
        title: parsed.aliasTitle ?? parsed.title,
        sortTitle: sortTitle(parsed.aliasTitle ?? parsed.title),
        date: parsed.date,
        year: parsed.year,
        promotion: parsed.promotion,
        promotionId: canonicalPromotion(parsed.promotion),
        series: canonicalizeWrestlingSeries(parsed.series, canonicalPromotion(parsed.promotion)),
        season: parsed.season,
        episodeNumber: parsed.episode,
        eventType: parsed.series ? "weekly" : "event",
        providerQuery: {
          tmdbType: parsed.series ? "tv" : "movie",
          title: canonicalizeWrestlingSeries(parsed.series, canonicalPromotion(parsed.promotion)) ?? parsed.aliasTitle ?? parsed.title,
          year: parsed.year,
        },
        art: { posterUrl: null, source: "fallback" },
        files: [{
          path: file.path,
          mediaSourceId: file.mediaSourceId,
          size: file.size,
          modifiedAt: file.modifiedAt,
          addedAt: file.addedAt,
          libraryUpdatedAt: file.libraryUpdatedAt,
          streams: file.streams,
          confidence: 1,
          parsed,
        }],
        matchState: "scan-unmatched",
        source: "scan",
      };
      return applyWrestlingReference(base, referenceDb);
    });

  return [...movieRecords, ...tvRecords, ...wrestlingRecords];
}

function consolidateWrestlingRecords(records) {
  const output = [];
  const grouped = new Map();
  for (const record of records) {
    if (record.mediaType !== "wrestling" || !(record.files?.length)) {
      output.push(record);
      continue;
    }
    const key = record.referenceId
      ? `reference:${record.referenceId}`
      : record.series && record.date
        ? `weekly:${record.promotionId}:${normalize(record.series)}:${record.date}`
        : null;
    if (!key) {
      output.push(record);
      continue;
    }
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, record);
      output.push(record);
      continue;
    }
    existing.files = [...new Map([...(existing.files ?? []), ...(record.files ?? [])].map((file) => [normalizeFileIdentity(file.path), file])).values()];
    if ((!existing.matches?.length) && record.matches?.length) {
      existing.matches = record.matches;
      existing.matchCount = record.matchCount;
    }
  }
  return output;
}

function buildStreamProbeCache(metadata) {
  const cache = new Map();
  const files = [
    ...(metadata.records ?? []).flatMap((record) => record.files ?? []),
    ...(metadata.unmatchedFiles ?? []),
  ];
  for (const file of files) {
    if (!file?.path || !file.streams) continue;
    cache.set(String(file.path).toLowerCase(), file);
  }
  return cache;
}

function preservePreviousProviderMatches(records, previousMetadata) {
  const previousRecords = previousMetadata.records ?? [];
  const previousById = new Map(previousRecords.map((record) => [record.id, record]));
  const previousByPath = new Map();
  previousRecords.forEach((record) => {
    (record.files ?? []).forEach((file) => {
      if (file?.path) previousByPath.set(file.path, record);
    });
  });

  records.forEach((record) => {
    if (record.source !== "scan" || !(record.files ?? []).length) return;
    const previous = previousById.get(record.id)
      ?? (record.files ?? []).map((file) => previousByPath.get(file.path)).find(Boolean)
      ?? null;
    if (!previous) return;
    const establishedProviderMatch = previous.matchState === "provider-matched"
      || previous.art?.source === "tmdb"
      || Boolean(previous.provider?.id ?? previous.provider?.providerId ?? previous.provider?.tmdbId);
    if (!establishedProviderMatch) return;
    if (previous.art?.posterUrl || previous.art?.backdropUrl) {
      record.art = { ...(record.art ?? {}), ...previous.art };
    }
    if (previous.provider) record.provider = { ...previous.provider };
    record.matchState = "provider-matched";
    record.previousIds = [...new Set([...(previous.previousIds ?? []), previous.id].filter((id) => id && id !== record.id))];
  });
}

function applyManualMetadataMatches(records, overrides) {
  const matchedOverrides = Object.values(overrides?.items ?? {}).filter((override) => override?.match?.providerId);
  if (!matchedOverrides.length) return 0;
  let relocated = 0;
  const overrideByPath = new Map();
  matchedOverrides.forEach((override) => {
    (override.matchedFilePaths ?? []).forEach((filePath) => {
      if (filePath) overrideByPath.set(normalizeFileIdentity(filePath), override);
    });
  });

  records.forEach((record) => {
    const fileOverride = (record.files ?? [])
      .map((file) => overrideByPath.get(normalizeFileIdentity(file.path)))
      .find(Boolean);
    const identityOverride = fileOverride ?? matchedOverrides.find((override) => manualOverrideMatchesRecord(override, record));
    if (!identityOverride) return;
    const knownPaths = new Set((identityOverride.matchedFilePaths ?? []).map(normalizeFileIdentity));
    const currentPaths = (record.files ?? []).map((file) => file.path).filter(Boolean);
    const newlyLearnedPaths = currentPaths.filter((filePath) => !knownPaths.has(normalizeFileIdentity(filePath)));
    if (newlyLearnedPaths.length) {
      identityOverride.matchedFilePaths = [...new Set([...(identityOverride.matchedFilePaths ?? []), ...newlyLearnedPaths])];
      identityOverride.lastRelocatedAt = new Date().toISOString();
      relocated += 1;
    }
    const metadata = identityOverride.metadata ?? {};
    record.matchState = "provider-matched";
    record.provider = {
      provider: identityOverride.match.provider,
      id: identityOverride.match.providerId,
      providerId: identityOverride.match.providerId,
      title: identityOverride.match.title ?? metadata.title ?? record.title,
    };
    record.art = {
      ...(record.art ?? {}),
      ...(metadata.posterUrl || identityOverride.match.posterUrl ? { posterUrl: metadata.posterUrl ?? identityOverride.match.posterUrl } : {}),
      ...(metadata.backdropUrl || identityOverride.match.backdropUrl ? { backdropUrl: metadata.backdropUrl ?? identityOverride.match.backdropUrl } : {}),
      source: String(identityOverride.match.provider ?? "provider").toLowerCase(),
    };
  });
  return relocated;
}

function manualOverrideMatchesRecord(override, record) {
  const identity = override.identity ?? {};
  if (!identity.title || normalize(identity.title) !== normalize(record.title)) return false;
  const providerMediaType = override.metadata?.mediaType ?? override.match?.mediaType ?? identity.mediaType;
  if (providerMediaType && record.mediaType && providerMediaType !== record.mediaType) return false;
  const identityYear = Number(identity.year);
  const recordYear = Number(record.year);
  return !identityYear || !recordYear || identityYear === recordYear;
}

function normalizeFileIdentity(filePath) {
  return path.resolve(String(filePath ?? "")).replace(/\\/g, "/").toLowerCase();
}

function resolveLibraryActivity(file, previousFilesByPath, observedAt) {
  const previous = previousFilesByPath.get(normalizeFileIdentity(file.path));
  const activityCandidates = [file.createdAt, file.modifiedAt]
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value <= Date.parse(observedAt) + 300_000);
  const fileActivityAt = activityCandidates.length
    ? new Date(Math.max(...activityCandidates)).toISOString()
    : observedAt;
  if (!previous) return { addedAt: fileActivityAt, libraryUpdatedAt: fileActivityAt };
  const addedAt = previous.addedAt ?? previous.createdAt ?? previous.modifiedAt ?? fileActivityAt;
  return {
    addedAt,
    // Use the filesystem event time, not the scan completion time. A stalled
    // scan may discover hundreds of arrivals together, but they must retain
    // their actual arrival order in New Releases.
    libraryUpdatedAt: fileActivityAt,
  };
}

function getCachedMediaStreams(file, cache) {
  const cached = cache.get(String(file.path).toLowerCase());
  if (!cached) return null;
  if (Number(cached.size) !== Number(file.size)) return null;
  if (cached.modifiedAt && file.modifiedAt && cached.modifiedAt !== file.modifiedAt) return null;
  return cached.streams;
}

function providerRecordIdForFile(file) {
  return `scan-movie-${slugify(`${file.parsed.title}-${file.parsed.year ?? "tba"}`)}`;
}

async function importBrowserDataModule() {
  const source = await readFile(path.join(root, "src", "data.js"), "utf8");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function buildArt(item, posters) {
  const resolved = resolveCachedArt(item, posters);
  const cached = resolved?.art ?? null;
  if (cached?.posterUrl && item.id && !posters[item.id]?.posterUrl) {
    posters[item.id] = {
      ...cached,
      ...(resolved.key && resolved.key !== item.id ? { migratedFrom: resolved.key } : {}),
    };
    posterCacheDirty = true;
  }
  return {
    posterUrl: cached?.posterUrl ?? item.posterUrl ?? null,
    source: cached?.source ?? (item.posterUrl ? "seed" : "fallback"),
    page: cached?.page ?? null,
    fallbackCode: item.posterCode,
    colors: [item.posterA, item.posterB],
  };
}

function resolveCachedArt(item, posters) {
  if (posters[item.id]?.posterUrl) return { key: item.id, art: posters[item.id] };

  const identitySlug = slugify(`${item.title}-${item.year ?? "tba"}`);
  const candidateKeys = Object.keys(posters).filter((key) =>
    key === `scan-movie-${identitySlug}` ||
    key === `scanned-movie-${identitySlug}` ||
    key.startsWith(`scan-provider-${identitySlug}-`)
  );
  const cachedKey = candidateKeys.find((key) => posters[key]?.posterUrl);
  if (cachedKey) return { key: cachedKey, art: posters[cachedKey] };

  const prior = (previousMetadata.records ?? []).find((record) =>
    normalize(record.title) === normalize(item.title) &&
    String(record.year ?? "tba") === String(item.year ?? "tba") &&
    record.art?.posterUrl
  );
  if (prior) return { key: prior.id, art: prior.art };

  return null;
}

function buildWrestlingArt(id, promotion, posters, item = {}) {
  const cached = posters[id];
  return {
    posterUrl: cached?.posterUrl ?? item.posterUrl ?? promotion.logoUrl,
    logoUrl: promotion.logoUrl,
    source: cached?.source ?? (item.posterUrl ? "seed" : "promotion-logo"),
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

  const dataReference = findRicherSiblingReference(reference, referenceDb) ?? reference;
  const referenceMatches = getWrestlingMatchesByReference(referenceDb, dataReference.id)
    .map((match, index) => ({
      order: match.order ?? index + 1,
      match: match.displayText ?? match.raw,
      stipulation: match.stipulation ?? match.titleMatch ?? null,
      titleMatch: match.titleMatch ?? null,
      spoilerSafe: match.spoilerSafe !== false,
    }));
  const cachedPoster = resolveWrestlingPoster(reference, record, posterCache);
  const recordPoster = ["fallback", "promotion-logo"].includes(record.art?.source) ? null : record.art?.posterUrl;
  const posterUrl = reference.art?.posterUrl ?? reference.posterUrl ?? dataReference.art?.posterUrl ?? dataReference.posterUrl ?? cachedPoster?.posterUrl ?? recordPoster ?? record.art?.posterUrl ?? null;
  const isEpisode = Boolean(record.series) || reference.recordType === "episode" || /tv show|weekly|episode/i.test(reference.eventType ?? "");
  const promotionId = canonicalPromotion(reference.promotionId ?? reference.promotion ?? record.promotion);
  const resolvedSeries = isEpisode
    ? canonicalizeWrestlingSeries(reference.seriesName ?? reference.displayTitle ?? record.series ?? reference.title, promotionId)
    : null;

  return {
    ...record,
    title: reference.title ?? reference.name ?? record.title,
    displayTitle: resolvedSeries ?? reference.displayTitle ?? reference.seriesName ?? reference.title ?? record.title,
    date: reference.date ?? reference.broadcastDate ?? record.date,
    year: reference.year ?? (Number(String(reference.date ?? record.date ?? "").slice(0, 4)) || record.year),
    promotionId,
    promotion: reference.promotion ?? record.promotion,
    series: resolvedSeries,
    seriesId: reference.seriesId ?? record.seriesId ?? null,
    season: reference.season ?? record.season,
    episodeNumber: reference.episodeNumber ?? record.episodeNumber,
    eventType: isEpisode ? "weekly" : (reference.eventType ?? record.eventType),
    referenceId: reference.id,
    venue: dataReference.venue ?? reference.venue ?? record.venue ?? null,
    location: dataReference.location ?? reference.location ?? record.location ?? null,
    attendance: dataReference.attendance ?? reference.attendance ?? record.attendance ?? null,
    tagline: dataReference.tagline ?? reference.tagline ?? record.tagline ?? null,
    summary: dataReference.summary ?? reference.summary ?? record.summary ?? null,
    art: { ...(record.art ?? {}), ...(dataReference.art ?? {}), ...(reference.art ?? {}), ...(cachedPoster ?? {}), posterUrl },
    posterUrl,
    matches: referenceMatches,
    matchCount: referenceMatches.length,
    source: "reference-db",
    referenceSourceIds: reference.sourceIds ?? [],
    matchState: "reference-matched",
  };
}

function findRicherSiblingReference(reference, referenceDb) {
  if (!reference?.date) return reference;
  const needle = normalizeWrestlingName(reference.title ?? reference.name);
  const siblings = [...(referenceDb.events ?? []), ...(referenceDb.episodes ?? [])]
    .filter((candidate) => candidate.date === reference.date)
    .filter((candidate) => similarity(needle, normalizeWrestlingName(candidate.title ?? candidate.name)) >= 0.5);
  return siblings.sort((a, b) => referenceRichness(b, referenceDb) - referenceRichness(a, referenceDb))[0] ?? reference;
}

function referenceRichness(reference, referenceDb) {
  const matchCount = getWrestlingMatchesByReference(referenceDb, reference.id).length;
  return Math.min(matchCount, 20) * 5 + (reference.summary ? 8 : 0) + (reference.posterUrl || reference.art?.posterUrl ? 4 : 0) + (reference.venue ? 2 : 0) + (reference.location ? 2 : 0);
}

function resolveWrestlingPoster(reference, record, posters) {
  const promotionId = canonicalPromotion(reference.promotionId ?? reference.promotion ?? record.promotionId ?? record.promotion);
  const year = String(reference.date ?? record.date ?? record.year ?? "").slice(0, 4);
  const directKeys = [record.id, reference.id, `library-${reference.id}`];
  for (const key of directKeys) if (posters[key]?.posterUrl) return posters[key];
  for (const alias of wrestlingPosterAliases(reference, record)) {
    const dated = posters[`wrestling-${promotionId}-${alias}-${reference.date ?? record.date}`];
    if (dated?.posterUrl) return dated;
    const season = posters[`season-${promotionId}-${alias}-${year}`];
    if (season?.posterUrl) return season;
  }
  return null;
}

function wrestlingPosterAliases(reference, record) {
  const value = normalize(reference.seriesName ?? reference.displayTitle ?? record.series ?? reference.title ?? record.title).replace(/\s+/g, "-");
  const aliases = [value, value.replace(/^(?:wwe|wwf|wcw|ecw|aew|tna|roh|njpw|ajpw)-/, "")];
  if (value.includes("heat")) aliases.push("heat", "sunday-night-heat");
  if (value.includes("hardcore-tv")) aliases.push("hardcore-tv", "ecw-hardcore-tv");
  if (value.includes("ecw-on-tnn") || value.endsWith("-tnn")) aliases.push("ecw-on-tnn", "on-tnn");
  if (value.includes("dynamite")) aliases.push("dynamite", "aew-dynamite");
  if (value.includes("collision")) aliases.push("collision", "aew-collision");
  if (value.includes("rampage")) aliases.push("rampage", "aew-rampage");
  if (value.includes("dark-elevation") || value.includes("elevation")) aliases.push("dark-elevation", "aew-dark-elevation");
  if (value.endsWith("dark")) aliases.push("dark", "aew-dark");
  return [...new Set(aliases.filter(Boolean))];
}

function getWrestlingMatchesByReference(referenceDb, referenceId) {
  let byReferenceId = wrestlingMatchesByReferenceCache.get(referenceDb);
  if (!byReferenceId) {
    byReferenceId = new Map();
    for (const match of referenceDb.matches ?? []) {
      const list = byReferenceId.get(match.eventId) ?? [];
      list.push(match);
      byReferenceId.set(match.eventId, list);
    }
    wrestlingMatchesByReferenceCache.set(referenceDb, byReferenceId);
  }
  return byReferenceId.get(referenceId) ?? [];
}

function findReferenceEpisode(record, episodes) {
  const promotionId = canonicalPromotion(record.promotionId ?? record.promotion);
  const recordSeries = normalizeWrestlingName(record.series ?? record.title);
  const candidates = episodes.filter((episode) => canonicalPromotion(episode.promotionId ?? episode.promotion) === promotionId);
  const dated = record.date ? candidates.filter((episode) => (episode.date ?? episode.broadcastDate) === record.date) : [];
  const numbered = record.episodeNumber
    ? candidates.filter((episode) => Number(episode.episodeNumber) === Number(record.episodeNumber) && (!record.year || Number(episode.year ?? String(episode.date ?? "").slice(0, 4)) === Number(record.year)))
    : [];
  return chooseReferenceByName(dated.length ? dated : numbered, recordSeries, (episode) => episode.seriesName ?? episode.displayTitle ?? episode.title);
}

function findReferenceEvent(record, events) {
  const promotionId = canonicalPromotion(record.promotionId ?? record.promotion);
  if (!promotionId) return null;
  const recordTitle = normalizeWrestlingName(record.aliasTitle ?? record.title);
  let candidates = events.filter((event) => canonicalPromotion(event.promotionId ?? event.promotion) === promotionId);
  const numberedCandidates = narrowNumberedWrestlingEventCandidates(recordTitle, candidates);
  const matchedExplicitNumber = numberedCandidates.length < candidates.length;
  candidates = numberedCandidates;
  if (!matchedExplicitNumber && record.date) candidates = candidates.filter((event) => event.date === record.date);
  else if (!matchedExplicitNumber && record.year) candidates = candidates.filter((event) => Number(event.year ?? String(event.date ?? "").slice(0, 4)) === Number(record.year));
  return chooseReferenceByName(candidates, recordTitle, (event) => event.title ?? event.name);
}

function chooseReferenceByName(candidates, needle, getName) {
  if (!candidates.length) return null;
  return candidates
    .map((candidate) => ({ candidate, score: similarity(needle, normalizeWrestlingName(getName(candidate))) }))
    .filter(({ score }) => score >= 0.42)
    .sort((a, b) => (b.score + referenceRichness(b.candidate, wrestlingReference) / 1000) - (a.score + referenceRichness(a.candidate, wrestlingReference) / 1000))[0]?.candidate ?? null;
}

function canonicalPromotion(value) {
  const key = normalize(value);
  if (/^(wwe|wwf|wwfe)$/.test(key) || key.includes("world wrestling entertainment") || key.includes("world wrestling federation")) return "wwe";
  if (key === "aew" || key.includes("all elite wrestling")) return "aew";
  if (key === "pwg" || key.includes("pro wrestling guerrilla")) return "pwg";
  if (key === "tna" || key === "impact" || key.includes("total nonstop action") || key.includes("impact wrestling")) return "tna";
  if (key === "njpw" || key.includes("new japan pro wrestling")) return "njpw";
  if (key === "roh" || key.includes("ring of honor")) return "roh";
  if (key === "wcw" || key.includes("world championship wrestling")) return "wcw";
  if (key === "ecw" || key.includes("extreme championship wrestling")) return "ecw";
  return key || null;
}

function normalizeWrestlingName(value) {
  let normalized = normalize(value)
    .replace(/\b(?:wwe|wwf|wwfe|wcw|ecw|aew|pwg|roh|tna|njpw)\b/g, " ")
    .replace(/\b(?:live\s*ppv|ppv|vhsrip|webrip|bluray|xvid|x26[45]|h26[45]|720p|1080p|2160p|pre\s*show)\b/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\bd\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\b(?:wrestlemania|summerslam|survivor series|royal rumble|wrestle kingdom)\b/.test(normalized)) {
    normalized = normalized
      .replace(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b$/, " ")
      .replace(/\b(?:night|day)\s*(?:one|two|1|2)\b$/, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return normalized;
}

function inferWrestlingEventPart(title, promotion) {
  if (!title || !promotion) return null;
  const normalizedTitle = normalize(title);
  const marqueeEvent = /\b(?:wrestlemania|summerslam|survivor series|royal rumble|wrestle kingdom)\b/.test(normalizedTitle);
  if (!marqueeEvent) return null;
  const match = normalizedTitle.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:night|day)\s*(?:one|two|1|2))\b$/);
  if (!match) return null;
  return match[1]
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bOne\b/, "1")
    .replace(/\bTwo\b/, "2");
}

async function hydrateProviders(records, posters) {
  if (!hasTmdbCredentials()) {
    console.warn("TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY is not set; provider refresh skipped.");
    return;
  }

  const queryCache = new Map();
  for (const record of records) {
    if (!["movie", "tv", "wrestling"].includes(record.mediaType)) continue;
    const key = JSON.stringify(record.providerQuery);
    const cached = queryCache.get(key);
    let tmdb = cached;
    if (!tmdb) {
      try {
        tmdb = posters[record.id]?.tmdbId
          ? { id: posters[record.id].tmdbId, poster_path: String(posters[record.id].posterUrl ?? "").match(/\/w\d+(.+)$/)?.[1] ?? null }
          : await searchTmdb(record.providerQuery);
      } catch (error) {
        console.warn(`Provider refresh failed for ${record.title}: ${error.message}`);
        queryCache.set(key, null);
        continue;
      }
    }
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
    record.provider = posters[record.id];
    record.art = buildArt(record, posters);
    if (record.mediaType === "movie") {
      try {
        const details = await fetchTmdbMovieDetails(tmdb.id);
        const director = details.credits?.crew?.find((person) => person.job === "Director");
        const certification = details.release_dates?.results
          ?.find((entry) => entry.iso_3166_1 === "US")?.release_dates
          ?.find((release) => release.certification)?.certification;
        Object.assign(record, {
          title: details.title ?? record.title,
          year: Number(String(details.release_date ?? "").slice(0, 4)) || record.year,
          summary: details.overview ?? "",
          tagline: details.tagline ?? "",
          releaseDate: details.release_date ?? null,
          runtime: details.runtime ?? null,
          rating: certification || "NR",
          director: director?.name ?? null,
          country: details.production_countries?.map((country) => country.name).join(", ") || null,
          language: details.original_language?.toUpperCase() ?? null,
          genres: details.genres?.map((genre) => genre.name) ?? [],
          ratings: { tmdb: details.vote_average ?? null },
          tmdbId: details.id,
          imdbId: details.external_ids?.imdb_id ?? null,
          posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : record.art?.posterUrl ?? null,
          backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : null,
          cast: (details.credits?.cast ?? []).slice(0, 40).map((person) => ({
            id: `tmdb-person-${person.id}`,
            tmdbId: person.id,
            name: person.name,
            role: person.character ?? "Cast",
            character: person.character ?? "Cast",
            imageUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
            profileUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
          })),
          hydratedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.warn(`TMDB details refresh failed for ${record.title}: ${error.message}`);
      }
    }
  }
}

async function fetchTmdbMovieDetails(id) {
  const url = new URL(`https://api.themoviedb.org/3/movie/${id}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("append_to_response", "credits,release_dates,external_ids");
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`TMDB movie details returned ${response.status}`);
  return response.json();
}

async function searchTmdb(query) {
  const url = new URL(`https://api.themoviedb.org/3/search/${query.tmdbType}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("query", query.title);
  if (query.year && query.tmdbType === "movie") url.searchParams.set("year", query.year);
  if (query.year && query.tmdbType === "tv") url.searchParams.set("first_air_date_year", query.year);

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    console.warn(`TMDB ${query.tmdbType} search failed for ${query.title}: ${response.status}`);
    return null;
  }

  const json = await response.json();
  const candidates = (json.results ?? []).filter((candidate) => candidate.poster_path);
  return candidates
    .map((candidate) => ({ candidate, score: scoreTmdbCandidate(candidate, query) }))
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

function scoreTmdbCandidate(candidate, query) {
  const requestedTitle = normalize(query.title);
  const candidateTitles = [candidate.title, candidate.name, candidate.original_title, candidate.original_name]
    .map(normalize)
    .filter(Boolean);
  const titleScore = Math.max(0, ...candidateTitles.map((title) =>
    title === requestedTitle ? 8 : similarity(title, requestedTitle) * 6
  ));
  const candidateYear = Number(String(candidate.release_date ?? candidate.first_air_date ?? "").slice(0, 4)) || null;
  const requestedYear = Number(query.year) || null;
  const yearScore = !requestedYear || !candidateYear
    ? 0
    : candidateYear === requestedYear
      ? 3
      : -Math.min(4, Math.abs(candidateYear - requestedYear));
  const popularityScore = Math.min(1, Number(candidate.popularity ?? 0) / 100);
  return titleScore + yearScore + popularityScore;
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

async function scanMediaRoot(source) {
  const absoluteRoot = path.resolve(source.path);
  const found = [];
  const ignoredRootDirectories = new Set(["$recycle.bin", "system volume information", "recovery"]);

  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (["EACCES", "EPERM"].includes(error?.code)) {
        console.warn(`Skipping unreadable directory: ${directory}`);
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (path.dirname(fullPath) === absoluteRoot && ignoredRootDirectories.has(entry.name.toLowerCase())) continue;
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile() || !videoExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const details = await stat(fullPath);
      found.push({
        path: fullPath,
        relativePath: path.relative(absoluteRoot, fullPath),
        mediaSourceId: source.id,
        configuredMediaType: source.type === "mixed" ? null : source.type,
        size: details.size,
        createdAt: details.birthtime.toISOString(),
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
  const rawParts = (file.relativePath ?? file.path).split(/[\\/]/);
  const parts = rawParts.map(cleanTitle);
  const seasonEpisode = parsedPath.name.match(/s(\d{1,2})\s*[-_. ]?\s*e(\d{1,3})/i);
  const episodeOnly = !seasonEpisode ? parsedPath.name.match(/(?:^|\b)e(?:p)?\s*(\d{1,3})(?:\b|[ ._-])/i) : null;
  const multipartMiniseries = !seasonEpisode
    ? parsedPath.name.match(/\bpart\s*(\d{1,3})\s*(?:of|\/)\s*(\d{1,3})\b/i)
    : null;
  const multipartMovie = !seasonEpisode && !multipartMiniseries
    ? parsedPath.name.match(/\[(?:part|pt|cd|disc|disk)\s*(\d{1,2})(?:\s*(?:of|\/)\s*(\d{1,2}))?\]/i)
    : null;
  const folderSeason = parts.map((part) => part.match(/(?:season|series|s)\s*(\d{1,2})/i)?.[1]).find(Boolean);
  const pathText = file.relativePath ?? file.path;
  const exactDate = pathText.match(/(19|20)\d{2}[ ._-]\d{2}[ ._-]\d{2}/)?.[0]?.replace(/[ ._]/g, "-");
  const year = Number(parsedPath.name.match(/\b(19|20)\d{2}\b/)?.[0] ?? pathText.match(/\b(19|20)\d{2}\b/)?.[0]);

  let mediaType = file.configuredMediaType ?? "movie";
  const isTvRoot = /^tv$/i.test(parts[0]);
  const isTvCollection = parts.some((part) => /^(animated\s+tv|television|tv\s+shows?)$/i.test(part));
  const isWrestlingRoot = /^(wrestling|wrestling shows?|wrestling events?)$/i.test(parts[0]);
  const isWrestlingPath = /(?:^|[\\/])wrestling(?:[\\/]|$)/i.test(file.path);
  const movieFolder = /\bmovie\b/i.test(file.relativePath ?? file.path) && /\b(19|20)\d{2}\b/.test(file.relativePath ?? file.path);
  const explicitlyTv = /\[(?:tv|television)\]/i.test(pathText);
  // A collection drive can be configured primarily for movies while still
  // containing boxed television folders. Episode syntax and an explicit [tv]
  // marker are stronger evidence than the source default.
  if (file.configuredMediaType !== "wrestling" && (seasonEpisode || episodeOnly || explicitlyTv)) mediaType = "tv";
  if (!file.configuredMediaType && multipartMiniseries && /\bmini[- ]?series\b/i.test(pathText)) mediaType = "tv";
  if (!file.configuredMediaType && isTvRoot && !movieFolder) mediaType = "tv";
  if (!file.configuredMediaType && isTvCollection && !movieFolder) mediaType = "tv";
  if (file.configuredMediaType === "wrestling" || (!file.configuredMediaType && (isWrestlingRoot || isWrestlingPath || exactDate || parts.some((part) => /\b(wwe|wwf|wcw|ecw|aew|njpw|roh|tna|impact|pwg|shimmer)\b/i.test(part))))) {
    mediaType = "wrestling";
  }

  const inferredTitle = inferTitle(parts, cleanName, mediaType, year);
  const promotion = inferPromotion(parts);
  const date = mediaType === "wrestling" ? (inferWrestlingDate(pathText, year) ?? exactDate ?? null) : (exactDate ?? null);

  return {
    ...file,
    parsed: {
      mediaType,
      title: inferredTitle,
      aliasTitle: inferAliasTitle(parts, rawParts, mediaType, year),
      year: Number.isFinite(year) ? year : null,
      date: date ?? null,
      season: seasonEpisode ? Number(seasonEpisode[1]) : episodeOnly ? Number(folderSeason ?? 1) : multipartMiniseries ? 1 : null,
      episode: seasonEpisode ? Number(seasonEpisode[2]) : episodeOnly ? Number(episodeOnly[1]) : multipartMiniseries ? Number(multipartMiniseries[1]) : null,
      part: multipartMovie ? Number(multipartMovie[1]) : null,
      partCount: multipartMovie?.[2] ? Number(multipartMovie[2]) : null,
      promotion,
      eventPartLabel: inferWrestlingEventPart(inferredTitle, promotion),
      series: inferWrestlingSeries(parts, mediaType),
    },
  };
}

function isSeparatelyCataloguedOrAuxiliary(filePath) {
  const normalized = String(filePath ?? "").replace(/\//g, "\\");
  // Disney shorts have their own richer catalogue and must not also appear as
  // unidentified general-library objects. Download samples are never titles.
  return /\\Vaults\\Disney\\Shorts\\/i.test(normalized)
    || /\\Boxed Sets\\Animation\\Shorts\\Looney Tunes Golden Collection\\/i.test(normalized)
    || /\\(?:samples?|sample clips?)\\/i.test(normalized);
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
  if (parsed.mediaType === "wrestling" && parsed.date && record.date && parsed.date !== record.date) return 0;
  if (parsed.mediaType === "wrestling" && parsed.year && record.year && parsed.year !== record.year) return 0;
  const normalizeName = parsed.mediaType === "wrestling" ? normalizeWrestlingName : normalize;
  const parsedTitle = normalizeName(parsed.title);
  const recordTitle = normalizeName(record.title);
  // A regional edition or named spinoff is a separate programme, not a fuzzy
  // variation of its shorter parent title (Little Britain USA, The Office US,
  // and similar cases).
  if (parsed.mediaType === "tv" && parsedTitle !== recordTitle) {
    const longer = parsedTitle.length > recordTitle.length ? parsedTitle : recordTitle;
    const shorter = parsedTitle.length > recordTitle.length ? recordTitle : parsedTitle;
    if (longer.startsWith(`${shorter} `)) return 0;
  }
  if (parsed.mediaType === "tv" && parsed.year && record.year && parsed.year !== record.year) return 0;
  const titleScore = Math.max(similarity(parsedTitle, recordTitle), parsed.aliasTitle ? similarity(normalizeName(parsed.aliasTitle), recordTitle) : 0);
  if (parsed.mediaType === "wrestling" && titleScore < 0.35) return 0;
  const yearScore = parsed.year && record.year ? (parsed.year === record.year ? 0.25 : -0.2) : 0;
  const dateScore = parsed.date && record.date ? (parsed.date === record.date ? 0.3 : -0.25) : 0;
  const promotionScore =
    parsed.promotion && record.promotion
      ? canonicalPromotion(parsed.promotion) === canonicalPromotion(record.promotion)
        ? 0.2
        : -0.1
      : 0;
  const episodeScore =
    parsed.season && record.season && parsed.episode && record.episodeNumber
      ? parsed.season === record.season && parsed.episode === record.episodeNumber
        ? 0.25
        : 0
      : 0;

  return Math.max(0, Math.min(1, titleScore + yearScore + dateScore + promotionScore + episodeScore));
}

function inferTitle(parts, fileName, mediaType, year) {
  if (mediaType === "tv") {
    const showFolder = inferTvShowFolder(parts);
    const folderTitle = cleanTvShowTitle(showFolder ?? "");
    if (folderTitle) return folderTitle;
    return cleanTvShowTitle(fileName.split(/\bS\d{1,2}\s*[-_. ]?\s*E\d{1,3}/i)[0].replace(/[\s._-]+$/, ""));
  }
  if (mediaType === "wrestling") {
    return stripDate(fileName)
      .replace(/\b(wwe|wwf|wwfe|wcw|ecw|aew|njpw|roh|tna|pwg|shimmer)\b/gi, "")
      .replace(/\b(?:720p|1080p|2160p|bluray|webrip|vhsrip|xvid|x26[45]|h26[45]|aac|dts)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return inferMovieTitle(parts, fileName, year);
}


function cleanTvShowTitle(value) {
  return stripYear(value)
    .replace(/\bS\d{1,2}\s*[-\u2013]\s*S?\d{1,2}\b/gi, "")
    .replace(/\bS\d{1,2}\b/gi, "")
    .replace(/\bSeasons?\s+\d+(\s*[-\u2013]?\s*\d+)?\b/gi, "")
    .replace(/\b(?:10bit|8bit|x26[45]|h\.?26[45]|hevc|avc|web[- ]?rip|web[- ]?dl|bluray|bdrip|dvdrip|720p|1080p|2160p|4k)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function assignMissingTvEpisodeNumbers(files) {
  const groups = new Map();
  files.filter((file) => file.parsed.mediaType === "tv" && file.parsed.title).forEach((file) => {
    const key = normalize(file.parsed.title);
    const group = groups.get(key) ?? [];
    group.push(file);
    groups.set(key, group);
  });
  groups.forEach((group) => {
    const used = new Set(group.filter((file) => file.parsed.season != null && file.parsed.episode != null).map((file) => `${file.parsed.season}:${file.parsed.episode}`));
    let candidate = 1;
    group.filter((file) => file.parsed.episode == null).sort((a, b) => a.path.localeCompare(b.path)).forEach((file) => {
      const season = Number(file.parsed.season ?? 1);
      while (used.has(`${season}:${candidate}`)) candidate += 1;
      file.parsed.season = season;
      file.parsed.episode = candidate;
      used.add(`${season}:${candidate}`);
      candidate += 1;
    });
  });
}
function buildEpisodeId(showId, season, episode) {
  if (season == null || episode == null) return null;
  return `${showId}-s${String(season).padStart(2, "0")}e${String(episode).padStart(2, "0")}`;
}
function inferAliasTitle(parts, rawParts, mediaType, year) {
  if (mediaType === "wrestling") {
    const directories = parts.slice(0, -1).filter(Boolean);
    for (let index = directories.length - 1; index >= 0; index -= 1) {
      const candidate = directories[index];
      if (!candidate || isGenericWrestlingDirectory(candidate) || /^s\d{1,2}e\d{1,3}\b/i.test(candidate)) continue;
      return candidate;
    }
    return null;
  }
  if (mediaType !== "movie" || !Number.isFinite(year)) return null;
  const rawParent = rawParts.at(-2) ?? "";
  if (!new RegExp(`\\b${year}\\b`).test(rawParent)) return null;
  const parent = parts.at(-2);
  const alias = stripYear(parent, year);
  const generic = /^(movies?|films?|collections?|aisles?|vaults?|worlds?|profiles?|sagas?|boxed sets?|features?|featurettes?|extras?|bonus|deleted scenes?|shorts?)$/i;
  return alias && !generic.test(alias) ? alias : null;
}
function inferMovieTitle(parts, fileName, year) {
  return stripYear(fileName, year).replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim();
}

function inferTvShowFolder(parts) {
  const directories = parts.slice(0, -1).filter(Boolean);
  const isSeasonFolder = (part) =>
    /^(?:seasons?|series)[ ._-]*\d{1,2}(?:\s*(?:[-\u2013]\s*)?\d{1,2})?$/i.test(part) ||
    /^s(?:e)?\d{1,2}$/i.test(part) ||
    /^\d{1,2}$/i.test(part) ||
    /^(?:specials?|season\s*0|series\s*0)$/i.test(part) ||
    /^pilot$/i.test(part);
  const isGenericTvFolder = (part) =>
    /^(tv|television|shows?|series|seasons?|movies?|films?|media|collections?|aisles?|vaults?|worlds?|profiles?|sagas?|boxed sets?|genre sections?|animated tv|animation|phase \d+|marvel phases?|disney|pixar|shorts?|extras?|bonus)$/i.test(part);

  const seasonIndex = directories.findIndex(isSeasonFolder);
  if (seasonIndex > 0) {
    const previous = directories[seasonIndex - 1];
    if (!isGenericTvFolder(previous)) return previous;
    for (let index = seasonIndex - 2; index >= 0; index -= 1) {
      if (!isGenericTvFolder(directories[index])) return directories[index];
    }
  }

  for (let index = directories.length - 1; index >= 0; index -= 1) {
    const candidate = directories[index];
    if (!candidate || isGenericTvFolder(candidate) || isSeasonFolder(candidate)) continue;
    return candidate;
  }

  return directories.at(-1) ?? parts.at(-2);
}

function inferPromotion(parts) {
  const joined = parts.join(" ");
  const match = joined.match(/\b(wwe|wwf|wwfe|wcw|ecw|aew|njpw|roh|tna|impact|pwg|shimmer)\b/i);
  if (!match) return null;
  const promotion = match[1].toUpperCase();
  if (promotion === "WWF" || promotion === "WWFE") return "WWE";
  if (promotion === "IMPACT") return "TNA";
  return promotion;
}

function inferWrestlingSeries(parts, mediaType) {
  return inferWrestlingSeriesFromParts(parts, mediaType);
}

async function probeMediaStreams(filePath) {
  const probeStats = await stat(ffprobePath).catch(() => null);
  if (!probeStats?.isFile()) return defaultStreamInfo(filePath);

  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=index,codec_type,codec_name,channels,channel_layout,width,height,avg_frame_rate:stream_tags=language,title",
    "-of",
    "json",
    filePath,
  ];
  return new Promise((resolve) => {
    const child = spawn(ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(defaultStreamInfo(filePath));
    }, 20_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => finish(defaultStreamInfo(filePath)));
    child.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        finish(defaultStreamInfo(filePath));
        return;
      }
      try {
        finish(normalizeProbeStreams(JSON.parse(stdout), filePath));
      } catch {
        finish(defaultStreamInfo(filePath));
      }
    });
  });
}

function normalizeProbeStreams(data, filePath) {
  const streams = data.streams ?? [];
  const video = streams.filter((stream) => stream.codec_type === "video").map((stream, index) => ({
    index: stream.index,
    label: [stream.width && stream.height ? `${stream.height}p` : null, stream.codec_name?.toUpperCase()].filter(Boolean).join(" ") || `Video ${index + 1}`,
    codec: stream.codec_name ?? null,
    width: stream.width ?? null,
    height: stream.height ?? null,
  }));
  const audio = streams.filter((stream) => stream.codec_type === "audio").map((stream, index) => ({
    index: stream.index,
    label: [languageName(stream.tags?.language), stream.codec_name?.toUpperCase(), stream.channel_layout || (stream.channels ? `${stream.channels}.0` : null)]
      .filter(Boolean)
      .join(" - ") || `Audio ${index + 1}`,
    codec: stream.codec_name ?? null,
    language: stream.tags?.language ?? null,
    channels: stream.channels ?? null,
  }));
  const subtitles = streams.filter((stream) => stream.codec_type === "subtitle").map((stream, index) => ({
    index: stream.index,
    label: [languageName(stream.tags?.language), stream.tags?.title, stream.codec_name?.toUpperCase()].filter(Boolean).join(" - ") || `Subtitle ${index + 1}`,
    codec: stream.codec_name ?? null,
    language: stream.tags?.language ?? null,
  }));

  return {
    durationSeconds: Number.isFinite(Number(data.format?.duration)) ? Math.round(Number(data.format.duration)) : null,
    versionLabel: buildVersionLabel(filePath, video[0]),
    video: video.length ? video : defaultStreamInfo(filePath).video,
    audio: audio.length ? audio : defaultStreamInfo(filePath).audio,
    subtitles,
  };
}

function defaultStreamInfo(filePath) {
  return {
    durationSeconds: null,
    versionLabel: buildVersionLabel(filePath, null),
    video: [{ index: 0, label: formatFallbackVideoLabel(filePath), codec: path.extname(filePath).slice(1).toUpperCase() || "MEDIA" }],
    audio: [{ index: 0, label: "Default audio", codec: null }],
    subtitles: [],
  };
}

function buildVersionLabel(filePath, videoStream) {
  const basename = path.basename(filePath, path.extname(filePath)).replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  const quality = videoStream?.height ? `${videoStream.height}p` : null;
  return [basename, quality].filter(Boolean).join(" / ");
}

function formatFallbackVideoLabel(filePath) {
  const extension = path.extname(filePath).slice(1).toUpperCase() || "MEDIA";
  return `${extension} direct file`;
}

function languageName(code) {
  if (!code || code === "und") return null;
  const map = {
    eng: "English",
    en: "English",
    spa: "Spanish",
    es: "Spanish",
    fre: "French",
    fra: "French",
    fr: "French",
    ger: "German",
    deu: "German",
    de: "German",
    jpn: "Japanese",
    ja: "Japanese",
  };
  return map[String(code).toLowerCase()] ?? String(code).toUpperCase();
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function cleanTitle(value) {
  return value
    .replace(/\.(?:mkv|mp4|avi|mov|m4v|webm)$/i, "")
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

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-") || "untitled";
}

function normalize(value) {
  return String(value ?? "")
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
    mediaSources: [],
    refreshProviders: false,
    refreshNewProviders: false,
    providerBackfillLimit: 25,
    skipStreamProbe: false,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--media-root") parsed.mediaRoots.push(rawArgs[++index]);
    if (arg === "--media-source") {
      const sourceSpec = String(rawArgs[++index] ?? "");
      const [sourceId, rawType] = sourceSpec.includes("|") ? sourceSpec.split("|", 2) : [null, sourceSpec];
      const type = rawType.toLowerCase();
      const sourcePath = rawArgs[++index];
      parsed.mediaSources.push({ id: sourceId || `${type}-${parsed.mediaSources.length + 1}`, type, path: sourcePath });
    }
    if (arg === "--out") parsed.metadataOut = path.resolve(rawArgs[++index]);
    if (arg === "--posters-out") parsed.posterOut = path.resolve(rawArgs[++index]);
    if (arg === "--reference-db") parsed.referenceDb = path.resolve(rawArgs[++index]);
    if (arg === "--refresh-providers") parsed.refreshProviders = true;
    if (arg === "--refresh-new-providers") parsed.refreshNewProviders = true;
    if (arg === "--provider-backfill-limit") parsed.providerBackfillLimit = Math.max(0, Number(rawArgs[++index]) || 0);
    if (arg === "--skip-stream-probe") parsed.skipStreamProbe = true;
  }

  return parsed;
}

function normalizeMediaSources(mediaSources = [], mediaRoots = []) {
  const allowedTypes = new Set(["movie", "tv", "wrestling", "mixed"]);
  if (mediaSources?.length) return mediaSources.filter((source) => source?.enabled !== false).map((source, index) => {
    const type = String(source.type ?? "mixed").toLowerCase();
    if (!allowedTypes.has(type)) throw new Error(`Invalid media source type: ${source.type}`);
    if (!source.path) throw new Error(`Media source ${source.id ?? index + 1} has no path.`);
    if (String(source.id ?? "").includes("|")) throw new Error(`Media source id cannot contain |: ${source.id}`);
    return { id: String(source.id ?? `${type}-${index + 1}`), type, path: String(source.path) };
  });
  return (mediaRoots ?? []).map((sourcePath, index) => ({ id: `legacy-${index + 1}`, type: "mixed", path: String(sourcePath) }));
}

async function validateMediaSources(mediaSources) {
  const ids = new Set();
  for (const source of mediaSources) {
    if (ids.has(source.id)) throw new Error(`Duplicate media source id: ${source.id}`);
    ids.add(source.id);
    const details = await stat(path.resolve(source.path)).catch(() => null);
    if (!details?.isDirectory()) throw new Error(`Media source is missing or unavailable: ${source.id} (${source.path})`);
  }
}

async function publishMetadataSafely(outputPath, output) {
  const candidatePath = `${outputPath}.candidate`;
  const backupPath = `${outputPath}.previous`;
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  await writeFile(candidatePath, serialized, "utf8");
  // Never replace the live catalogue with an incomplete/corrupt candidate.
  // This matters especially when Windows is interrupted during a large scan.
  JSON.parse(await readFile(candidatePath, "utf8"));
  const current = await stat(outputPath).catch(() => null);
  if (current?.isFile()) {
    const currentText = await readFile(outputPath, "utf8").catch(() => null);
    if (currentText) {
      try {
        JSON.parse(currentText);
        await copyFile(outputPath, backupPath);
      } catch {
        console.warn("Existing live catalogue is corrupt; preserving the last valid backup instead.");
      }
    }
  }
  await renameWithWindowsRetry(candidatePath, outputPath);
}

async function renameWithWindowsRetry(sourcePath, destinationPath) {
  const retryableCodes = new Set(["EBUSY", "EACCES", "EPERM"]);
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code)) throw error;
      await delay(250 * (attempt + 1));
    }
  }
  try {
    await unlink(destinationPath);
    await rename(sourcePath, destinationPath);
  } catch (error) {
    if (!(await stat(destinationPath).catch(() => null))) {
      await copyFile(`${destinationPath}.previous`, destinationPath).catch(() => null);
    }
    throw error ?? lastError;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
