import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const outputPath = path.join(root, "src", "wrestling-library.generated.json");
const args = parseArgs(process.argv.slice(2));

const reference = await readJson(referencePath, {});
const posters = await readJson(posterPath, {});
const records = buildLibraryRecords(reference, posters, args);

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "wrestling-reference.generated.json",
      filter: args,
      records,
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${records.length} visible wrestling library records.`);

function buildLibraryRecords(referenceDb, posterCache, options) {
  const startYear = Number(options.startYear);
  const endYear = Number(options.endYear);
  const promotionId = options.promotionId;
  const matchesByEvent = groupBy(referenceDb.matches ?? [], "eventId");

  return (referenceDb.episodes ?? [])
    .filter((episode) => episode.promotionId === promotionId)
    .filter((episode) => {
      const year = Number(episode.date?.slice(0, 4));
      return year >= startYear && year <= endYear;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    .map((episode, index) => {
      const year = Number(episode.date.slice(0, 4));
      const recordId = `library-${episode.id}`;
      const poster = posterCache[recordId] ?? posterCache[episode.id] ?? posterCache[seasonPosterKey(episode)];
      return {
        id: recordId,
        referenceId: episode.id,
        mediaType: "wrestling",
        promotionId: episode.promotionId,
        promotionName: displayPromotion(episode.promotion),
        title: episode.title,
        displayTitle: episode.seriesName ?? episode.title,
        series: episode.seriesName ?? null,
        seriesId: episode.seriesId ?? null,
        season: year,
        year,
        episodeNumber: episode.episodeNumber ?? null,
        date: episode.date,
        eventType: episode.eventType ?? "TV Show",
        status: "dummy",
        source: "reference-db-dummy-library",
        venue: episode.venue ?? null,
        location: episode.location ?? null,
        city: episode.city ?? null,
        region: episode.region ?? null,
        country: episode.country ?? null,
        matches: (matchesByEvent[episode.id] ?? [])
          .sort((a, b) => a.order - b.order)
          .map((match) => ({
            order: match.order,
            match: match.displayText ?? match.raw,
            stipulation: match.stipulation ?? match.titleMatch ?? "Match",
            titleMatch: match.titleMatch ?? null,
            champions: match.champions ?? [],
            participants: match.participants ?? [],
          })),
        posterCode: posterCode(episode.seriesName ?? episode.title),
        posterUrl: poster?.posterUrl ?? null,
        posterA: colorForSeries(episode.seriesName).posterA,
        posterB: colorForSeries(episode.seriesName).posterB,
        art: {
          posterUrl: poster?.posterUrl ?? null,
          source: poster?.source ?? "fallback",
          tmdbId: poster?.tmdbId ?? null,
          seasonNumber: poster?.seasonNumber ?? null,
          seasonName: poster?.seasonName ?? null,
        },
        inWatchlist: index % 17 === 0,
        watchProgress: index % 29 === 0 ? 42 : 0,
        addedAt: `2026-05-${String((index % 24) + 1).padStart(2, "0")}`,
      };
    });
}

function groupBy(records, key) {
  return records.reduce((groups, record) => {
    const value = record[key];
    groups[value] = groups[value] ?? [];
    groups[value].push(record);
    return groups;
  }, {});
}

function seasonPosterKey(episode) {
  return `season-${episode.promotionId}-${slug(episode.seriesName ?? episode.title)}-${episode.date?.slice(0, 4)}`;
}

function colorForSeries(series = "") {
  const normalized = series.toLowerCase();
  if (normalized.includes("raw")) return { posterA: "#8f2e34", posterB: "#d8b35d" };
  if (normalized.includes("smackdown")) return { posterA: "#2761b7", posterB: "#8fd0ff" };
  if (normalized.includes("heat")) return { posterA: "#c5532e", posterB: "#f3d15f" };
  if (normalized.includes("jakked") || normalized.includes("metal")) return { posterA: "#32405f", posterB: "#c45243" };
  if (normalized.includes("shotgun")) return { posterA: "#283143", posterB: "#c07a52" };
  if (normalized.includes("superstars")) return { posterA: "#303f71", posterB: "#d7dce8" };
  if (normalized.includes("super astros") || normalized.includes("súper astros")) return { posterA: "#304f74", posterB: "#c05f4f" };
  return { posterA: "#2b2e35", posterB: "#d8b35d" };
}

function displayPromotion(promotion = "") {
  if (/federation/i.test(promotion)) return "WWF";
  if (/entertainment/i.test(promotion)) return "WWE";
  return promotion || "Wrestling";
}

function posterCode(title = "") {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function parseArgs(rawArgs) {
  const parsed = {
    promotionId: "wwe",
    startYear: "1990",
    endYear: "1999",
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--promotion") parsed.promotionId = rawArgs[++index];
    if (arg === "--start-year") parsed.startYear = rawArgs[++index];
    if (arg === "--end-year") parsed.endYear = rawArgs[++index];
  }

  return parsed;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
