import { execFile } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const uiPath = path.join(root, "src", "wrestling-reference-ui.generated.json");
const libraryPath = path.join(root, "src", "wrestling-library.generated.json");
const gitExecutable = getArg("--git") ?? "git";

const { stdout } = await execFileAsync(
  gitExecutable,
  ["show", "HEAD:src/wrestling-reference.generated.json"],
  { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
);

const db = JSON.parse(stdout);
const ui = JSON.parse(await readFile(uiPath, "utf8"));
const library = JSON.parse(await readFile(libraryPath, "utf8"));

db.events ??= [];
db.episodes ??= [];
db.matches ??= [];
db.people ??= [];
db.championships ??= [];
db.titleReigns ??= [];

const indexes = new Map([
  [db.events, indexById(db.events)],
  [db.episodes, indexById(db.episodes)],
  [db.matches, indexById(db.matches)],
  [db.people, indexById(db.people)],
  [db.championships, indexById(db.championships)],
  [db.titleReigns, indexById(db.titleReigns)],
]);

for (const record of library.records ?? []) {
  const target = record.recordType === "episode" ? db.episodes : db.events;
  const referenceId = record.referenceId ?? record.id;
  upsert(target, {
    id: referenceId,
    promotionId: record.promotionId,
    seriesId: record.seriesId ?? null,
    name: record.title,
    title: record.title,
    displayTitle: record.displayTitle ?? record.title,
    date: record.date ?? null,
    broadcastDate: record.broadcastDate ?? record.date ?? null,
    year: record.year ?? null,
    season: record.season ?? null,
    episodeNumber: record.episodeNumber ?? null,
    eventType: record.eventType ?? null,
    catalogSection: record.catalogSection ?? null,
    tourName: record.tourName ?? null,
    venue: record.venue ?? null,
    location: record.location ?? null,
    city: record.city ?? null,
    region: record.region ?? null,
    country: record.country ?? null,
    attendance: record.attendance ?? null,
    summary: record.summary ?? null,
    posterUrl: record.posterUrl ?? null,
    art: record.art ?? null,
    sourceIds: ["generated-library-recovery"],
  });

  for (const match of record.matches ?? []) {
    const matchId = match.id ?? `${referenceId}-match-${db.matches.length + 1}`;
    upsert(db.matches, {
      ...match,
      id: matchId,
      eventId: record.recordType === "event" ? referenceId : null,
      episodeId: record.recordType === "episode" ? referenceId : null,
      promotionId: record.promotionId,
    });
    for (const participant of match.participants ?? []) {
      const name = typeof participant === "string" ? participant : participant.name;
      const personId = typeof participant === "string" ? slug(participant) : participant.personId ?? slug(name);
      if (name && personId) upsert(db.people, { id: personId, name });
    }
  }
}

for (const championship of ui.championships ?? []) upsert(db.championships, championship);
for (const reign of ui.titleReigns ?? []) upsert(db.titleReigns, reign);

db.generatedAt = new Date().toISOString();
const tempPath = `${referencePath}.recovering`;
await writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`);
await rename(tempPath, referencePath);

console.log(JSON.stringify({
  events: db.events.length,
  episodes: db.episodes.length,
  matches: db.matches.length,
  people: db.people.length,
  championships: db.championships.length,
  titleReigns: db.titleReigns.length,
}, null, 2));

function upsert(records, next) {
  const recordIndex = indexes.get(records) ?? indexById(records);
  indexes.set(records, recordIndex);
  const index = recordIndex.get(next.id) ?? -1;
  if (index >= 0) records[index] = { ...records[index], ...next };
  else {
    recordIndex.set(next.id, records.length);
    records.push(next);
  }
}

function indexById(records) {
  return new Map(records.map((record, index) => [record.id, index]));
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
