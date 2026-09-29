import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const db = JSON.parse(await readFile(referencePath, "utf8"));

const removedIds = new Set();
db.episodes = removeTapingScaffolds(db.episodes ?? [], removedIds);
db.events = removeTapingScaffolds(db.events ?? [], removedIds);
db.matches = (db.matches ?? []).filter((match) => !removedIds.has(match.eventId));
db.generatedAt = new Date().toISOString();

await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);
console.log(`Removed ${removedIds.size} taping scaffold records and their matches from wrestling-reference.generated.json.`);

function removeTapingScaffolds(records, removed) {
  return records.filter((record) => {
    if (!isTapingScaffold(record)) return true;
    removed.add(record.id);
    return false;
  });
}

function isTapingScaffold(record) {
  const title = String(record.title ?? "");
  const eventType = String(record.eventType ?? "");
  return (
    /internet broadcast/i.test(eventType) ||
    /\b(?:TV-?Taping|TV Taping)\s*@\s+/i.test(title) ||
    /^\s*(?:WCW|WWF|WWE|ECW|TNA|AEW|ROH|NJPW|AJPW|NOAH|AWA|WCCW|NWA|JCP)\b.*\s@\s+/i.test(title) ||
    /^\s*(?:WCW|WWF|WWE|ECW|TNA|AEW|ROH|NJPW|AJPW|NOAH|AWA|WCCW)\s*@\s+/i.test(title)
  );
}
