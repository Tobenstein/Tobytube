import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promotions } from "../src/data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const sourcesPath = path.join(root, "config", "wrestling-reference-sources.json");
const command = process.argv[2] ?? "summary";

if (command === "init") {
  const sources = await readJson(sourcesPath, { sources: [] });
  const db = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: sources.sources,
    promotions: promotions.map((promotion) => ({
      id: promotion.id,
      name: promotion.name,
      summary: promotion.summary,
      externalIds: {},
    })),
    series: promotions.flatMap((promotion) =>
      promotion.shows.map((show) => ({
        id: `${promotion.id}-${show.id}`,
        promotionId: promotion.id,
        name: show.name,
        shortName: show.shortName,
        startDate: show.startDate,
        endDate: show.endDate ?? null,
        externalIds: {},
      })),
    ),
    events: [],
    episodes: [],
    venues: [],
    people: [],
    matches: [],
    championships: [],
    titleReigns: [],
    externalIds: [],
  };

  await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);
  console.log(`Initialized wrestling reference DB: ${db.promotions.length} promotions, ${db.series.length} series.`);
} else if (command === "summary") {
  const db = await readJson(referencePath, {});
  console.log(
    JSON.stringify(
      {
        schemaVersion: db.schemaVersion ?? null,
        generatedAt: db.generatedAt ?? null,
        sources: db.sources?.length ?? 0,
        promotions: db.promotions?.length ?? 0,
        series: db.series?.length ?? 0,
        events: db.events?.length ?? 0,
        episodes: db.episodes?.length ?? 0,
        venues: db.venues?.length ?? 0,
        people: db.people?.length ?? 0,
        matches: db.matches?.length ?? 0,
        championships: db.championships?.length ?? 0,
        titleReigns: db.titleReigns?.length ?? 0,
      },
      null,
      2,
    ),
  );
} else {
  throw new Error(`Unknown command: ${command}`);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}
