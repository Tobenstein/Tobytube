import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const movieDetails = JSON.parse(await readFile(path.join(root, "src", "movie-detail.generated.json"), "utf8"));
const tvDetails = JSON.parse(await readFile(path.join(root, "src", "tv-detail.generated.json"), "utf8"));
const curatedManifest = JSON.parse(await readFile(path.join(root, "src", "curated-manifest.generated.json"), "utf8"));
const currentCuratedIds = getCurrentCuratedIds(curatedManifest);

const rows = [];
for (const record of Object.values(movieDetails.movies ?? {})) {
  if (!record.matched && isCurrentRecord(record)) rows.push(toRow("movie", record));
}
for (const record of Object.values(tvDetails.shows ?? {})) {
  if (!record.matched && isCurrentRecord(record)) rows.push(toRow("tv", record));
}

rows.sort((a, b) => `${a.mediaType}\t${a.title}`.localeCompare(`${b.mediaType}\t${b.title}`));

const header = ["mediaType", "title", "year", "id", "genre", "collectionId", "error"];
const output = [
  header.join("\t"),
  ...rows.map((row) => header.map((key) => cleanCell(row[key])).join("\t")),
].join("\r\n");

const desktopPath = path.join(os.homedir(), "Desktop", "tobytube-unmatched-media.tsv");
await writeFile(desktopPath, `${output}\r\n`);
console.log(`Wrote ${rows.length} unmatched rows to ${desktopPath}`);

function isCurrentRecord(record) {
  if (!record.id?.startsWith("curated-")) return true;
  return currentCuratedIds.has(record.id);
}

function getCurrentCuratedIds(manifest) {
  const collectionIds = Object.values(manifest.collections ?? {}).flatMap((collection) =>
    (collection.sections ?? []).flatMap((section) => (section.items ?? []).map((item) => item.id).filter(Boolean)),
  );
  const criterionIds = ["noir", "directorShowcase", "boxedSets", "officialChannelCollections"].flatMap((bucket) =>
    (manifest.criterion?.[bucket] ?? []).flatMap((collection) => (collection.items ?? []).map((item) => item.id).filter(Boolean)),
  );
  return new Set([...collectionIds, ...criterionIds]);
}

function toRow(mediaType, record) {
  return {
    mediaType,
    title: record.title,
    year: record.year ?? "",
    id: record.id ?? "",
    genre: record.genre ?? "",
    collectionId: record.collectionId ?? "",
    error: record.error ?? "",
  };
}

function cleanCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .trim();
}
