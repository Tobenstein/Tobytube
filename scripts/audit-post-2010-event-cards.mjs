import { readFile } from "node:fs/promises";

const db = JSON.parse(await readFile(new URL("../src/wrestling-reference.generated.json", import.meta.url), "utf8"));
const eventIdsWithMatches = new Set((db.matches ?? []).map((match) => match.eventId));
const audit = new Map();
const today = new Date().toISOString().slice(0, 10);

for (const event of db.events ?? []) {
  if (String(event.date ?? "").slice(0, 4) < "2010" || event.date > today) continue;
  if (/Hall of Fame|WWE Draft/i.test(event.title ?? "")) continue;
  const promotionId = event.promotionId ?? "unknown";
  if (!audit.has(promotionId)) audit.set(promotionId, new Map());
  const canonicalKey = `${event.date}|${String(event.title ?? "").trim().toLowerCase()}`;
  const promotionEvents = audit.get(promotionId);
  if (!promotionEvents.has(canonicalKey)) promotionEvents.set(canonicalKey, { date: event.date, title: event.title, hydrated: false, sourceIds: new Set() });
  const canonical = promotionEvents.get(canonicalKey);
  canonical.hydrated ||= eventIdsWithMatches.has(event.id);
  (event.sourceIds ?? []).forEach((sourceId) => canonical.sourceIds.add(sourceId));
}

for (const [promotionId, promotionEvents] of [...audit.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const events = [...promotionEvents.values()];
  const hydrated = events.filter((event) => event.hydrated);
  const missing = events.filter((event) => !event.hydrated);
  console.log(`${promotionId}: ${hydrated.length}/${events.length} canonical cards; ${missing.length} missing`);
  missing.slice(0, 8).forEach((event) => console.log(`  ${event.date} ${event.title} [${[...event.sourceIds].join(", ")}]`));
}

const rumbleRows = (db.tournaments ?? [])
  .filter((tournament) => /^wwe-royal-rumble-(?:men|women)$/.test(tournament.id))
  .flatMap((tournament) => tournament.results ?? [])
  .filter((row) => String(row.date ?? "") >= "2010-01-01");
const rumbleTargets = rumbleRows.flatMap((row) => [
  { date: row.date, label: row.event, id: row.eventId },
  row.championshipMatch && typeof row.championshipMatch === "object"
    ? { date: row.championshipMatch.date, label: row.championshipMatch.event, id: row.championshipMatch.eventId }
    : null,
]).filter(Boolean);
const unhydratedRumbleTargets = rumbleTargets.filter((target) => target.id && !eventIdsWithMatches.has(target.id));
console.log(`Royal Rumble linked events since 2010: ${rumbleTargets.length - unhydratedRumbleTargets.length}/${rumbleTargets.length} hydrated`);
unhydratedRumbleTargets.forEach((target) => console.log(`  ${target.date} ${target.label} [${target.id}]`));
