import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(await readFile(path.join(root, "src", "wrestling-library-wwe-index.generated.json"), "utf8"));
const totals = { records: 0, events: 0, eventPosters: 0, eventCards: 0, eventLocations: 0, eventSummaries: 0 };

for (const year of index.years ?? []) {
  const page = JSON.parse(await readFile(path.join(root, "src", "wrestling-library-pages", `wwe-${year}.generated.json`), "utf8"));
  const events = page.records.filter((record) => record.recordType === "event");
  const row = {
    year,
    records: page.records.length,
    events: events.length,
    posters: events.filter((record) => record.posterUrl).length,
    cards: events.filter((record) => record.matchCount > 0).length,
    locations: events.filter((record) => record.location || record.venue).length,
    summaries: events.filter((record) => record.summary).length,
  };
  totals.records += row.records;
  totals.events += row.events;
  totals.eventPosters += row.posters;
  totals.eventCards += row.cards;
  totals.eventLocations += row.locations;
  totals.eventSummaries += row.summaries;
  if (year >= 1985) console.log(Object.values(row).join("\t"));
}

console.log(JSON.stringify(totals));
