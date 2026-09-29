import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src", "wrestling-reference.generated.json");
const outputDirectory = path.join(root, "src", "wrestling-reference-pages");
const reference = JSON.parse(await readFile(sourcePath, "utf8"));
const arrayEntries = Object.entries(reference).filter(([, value]) => Array.isArray(value));
const eventLookup = buildEventLookup(reference);
const pages = new Map();
const sharedArrays = {};
const splitCounts = {};

for (const [key, records] of arrayEntries) {
  const shared = [];
  let splitCount = 0;
  for (const record of records) {
    const scope = resolveScope(record, eventLookup);
    if (!scope) {
      shared.push(record);
      continue;
    }
    const pageKey = `${scope.promotionId}:${scope.year}`;
    const page = pages.get(pageKey) ?? {
      promotionId: scope.promotionId,
      year: scope.year,
      collections: {},
    };
    (page.collections[key] ??= []).push(record);
    pages.set(pageKey, page);
    splitCount += 1;
  }
  if (shared.length) sharedArrays[key] = shared;
  if (splitCount) splitCounts[key] = splitCount;
}

await mkdir(outputDirectory, { recursive: true });
const generatedAt = new Date().toISOString();
const promotionIndex = {};

for (const page of [...pages.values()].sort((a, b) => a.promotionId.localeCompare(b.promotionId) || a.year - b.year)) {
  const promotionDirectory = path.join(outputDirectory, page.promotionId);
  await mkdir(promotionDirectory, { recursive: true });
  const relativePath = `${page.promotionId}/${page.year}.generated.json`;
  await writeFile(
    path.join(outputDirectory, relativePath),
    `${JSON.stringify({
      schemaVersion: reference.schemaVersion ?? 1,
      generatedAt,
      source: "wrestling-reference.generated.json",
      promotionId: page.promotionId,
      year: page.year,
      ...page.collections,
    })}\n`,
  );
  (promotionIndex[page.promotionId] ??= []).push({
    year: page.year,
    path: `./wrestling-reference-pages/${relativePath.replaceAll("\\", "/")}`,
    counts: Object.fromEntries(Object.entries(page.collections).map(([key, records]) => [key, records.length])),
  });
}

const scalarMetadata = Object.fromEntries(Object.entries(reference).filter(([, value]) => !Array.isArray(value)));
await writeFile(
  path.join(outputDirectory, "shared.generated.json"),
  `${JSON.stringify({
    ...scalarMetadata,
    generatedAt,
    source: "wrestling-reference.generated.json",
    ...sharedArrays,
  })}\n`,
);
await writeFile(
  path.join(outputDirectory, "index.generated.json"),
  `${JSON.stringify({
    schemaVersion: reference.schemaVersion ?? 1,
    generatedAt,
    source: "wrestling-reference.generated.json",
    shared: "./wrestling-reference-pages/shared.generated.json",
    promotions: promotionIndex,
    splitCounts,
    sharedCounts: Object.fromEntries(Object.entries(sharedArrays).map(([key, records]) => [key, records.length])),
  }, null, 2)}\n`,
);

const originalCounts = Object.fromEntries(arrayEntries.map(([key, records]) => [key, records.length]));
for (const [key, originalCount] of Object.entries(originalCounts)) {
  const reconstructedCount = (splitCounts[key] ?? 0) + (sharedArrays[key]?.length ?? 0);
  if (reconstructedCount !== originalCount) {
    throw new Error(`${key} split mismatch: expected ${originalCount}, wrote ${reconstructedCount}`);
  }
}

console.log(`Split ${pages.size} promotion/year pages across ${Object.keys(promotionIndex).length} promotions.`);
console.log(`Index: ${path.join(outputDirectory, "index.generated.json")}`);

function buildEventLookup(database) {
  const lookup = new Map();
  for (const collection of [database.events, database.episodes]) {
    for (const record of collection ?? []) {
      const scope = directScope(record);
      if (!scope) continue;
      for (const id of [record.id, record.referenceId, record.eventId, record.episodeId].filter(Boolean)) {
        lookup.set(String(id), scope);
      }
    }
  }
  return lookup;
}

function resolveScope(record, lookup) {
  const direct = directScope(record);
  if (direct) return direct;
  for (const id of [
    record?.eventId,
    record?.eventReferenceId,
    record?.showId,
    record?.episodeId,
    record?.referenceId,
    record?.parentId,
  ].filter(Boolean)) {
    const linked = lookup.get(String(id));
    if (linked) return linked;
  }
  return null;
}

function directScope(record) {
  const promotionId = String(record?.promotionId ?? record?.promotion ?? "").trim().toLowerCase();
  const year = Number(record?.year ?? String(record?.date ?? record?.airDate ?? record?.broadcastDate ?? "").slice(0, 4));
  if (!promotionId || !Number.isInteger(year) || year < 1800 || year > 2200) return null;
  return { promotionId, year };
}
