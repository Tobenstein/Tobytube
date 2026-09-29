import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "src", "wrestling-reference.generated.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
const eventId = "sdh-wwe-ppv-history-wwe-hall-of-fame-2026";
const sourceId = "wikipedia-wwe-hall-of-fame-2026-inductees";
const sourceUrl = "https://en.wikipedia.org/wiki/WWE_Hall_of_Fame#2026";
const event = db.events.find((item) => item.id === eventId);
if (!event) throw new Error(`Missing WWE Hall of Fame event: ${eventId}`);

Object.assign(event, {
  title: "WWE Hall of Fame 2026", promotionId: "wwe", promotion: "WWE",
  date: "2026-04-17", dateDisplay: "April 17, 2026", venue: "Dolby Live at Park MGM",
  city: "Las Vegas", region: "Nevada", country: "United States", location: "Las Vegas, Nevada",
  eventType: "Hall of Fame Ceremony",
  summary: "WWE's 2026 Hall of Fame ceremony presented the 27th class of inductees on the eve of WrestleMania 42.",
  mainEvent: null, matchCardStatus: null, inductionCardStatus: "complete",
  sourceIds: [...new Set([...(event.sourceIds ?? []).filter((id) => id !== "sdh-wwe-achievement-event-details"), sourceId])],
  externalIds: { ...(event.externalIds ?? {}), wikipediaHallOfFame: sourceUrl },
  inductions: [
    induction("Individual", "Stephanie McMahon", ["Linda McMahon"]),
    induction("Individual", "AJ Styles", ["Luke Gallows", "Karl Anderson"]),
    induction("Group", "Demolition", ["Arn Anderson", "Haku", "The Warlord"], { members: ["Ax", "Smash"] }),
    induction("Celebrity", "Dennis Rodman", ["Kevin Nash", "Sean Waltman"]),
    induction("Legacy", "Sycho Sid", [], { posthumous: true }),
    induction("Legacy", "Bad News Brown", [], { posthumous: true }),
    induction("Immortal Moment", "Hulk Hogan vs. André the Giant at WrestleMania III", ["Jimmy Hart"], { description: "Singles match for the WWF World Heavyweight Championship" }),
  ],
});
event.inductions.forEach((item, index) => { item.order = index + 1; });
db.matches = (db.matches ?? []).filter((match) => match.eventId !== eventId);
upsert(db.sources, { id: sourceId, name: "Wikipedia WWE Hall of Fame 2026 inductee table", type: "hall-of-fame-inductees", url: sourceUrl, priority: 30, notes: "Structured induction-card source. These rows are not wrestling matches." });
db.generatedAt = new Date().toISOString();
fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
console.log(`Applied ${event.inductions.length} WWE Hall of Fame 2026 induction-card entries.`);

function induction(category, inductee, inductedBy, extra = {}) { return { id: `wwe-hof-2026-${slug(category)}-${slug(inductee)}`, order: 0, category, inductee, inductedBy, sourceIds: [sourceId], externalIds: { wikipedia: sourceUrl }, ...extra }; }
function slug(value) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function upsert(records, next) { const index = records.findIndex((item) => item.id === next.id); if (index >= 0) records[index] = { ...records[index], ...next }; else records.push(next); }
