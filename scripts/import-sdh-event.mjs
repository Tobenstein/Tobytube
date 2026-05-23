import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const url = process.argv[2];
const debug = process.argv.includes("--debug");

if (!url) {
  throw new Error("Usage: node scripts/import-sdh-event.mjs <the-smackdown-hotel-event-url>");
}

const db = await readJson(referencePath, emptyDb());
const html = await fetchText(url);
const event = parseEvent(html, url);

upsertById(db.events, event);
upsertSource(db.sources, "thesmackdownhotel-events");
db.generatedAt = new Date().toISOString();

await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);
console.log(`Imported ${event.title}: ${event.date ?? "unknown date"} / ${event.venue ?? "unknown venue"}`);

async function fetchText(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "Tobytube personal metadata importer (local prototype)",
    },
  });
  if (!response.ok) throw new Error(`TheSmackDownHotel fetch failed: ${response.status}`);
  return response.text();
}

function parseEvent(html, sourceUrl) {
  const title = clean(matchOne(html, /<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i) ?? "");
  if (!title) throw new Error("Could not find event title.");

  const text = htmlToText(html);
  const info = parseEventInfo(text);
  if (debug) {
    console.log(JSON.stringify({ info, textTail: text.slice(Math.max(0, text.toLowerCase().lastIndexOf("event info") - 200), text.toLowerCase().lastIndexOf("event info") + 1600) }, null, 2));
  }
  const overview = clean(
    matchOne(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
      matchOne(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ??
      "",
  );

  return {
    id: `sdh-${slug(title)}`,
    title,
    promotion: normalizePromotion(info.Promotion ?? inferPromotion(title)),
    date: parseDate(info["Event Date"]),
    endDate: parseDate(info["End Date"]),
    country: info.Country ?? null,
    location: info.Location ?? null,
    venue: info.Arena ?? null,
    attendance: parseNumber(info.Attendance),
    eventSeries: info["Event Series"] ?? null,
    eventType: info["Event Type"] ?? null,
    network: info.Network ?? null,
    runningTime: info["Running Time"] ?? null,
    mainEvent: info["Main Event"] ?? null,
    notes: info.Notes ?? null,
    summary: overview || null,
    sourceIds: ["thesmackdownhotel-events"],
    externalIds: {
      thesmackdownhotel: sourceUrl,
    },
    importedAt: new Date().toISOString(),
  };
}

function parseEventInfo(text) {
  const marker = text.match(/Event Info/gi);
  if (!marker) return {};
  const lastMarker = text.toLowerCase().lastIndexOf("event info");
  const section = text
    .slice(lastMarker)
    .split(/Game Appearances|Latest WWE PPV Events|Work With Us/i)[0] ?? "";
  const labels = [
    "Promotion",
    "Brand",
    "Event Type",
    "Year",
    "Event Date",
    "End Date",
    "Country",
    "Location",
    "Notes",
    "Arena",
    "Event Series",
    "Network",
    "Attendance",
    "Running Time",
    "Commentary By",
    "Ring Announcer",
    "Theme Song",
    "Main Event",
  ];
  const info = {};
  const positions = [];
  let cursor = 0;
  const lowerSection = section.toLowerCase();
  for (const label of labels) {
    const index = lowerSection.indexOf(label.toLowerCase(), cursor);
    if (index < 0) continue;
    positions.push({ label, index });
    cursor = index + label.length;
  }

  for (let index = 0; index < positions.length; index += 1) {
    const { label } = positions[index];
    const valueStart = positions[index].index + label.length;
    const valueEnd = positions[index + 1]?.index ?? section.length;
    const value = cleanInfoValue(label, section.slice(valueStart, valueEnd));
    if (value) info[label] = value;
  }

  return info;
}

function cleanInfoValue(label, value = "") {
  return dedupeRepeatedText(
    clean(value)
    .replace(new RegExp(`^${escapeRegex(label)}:?\\s*`, "i"), "")
    .replace(/^Country:\s*/i, "")
    .replace(/\s*WrestleMania: Event History[\s\S]*$/i, "")
    .trim(),
  );
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, " $1 ")
    .replace(/<\/(p|li|h1|h2|h3|div|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
}

function clean(value = "") {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function parseDate(value) {
  if (!value) return null;
  const simple = value.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (simple) {
    const [, monthName, day, year] = simple;
    const month = {
      january: "01",
      february: "02",
      march: "03",
      april: "04",
      may: "05",
      june: "06",
      july: "07",
      august: "08",
      september: "09",
      october: "10",
      november: "11",
      december: "12",
    }[monthName.toLowerCase()];
    if (month) return `${year}-${month}-${day.padStart(2, "0")}`;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
}

function dedupeRepeatedText(value) {
  const parts = value.split(/\s+/);
  if (parts.length % 2 !== 0) return value;
  const half = parts.length / 2;
  const left = parts.slice(0, half).join(" ");
  const right = parts.slice(half).join(" ");
  return left === right ? left : value;
}

function parseNumber(value) {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function inferPromotion(title) {
  if (/^WWE\b/i.test(title)) return "WWE";
  if (/^WWF\b/i.test(title)) return "WWE";
  if (/^WCW\b/i.test(title)) return "WCW";
  if (/^ECW\b/i.test(title)) return "ECW";
  if (/^AEW\b/i.test(title)) return "AEW";
  if (/^ROH\b/i.test(title)) return "ROH";
  if (/^NJPW\b/i.test(title)) return "NJPW";
  return null;
}

function normalizePromotion(value) {
  if (!value) return null;
  if (/World Wrestling Entertainment|WWE|WWF/i.test(value)) return "WWE";
  if (/World Championship Wrestling|WCW/i.test(value)) return "WCW";
  if (/Extreme Championship Wrestling|ECW/i.test(value)) return "ECW";
  if (/All Elite Wrestling|AEW/i.test(value)) return "AEW";
  if (/Ring of Honor|ROH/i.test(value)) return "ROH";
  if (/New Japan Pro.?Wrestling|NJPW/i.test(value)) return "NJPW";
  return value;
}

function upsertById(records, next) {
  const index = records.findIndex((record) => record.id === next.id);
  if (index >= 0) records[index] = { ...records[index], ...next };
  else records.push(next);
}

function upsertSource(sources, id) {
  if (!sources.some((source) => source.id === id)) sources.push({ id });
}

function matchOne(value, regex) {
  return value.match(regex)?.[1] ?? null;
}

function slug(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function emptyDb() {
  return {
    schemaVersion: 1,
    generatedAt: null,
    sources: [],
    promotions: [],
    series: [],
    events: [],
    episodes: [],
    venues: [],
    people: [],
    matches: [],
    championships: [],
    titleReigns: [],
    externalIds: [],
  };
}
