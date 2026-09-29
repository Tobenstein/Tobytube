import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const inputFiles = process.argv.slice(2);
if (!inputFiles.length) throw new Error("Usage: node scripts/import-cagematch-njpw-events.mjs <cached-page.html> [...more pages]");

const db = JSON.parse(await readFile(referencePath, "utf8"));
const importedAt = new Date().toISOString();
const parsed = [];
for (const inputFile of inputFiles) parsed.push(...parseRows(await readFile(path.resolve(root, inputFile), "utf8")));
const requested = dedupe(parsed).filter((event) => event.date >= "2024-01-01" && event.date <= "2026-12-31").sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

const replaced = db.events.filter((event) => event.promotionId === "njpw" && /^202[456]-/.test(event.date ?? "")).length;
db.events = db.events.filter((event) => !(event.promotionId === "njpw" && /^202[456]-/.test(event.date ?? "")));
let inserted = 0;
for (const event of requested) {
  db.events.push(toReferenceEvent(event, importedAt));
  inserted += 1;
}

db.sources = db.sources ?? [];
if (!db.sources.some((source) => source.id === "cagematch-njpw-events")) db.sources.push({ id: "cagematch-njpw-events", name: "Cagematch NJPW event archive", url: "https://www.cagematch.net/en/?id=8&nr=7&page=4" });
db.generatedAt = importedAt;
await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);
const byYear = Object.groupBy(requested, (event) => event.date.slice(0, 4));
const tours = requested.filter((event) => event.catalogSection === "tours").length;
console.log(`Imported ${requested.length} authoritative Cagematch NJPW listings (${replaced} prior 2024-2026 records replaced).`);
console.log(`Years: ${Object.entries(byYear).map(([year, events]) => `${year}: ${events.length}`).join(", ")}. Tours: ${tours}; events & specials: ${requested.length - tours}.`);

