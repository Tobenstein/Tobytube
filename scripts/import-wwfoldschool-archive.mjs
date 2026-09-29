import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const args = parseArgs(process.argv.slice(2));

const archive = await readJson(path.resolve(root, args.input), { records: [] });
const db = await readJson(referencePath, {});

db.sources = db.sources ?? [];
db.promotions = db.promotions ?? [];
db.series = db.series ?? [];
db.events = db.events ?? [];
db.episodes = db.episodes ?? [];
db.people = db.people ?? [];
db.matches = db.matches ?? [];

upsertById(db.sources, archive.source ?? { id: "wwfoldschool-archive", name: "WWF Old School archive" });

const existingMatchesByEvent = groupBy(db.matches, "eventId");
let createdRecords = 0;
let updatedRecords = 0;
let createdMatches = 0;
let skippedExistingCards = 0;

for (const archiveRecord of archive.records ?? []) {
  ensureSeries(db, archiveRecord);
  const collection = archiveRecord.recordType === "event" ? db.events : db.episodes;
  const existing = findExistingRecord(collection, archiveRecord);
  const record = existing ?? buildReferenceRecord(archiveRecord);

  mergeReferenceRecord(record, archiveRecord);
  if (existing) updatedRecords += 1;
  else {
    collection.push(record);
    createdRecords += 1;
  }

  const currentMatches = existingMatchesByEvent[record.id] ?? [];
  const archiveMatches = archiveRecord.matches ?? [];
  if (archiveMatches.length && !currentMatches.length) {
    for (const match of archiveMatches) {
      db.matches.push(buildReferenceMatch(match, record, archiveRecord));
      createdMatches += 1;
    }
    existingMatchesByEvent[record.id] = archiveMatches;
  } else if (archiveMatches.length && currentMatches.length) {
    skippedExistingCards += 1;
  }
}

db.generatedAt = new Date().toISOString();
await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);

console.log(
  `Imported WWFOldSchool archive: ${createdRecords} new records, ${updatedRecords} updated records, ${createdMatches} new matches, ${skippedExistingCards} existing cards left intact.`,
);

function buildReferenceRecord(record) {
  return {
    id: record.id,
    title: record.title,
    promotionId: record.promotionId,
    promotion: record.promotion,
    date: record.dateIso,
    dateDisplay: record.date,
    venue: null,
    city: null,
    region: null,
    country: null,
    location: null,
    attendance: null,
    announcers: [],
    eventType: record.eventType,
    recordType: record.recordType,
    sourceIds: [],
    externalIds: {},
    importedAt: new Date().toISOString(),
  };
}

function mergeReferenceRecord(target, source) {
  target.title = target.title ?? source.title;
  target.promotionId = target.promotionId ?? source.promotionId;
  target.promotion = target.promotion ?? source.promotion;
  target.date = target.date ?? source.dateIso;
  target.dateDisplay = target.dateDisplay ?? source.date;
  target.eventType = target.eventType ?? source.eventType;
  target.recordType = target.recordType ?? source.recordType;
  if (source.recordType === "episode") {
    target.seriesName = target.seriesName ?? source.seriesName;
    target.seriesId = target.seriesId ?? seriesId(source.promotionId, source.seriesName);
    target.episodeNumber = target.episodeNumber ?? source.episodeNumber ?? null;
  }
  target.sourceIds = unique([...(target.sourceIds ?? []), "wwfoldschool-archive"]);
  target.externalIds = target.externalIds ?? {};
  target.externalIds.wwfoldschool = target.externalIds.wwfoldschool ?? {};
  target.externalIds.wwfoldschool[source.sourcePage?.section ?? "archive"] = {
    url: source.url,
    sourcePage: source.sourcePage,
  };
  if (source.segments?.length) {
    target.segments = uniqueBy([...(target.segments ?? []), ...source.segments], (segment) => segment.text);
  }
}

function buildReferenceMatch(match, record, source) {
  return {
    id: `${record.id}-wwfoldschool-match-${match.order}`,
    eventId: record.id,
    eventRecordType: record.recordType,
    promotionId: record.promotionId,
    order: match.order,
    label: match.label,
    raw: match.raw,
    displayText: match.displayText,
    stipulation: match.stipulation,
    titleMatch: match.titleMatch,
    championshipId: null,
    participants: match.participants ?? [],
    teams: match.teams ?? [],
    champions: match.champions ?? [],
    championMarked: match.championMarked ?? false,
    spoilerSafe: true,
    sourceIds: ["wwfoldschool-archive"],
    externalIds: {
      wwfoldschool: {
        url: source.url,
      },
    },
    winner: null,
    result: null,
  };
}

function findExistingRecord(collection, source) {
  const date = source.dateIso;
  if (source.recordType === "episode") {
    const wantedSeries = normalizeKey(source.seriesName);
    return collection.find(
      (record) =>
        record.promotionId === source.promotionId &&
        record.date === date &&
        normalizeKey(record.seriesName ?? record.title).includes(wantedSeries.slice(0, 16)),
    );
  }

  const wantedTitle = normalizeKey(source.title);
  return collection.find(
    (record) =>
      record.promotionId === source.promotionId &&
      record.date === date &&
      (normalizeKey(record.title) === wantedTitle || normalizeKey(record.title).includes(wantedTitle) || wantedTitle.includes(normalizeKey(record.title))),
  );
}

function ensureSeries(db, record) {
  if (record.recordType !== "episode" || !record.seriesName) return;
  const id = seriesId(record.promotionId, record.seriesName);
  if (db.series.some((series) => series.id === id)) return;
  db.series.push({
    id,
    promotionId: record.promotionId,
    name: record.seriesName,
    shortName: record.seriesName,
    startDate: record.dateIso,
    endDate: null,
    externalIds: {
      wwfoldschool: record.url,
    },
  });
}

function seriesId(promotionId, name = "") {
  return `${promotionId}-${slug(name)}`;
}

function groupBy(records, key) {
  return records.reduce((groups, record) => {
    const value = record[key];
    groups[value] = groups[value] ?? [];
    groups[value].push(record);
    return groups;
  }, {});
}

function upsertById(collection, record) {
  const index = collection.findIndex((item) => item.id === record.id);
  if (index >= 0) collection[index] = { ...collection[index], ...record };
  else collection.push(record);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeKey(value = "") {
  return String(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value = "") {
  return normalizeKey(value).replace(/\s+/g, "-");
}

function parseArgs(rawArgs) {
  const parsed = {
    input: "cache/wwfoldschool-archive.json",
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    if (rawArgs[index] === "--input") parsed.input = rawArgs[++index];
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
