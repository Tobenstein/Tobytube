import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = JSON.parse(fs.readFileSync(path.join(root, "src", "wrestling-reference.generated.json"), "utf8"));
const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.replace(/^--/, "").split("="); return [key, value]; }));
const promotion = String(args.promotion ?? "all").toLowerCase();
const year = Number(args.year ?? 0);
const today = new Date().toISOString().slice(0, 10);
const errors = [];
const warnings = [];
const contaminant = /Work With Us|Comment Login|You must login|Loading comment|Latest PPV|Follow Us|characters left/i;
const inScope = (item) => (promotion === "all" || item.promotionId === promotion) && (!year || String(item.date ?? "").startsWith(String(year)));
const records = [...(db.events ?? []), ...(db.episodes ?? [])];
const recordById = new Map(records.map((item) => [item.id, item]));

for (const table of ["events", "episodes"]) {
  const seen = new Set();
  const identities = new Map();
  for (const record of db[table] ?? []) {
    if (!inScope(record)) continue;
    if (seen.has(record.id)) errors.push(`${table}: duplicate id ${record.id}`);
    seen.add(record.id);
    const identity = `${String(record.title ?? record.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${record.date ?? ""}`;
    if (identities.has(identity) && identities.get(identity) !== record.id) errors.push(`${table}: duplicate event identity ${record.title} (${record.date})`);
    identities.set(identity, record.id);
    for (const key of ["summary", "venue", "location", "mainEvent", "notes"]) {
      const value = record[key];
      if (typeof value === "string" && (value.length > 1200 || contaminant.test(value))) errors.push(`${record.id}: polluted ${key}`);
    }
  }
}

const matchKeys = new Set();
const participantKeys = new Set();
for (const match of db.matches ?? []) {
  const event = recordById.get(match.eventId);
  if (!event) { warnings.push(`${match.id}: orphaned match`); continue; }
  if (!inScope(event)) continue;
  const display = String(match.displayText ?? match.raw ?? "").replace(/\s+/g, " ").trim();
  const key = `${match.eventId}|${display.toLowerCase()}`;
  if (display && matchKeys.has(key)) errors.push(`${match.eventId}: duplicate match ${display}`);
  if (display) matchKeys.add(key);
  if (event.date > today && (match.winner || match.result || match.titleChange === true)) errors.push(`${match.id}: future event contains a result`);
  if (contaminant.test(display)) errors.push(`${match.id}: polluted match text`);
  const names = (match.participants ?? []).map((item) => String(item.name ?? item).toLowerCase().trim()).filter(Boolean);
  if (names.length > 1 && new Set(names).size !== names.length) errors.push(`${match.id}: duplicate participant`);
  const participantKey = names.length > 1 ? `${match.eventId}|${[...new Set(names)].sort().join("|")}` : "";
  if (participantKey && participantKeys.has(participantKey)) errors.push(`${match.eventId}: duplicate bout participants ${names.join(" vs. ")}`);
  if (participantKey) participantKeys.add(participantKey);
}

const report = { ok: errors.length === 0, promotion, year: year || null, checkedAt: new Date().toISOString(), counts: { records: records.filter(inScope).length, matches: (db.matches ?? []).filter((match) => inScope(recordById.get(match.eventId) ?? {})).length }, errors: errors.slice(0, 500), warnings: warnings.slice(0, 100) };
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
