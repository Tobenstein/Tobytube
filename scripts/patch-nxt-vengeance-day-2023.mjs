import { readFile, writeFile } from "node:fs/promises";

const referenceUrl = new URL("../src/wrestling-reference.generated.json", import.meta.url);
const db = JSON.parse(await readFile(referenceUrl, "utf8"));
const event = (db.events ?? []).find((item) => item.promotionId === "wwe" && item.date === "2023-02-04" && /NXT Vengeance Day/i.test(item.title ?? ""));
if (!event) throw new Error("NXT Vengeance Day 2023 event record was not found.");

const sourceUrl = "https://www.thesmackdownhotel.com/events-results/ppv-special/nxt-vengeance-day-2023";
const cards = [
  ["Wes Lee (c) vs. Dijak", "NXT North American Championship", "Wes Lee", ["Wes Lee", "Dijak"]],
  ["Fallon Henley & Kiana James vs. Katana Chance & Kayden Carter (c)", "NXT Women's Tag Team Championship", "Fallon Henley & Kiana James", ["Fallon Henley", "Kiana James", "Katana Chance", "Kayden Carter"]],
  ["Carmelo Hayes vs. Apollo Crews", "2 out of 3 Falls Match", "Carmelo Hayes", ["Carmelo Hayes", "Apollo Crews"]],
  ["Gallus vs. The New Day (c) vs. Pretty Deadly vs. Chase U", "NXT Tag Team Championship Fatal 4-Way Match", "Gallus", ["Mark Coffey", "Wolfgang", "Kofi Kingston", "Xavier Woods", "Elton Prince", "Kit Wilson", "Andre Chase", "Duke Hudson"]],
  ["Roxanne Perez (c) vs. Gigi Dolin vs. Jacy Jayne", "NXT Women's Championship Triple Threat Match", "Roxanne Perez", ["Roxanne Perez", "Gigi Dolin", "Jacy Jayne"]],
  ["Bron Breakker (c) vs. Grayson Waller", "NXT Championship Steel Cage Match", "Bron Breakker", ["Bron Breakker", "Grayson Waller"]],
];

db.matches = (db.matches ?? []).filter((match) => match.eventId !== event.id);
db.matches.push(...cards.map(([displayText, stipulation, winner, participants], index) => ({
  id: `${event.id}-match-${index + 1}`,
  eventId: event.id,
  eventRecordType: "event",
  promotionId: "wwe",
  order: index + 1,
  label: String(index + 1),
  raw: `${stipulation}: ${displayText}`,
  displayText,
  stipulation,
  titleMatch: /Championship/i.test(stipulation) ? stipulation.replace(/\s+(?:Fatal 4-Way|Triple Threat|Steel Cage) Match$/i, "") : null,
  championshipId: null,
  participants: participants.map((name) => ({ name })),
  teams: [],
  champions: participants.filter((name) => displayText.includes(`${name} (c)`)),
  championMarked: displayText.includes("(c)"),
  spoilerSafe: true,
  winner,
  result: "defeats",
  sourceIds: ["sdh-wwe-achievement-event-details"],
  externalIds: { sdh: { url: sourceUrl } },
})));
event.mainEvent = "Bron Breakker vs. Grayson Waller";
event.matchCount = cards.length;
event.sourceIds = [...new Set([...(event.sourceIds ?? []), "sdh-wwe-achievement-event-details"])];
await writeFile(referenceUrl, `${JSON.stringify(db, null, 2)}\n`);
console.log(`Patched ${event.title} with ${cards.length} spoiler-safe match-card records.`);
