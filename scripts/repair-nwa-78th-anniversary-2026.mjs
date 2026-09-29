import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "src", "wrestling-reference.generated.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
const eventId = "sdh-wwe-ppv-history-nwa-78th-anniversary-show";
const sourceId = "sdh-nwa-78th-anniversary-2026-card";
const sourceUrl = "https://www.thesmackdownhotel.com/events-results/ppv-special/nwa-78th-anniversary-show";

const cleanEvent = {
  id: eventId,
  title: "NWA 78th Anniversary Show",
  promotionId: "nwa",
  promotion: "National Wrestling Alliance",
  date: "2026-07-25",
  dateDisplay: "July 25, 2026",
  venue: "2300 Arena",
  city: "Philadelphia",
  region: "Pennsylvania",
  country: "United States",
  location: "Philadelphia, Pennsylvania",
  attendance: null,
  eventType: "Special Event",
  seriesName: "NWA Anniversary Show",
  seriesId: "nwa-anniversary-show",
  episodeNumber: null,
  recordType: "event",
  summary: "The NWA's 78th Anniversary Show was held at Philadelphia's 2300 Arena, with matches taped for later airing on Powerrr.",
  notes: "This is a Signature Live Event. Matches are taped for later airing on Powerrr.",
  mainEvent: null,
  matchCardStatus: "announced-card-results-unconfirmed",
  sourceIds: ["sdh-wwe-ppv-history", sourceId],
  externalIds: { sdh: { url: sourceUrl } },
  importedAt: new Date().toISOString(),
};

db.events = db.events.filter((item) => item.id !== eventId);
db.events.push(cleanEvent);
db.matches = db.matches.filter((item) => item.eventId !== eventId);

const card = [
  bout("NWA Worlds Heavyweight Championship", ['"Thrillbilly" Silas Mason (c)', "Carson Bartholomew Drake"], { championshipId: "nwa-worlds-heavyweight-championship", managers: ["Aron Stevens"] }),
  bout("NWA World Tag Team Championship", ["The Country Gentlemen (AJ Cazana & KC Cazana) (c)", "Blunt Force Trauma (Carnage & Damage)"], { championshipId: "nwa-world-tag-team-championship", managers: ["Joe Cazana"] }),
  bout("NWA Worlds Heavyweight Championship #1 Contender Five-Way Match", ["Heath", "Talos", "Kratos", "Effy", "Pretty Boy Smooth"]),
  bout("Three-Way Match", ["Nattie", "Kenzie Paige", "Kylie Paige"]),
  bout("Match", ["Kerry Morton", "Colby Corino"]),
  bout("Match", ["Natalia Markova", "Gretta"], { managers: ["Tiffany Nieves"] }),
  bout("Dog Collar Match", ["Daisy Kill", "Eric Smalls"]),
  bout("Knights of the Round Table Match", ["The Royal Court (King Trevor Murdoch, Mike Knox & Magic Jake Dumas)", "The Federation of Champions (Sage Chantz & Tommy Rant, Buster & Lockjaw Drake)"], { managers: ["Tyler Franks", "Aron Stevens"] }),
];

card.forEach((item, index) => db.matches.push({
  id: `${eventId}-announced-match-${index + 1}`,
  eventId,
  eventRecordType: "event",
  promotionId: "nwa",
  order: index + 1,
  label: String(index + 1),
  sourceListOrder: index + 1,
  matchOrderConfirmed: false,
  raw: `${item.stipulation}: ${item.sides.join(" vs. ")}`,
  displayText: `${item.stipulation === "Match" ? "" : `${item.stipulation}: `}${item.sides.join(" vs. ")}`,
  stipulation: item.stipulation,
  titleMatch: item.championshipId ? item.stipulation : null,
  championshipId: item.championshipId ?? null,
  participants: item.sides.map(cleanName).map((name) => ({ id: `person-${slug(name)}`, name, externalIds: {} })),
  teams: item.sides.map((name, side) => ({ name, side: side === 0 ? "side-a" : "side-b" })),
  champions: item.sides.filter((name) => /\(c\)/i.test(name)).map((name) => ({ name: cleanName(name) })),
  championMarked: item.sides.some((name) => /\(c\)/i.test(name)),
  managers: item.managers ?? [],
  spoilerSafe: true,
  winner: null,
  result: null,
  titleChange: null,
  night: null,
  cardStatus: "announced-results-unconfirmed",
  sourceIds: [sourceId],
  externalIds: { sdh: { url: sourceUrl } },
}));

upsert(db.sources, {
  id: sourceId,
  name: "TheSmackDownHotel NWA 78th Anniversary Show announced card",
  type: "event-card",
  url: sourceUrl,
  priority: 10,
  notes: "Authorised source for event information and the announced card only; no winners or results inferred.",
});
db.generatedAt = new Date().toISOString();
fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
console.log(`Repaired NWA 78th Anniversary Show with ${card.length} announced matches and no inferred results.`);

function bout(stipulation, sides, options = {}) { return { stipulation, sides, ...options }; }
function cleanName(value) { return value.replace(/\s*\(c\)\s*/gi, "").trim(); }
function slug(value) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function upsert(records, next) { const index = records.findIndex((item) => item.id === next.id); if (index >= 0) records[index] = { ...records[index], ...next }; else records.push(next); }