function parseRows(html) {
  return [...html.matchAll(/<tr class="[^"]*\bTRow(?:1|2)\b[^\"]*">([\s\S]*?)<\/tr>/gi)].map((row) => {
    const cells = [...row[1].matchAll(/<td class="[^"]*\bTCol\b[^"]*">([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 5) return null;
    const date = parseGermanDate(text(cells[1]));
    const eventLink = cells[3].match(/href="([^"]*\bid=1(?:&amp;|&)nr=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!date || !eventLink) return null;
    const sourceTitle = text(eventLink[2]);
    const numberedDay = /\s-\sTag\s+\d+\b/i.test(sourceTitle);
    const title = localizeNumberedDay(sourceTitle);
    return {
      cagematchId: eventLink[1].match(/(?:&amp;|&)nr=(\d+)/i)?.[1] ?? null,
      sourceTitle,
      title,
      date,
      promotions: [...cells[2].matchAll(/alt="([^"]+)"/gi)].map((match) => decode(match[1])),
      location: text(cells[4]),
      eventType: classToEventType(row[0]),
      cagematchRating: numberOrNull(text(cells[7])),
      cagematchVotes: numberOrNull(text(cells[8])),
      catalogSection: numberedDay ? "tours" : "events",
      tourName: numberedDay ? title.replace(/\s+-\s+Day\s+\d+\b.*$/i, "") : null,
    };
  }).filter(Boolean);
}

function toReferenceEvent(event, timestamp) {
  return {
    id: `cagematch-njpw-${event.cagematchId ?? slug(`${event.date}-${event.sourceTitle}`)}`,
    title: event.title, sourceTitle: event.sourceTitle, promotionId: "njpw", promotion: "New Japan Pro-Wrestling",
    coPromotions: event.promotions.filter((name) => !/New Japan Pro Wrestling/i.test(name)),
    date: event.date, dateDisplay: event.date, venue: null, city: event.location || null, region: null,
    country: inferCountry(event.location), location: event.location || null, attendance: null, eventType: event.eventType,
    catalogSection: event.catalogSection, tourName: event.tourName,
    cagematchRating: event.cagematchRating, cagematchVotes: event.cagematchVotes,
    recordType: "event", summary: null,
    sourceIds: ["cagematch-njpw-events"],
    externalIds: { cagematch: `https://www.cagematch.net/en/?id=1&nr=${event.cagematchId}` }, importedAt: timestamp,
  };
}

function mergeEvent(existing, event, timestamp) {
  const incoming = toReferenceEvent(event, timestamp);
  return { ...incoming, ...existing, title: incoming.title, sourceTitle: incoming.sourceTitle,
    city: existing.city ?? incoming.city, country: existing.country ?? incoming.country, location: existing.location ?? incoming.location,
    eventType: existing.eventType ?? incoming.eventType, catalogSection: incoming.catalogSection, tourName: incoming.tourName,
    sourceIds: [...new Set([...(existing.sourceIds ?? []), "cagematch-njpw-events"])],
    externalIds: { ...(existing.externalIds ?? {}), ...incoming.externalIds }, importedAt: timestamp };
}

function findExistingEvent(events, incoming) {
  return events.findIndex((event) => event.promotionId === "njpw" && event.date === incoming.date && (String(event.externalIds?.cagematch ?? "").includes(`nr=${incoming.cagematchId}`) || comparableTitle(event.title) === comparableTitle(incoming.title)));
}

function reconcileLegacyRecords(events, timestamp) {
  let count = 0;
  const legacy = events.filter((event) => event.promotionId === "njpw" && /^202[456]-/.test(event.date ?? "") && !(event.sourceIds ?? []).includes("cagematch-njpw-events"));
  for (const oldRecord of legacy) {
    const candidates = events
      .filter((event) => (event.sourceIds ?? []).includes("cagematch-njpw-events"))
      .filter((event) => Math.abs(dateNumber(event.date) - dateNumber(oldRecord.date)) <= 86400000)
      .map((event) => ({ event, score: titleSimilarity(event.title, oldRecord.title) }))
      .sort((a, b) => b.score - a.score);
    const match = candidates[0];
    if (!match || match.score < 0.5) continue;
    const oldIndex = events.indexOf(oldRecord);
    const newIndex = events.indexOf(match.event);
    const merged = {
      ...match.event,
      ...oldRecord,
      title: match.event.title,
      sourceTitle: match.event.sourceTitle,
      catalogSection: match.event.catalogSection,
      tourName: match.event.tourName,
      coPromotions: match.event.coPromotions,
      sourceIds: [...new Set([...(oldRecord.sourceIds ?? []), ...(match.event.sourceIds ?? [])])],
      externalIds: { ...(oldRecord.externalIds ?? {}), ...(match.event.externalIds ?? {}) },
      importedAt: timestamp,
    };
    events[oldIndex] = merged;
    events.splice(newIndex > oldIndex ? newIndex : newIndex, 1);
    count += 1;
  }
  return count;
}

function reassignMisfiledGlobalWars(events) {
  let count = 0;
  for (const event of events) {
    if (event.promotionId !== "njpw" || (event.sourceIds ?? []).includes("cagematch-njpw-events") || !/Global Wars/i.test(event.title ?? "")) continue;
    if (/^AEW\b/i.test(event.title)) {
      event.promotionId = "aew";
      event.promotion = "All Elite Wrestling";
      count += 1;
    } else if (/^ROH\b/i.test(event.title)) {
      event.promotionId = "roh";
      event.promotion = "Ring of Honor";
      count += 1;
    }
  }
  return count;
}

function titleSimilarity(left, right) {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return (2 * intersection) / (a.size + b.size);
}

function titleTokens(value) {
  const ignored = new Set(["njpw", "new", "japan", "pro", "wrestling", "in", "at", "the", "event", "presents", "day"]);
  return new Set(comparableTitle(value).split(/\s+/).filter((token) => token && !ignored.has(token) && !/^20\d{2}$/.test(token)));
}

function dateNumber(value) {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}
function dedupe(events) { const byId = new Map(); events.forEach((event) => byId.set(event.cagematchId ?? `${event.date}|${event.sourceTitle}`, event)); return [...byId.values()]; }
function localizeNumberedDay(title) { return title.replace(/(\s-\s)Tag(\s+\d+\b)/gi, "$1Day$2"); }
function classToEventType(rowHtml) { if (/TRowPPV/i.test(rowHtml)) return "Pay Per View"; if (/TRowPremiumLiveEvent/i.test(rowHtml)) return "Premium Live Event"; if (/TRowOnlineStream/i.test(rowHtml)) return "Online Stream"; if (/TRowTVShow/i.test(rowHtml)) return "TV Show"; if (/TRowHouseShow/i.test(rowHtml)) return "House Show"; return "Event"; }
function parseGermanDate(value) { const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : null; }
function comparableTitle(value = "") { return String(value).toLowerCase().replace(/\btag(?=\s+\d+\b)/g, "day").replace(/[^a-z0-9]+/g, " ").trim(); }
function inferCountry(location = "") { const country = String(location).split(",").at(-1)?.trim(); return /^Mexiko$/i.test(country) ? "Mexico" : country || null; }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) && value !== "" ? number : null; }
function text(html = "") { return decode(String(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
function decode(value = "") { return String(value).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))); }
function slug(value = "") { return String(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
