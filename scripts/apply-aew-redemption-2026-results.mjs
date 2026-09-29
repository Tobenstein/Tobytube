import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "src", "wrestling-reference.generated.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
const eventId = "cagematch-aew-454424";
const sourceId = "official-aew-redemption-2026-results";
const sourceUrl = "https://www.allelitewrestling.com/post/aew-redemption-results-july-26-2026";

const event = db.events.find((item) => item.id === eventId);
if (!event) throw new Error(`Missing canonical AEW Redemption event: ${eventId}`);

Object.assign(event, {
  matchCardStatus: "completed",
  mainEvent: 'Kenny Omega (c) vs. "The Jet" Kevin Knight',
  sourceIds: [...new Set([...(event.sourceIds ?? []), sourceId])],
  externalIds: { ...(event.externalIds ?? {}), officialAewResults: sourceUrl },
  resultsUpdatedAt: new Date().toISOString(),
});

const rows = [
  row("AEW World Trios Championship", "The Conglomeration (Orange Cassidy, Kyle O'Reilly & Roderick Strong) (c)", "The Lethal Twist (Jay Lethal, Blake Christian & Lee Johnson)", "The Conglomeration", { preshow: true }),
  multi("Six-Way Ladder Match — AEW International Championship opportunity", '"Speedball" Mike Bailey', ['"Jungle" Jack Perry', "Komander", "The Beast Mortos", "Nick Wayne", "El Clon"]),
  row(null, "The Young Bucks (Matt Jackson & Nick Jackson)", "Will Ospreay & Jon Moxley", "The Young Bucks"),
  row("AEW International Championship", "Kyle Fletcher (c)", "Bandido", "Kyle Fletcher"),
  row("Double Chain Match", "The Dogs (David Finlay & Clark Connors)", "Bang Bang Gang (Juice Robinson & Jay White)", "The Dogs"),
  row("AEW TBS Championship", "Hikaru Shida (c)", "Maya World", "Maya World", { titleChange: true }),
  row("AEW World Tag Team Championship", "Adam Copeland & Christian Cage (c)", "PAC & Claudio Castagnoli", "Adam Copeland & Christian Cage"),
  row("No Holds Barred Match", '"The Painmaker" Chris Jericho', '"Psycho Killer" Tommaso Ciampa', '"The Painmaker" Chris Jericho'),
  row("AEW National Championship", "Mark Davis (c)", "Andrade El Ídolo", "Andrade El Ídolo", { titleChange: true }),
  row("AEW Women's World Championship", '"The Toxic Spider" Thekla (c)', "Willow Nightingale", "Willow Nightingale", { titleChange: true }),
  row("AEW World Championship", "Kenny Omega (c)", 'TNT Champion "The Jet" Kevin Knight', "Kenny Omega"),
];

const staleEventIds = new Set(
  db.events.filter((item) => item.date === "2026-07-26" && /AEW Redemption/i.test(item.title ?? item.name ?? "")).map((item) => item.id),
);
db.matches = db.matches.filter((match) => {
  if (match.eventId === eventId) return false;
  if (staleEventIds.has(match.eventId) && match.sourceIds?.includes("sdh-wwe-achievement-event-details")) return false;
  return true;
});

rows.forEach((item, index) => {
  const sides = item.sides;
  const names = sides.flatMap(extractNames);
  db.matches.push({
    id: `${eventId}-official-match-${index + 1}`,
    eventId,
    eventRecordType: "event",
    promotionId: "aew",
    order: index + 1,
    label: String(index + 1),
    raw: `${item.stipulation ? `${item.stipulation}: ` : ""}${sides.join(" vs. ")} — ${item.winner} won`,
    displayText: `${item.stipulation ? `${item.stipulation}: ` : ""}${sides.join(" vs. ")}`,
    stipulation: item.stipulation ?? "Match",
    titleMatch: /Championship/i.test(item.stipulation ?? "") ? item.stipulation : null,
    championshipId: championshipId(item.stipulation),
    participants: names.map((name) => ({ id: `person-${slug(name)}`, name, externalIds: {} })),
    teams: sides.map((name, side) => ({ name, side: side === 0 ? "side-a" : "side-b" })),
    champions: sides.filter((name) => /\(c\)/i.test(name)).map((name) => ({ name: name.replace(/\s*\(c\)\s*/gi, "").trim() })),
    championMarked: sides.some((name) => /\(c\)/i.test(name)),
    spoilerSafe: true,
    winner: item.winner,
    result: "defeats",
    titleChange: Boolean(item.titleChange),
    preshow: Boolean(item.preshow),
    night: null,
    sourceIds: [sourceId],
    externalIds: { officialAewResults: sourceUrl },
  });
});

upsert(db.sources, {
  id: sourceId,
  name: "Official AEW Redemption 2026 results",
  type: "event-results",
  url: sourceUrl,
  priority: 1,
  notes: "Official AEW event recap used for the completed spoiler-safe card, winners, champions, stipulations, and title changes.",
});
db.generatedAt = new Date().toISOString();
fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
console.log(`Applied ${rows.length} official AEW Redemption matches and removed stale duplicate-result rows.`);

function row(stipulation, sideA, sideB, winner, options = {}) {
  return { stipulation, sides: [sideA, sideB], winner, ...options };
}

function multi(stipulation, winner, opponents) {
  return { stipulation, sides: [winner, ...opponents], winner };
}

function extractNames(side) {
  return side
    .replace(/\s*\(c\)\s*/gi, "")
    .replace(/^[^(]+\(([^)]+)\)$/, "$1")
    .split(/\s*&\s*|\s*,\s*/)
    .map((name) => name.replace(/^TNT Champion\s+/i, "").replace(/^['"]|['"]$/g, "").trim())
    .filter(Boolean);
}

function championshipId(value) {
  if (!/Championship/i.test(value ?? "")) return null;
  return `aew-${slug(value.replace(/^AEW\s+/i, ""))}`;
}

function slug(value) {
  return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function upsert(records, next) {
  const index = records.findIndex((item) => item.id === next.id);
  if (index >= 0) records[index] = { ...records[index], ...next };
  else records.push(next);
}
