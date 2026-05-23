import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const url = process.argv[2];
const championshipId = getArg("--championship-id") ?? slug(url?.split("/").pop()?.replace(/^List_of_/, "").replace(/_Champions$/i, "") ?? "");
const championshipName = getArg("--championship-name") ?? championshipId.split("-").map(capitalize).join(" ");

if (!url) {
  throw new Error("Usage: node scripts/import-wikipedia-title-reigns.mjs <wikipedia-list-url> --championship-id wcw-world-heavyweight");
}

const db = await readJson(referencePath, emptyDb());
const html = await fetchText(url);
const reigns = parseTitleReigns(html, championshipId);

upsertChampionship(db.championships, {
  id: championshipId,
  name: championshipName,
  externalIds: {
    wikipedia: url,
  },
});

db.titleReigns = db.titleReigns.filter((reign) => reign.championshipId !== championshipId);
for (const reign of reigns) {
  upsertById(db.titleReigns, reign);
}

upsertSource(db.sources, "wikipedia-title-reigns");
db.generatedAt = new Date().toISOString();

await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);
console.log(`Imported ${reigns.length} reign rows for ${championshipName}.`);

async function fetchText(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "Tobytube personal metadata importer (local prototype)",
    },
  });
  if (!response.ok) throw new Error(`Wikipedia fetch failed: ${response.status}`);
  return response.text();
}

function parseTitleReigns(html, titleId) {
  const tables = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/gi) ?? [];
  const rows = [];

  for (const table of tables) {
    if (!/Champion/i.test(table) || !/Reign/i.test(table) || !/Date won|Date/i.test(table)) continue;
    const parsedRows = parseRows(table, titleId);
    if (parsedRows.length) rows.push(...parsedRows);
  }

  return rows;
}

function parseRows(table, titleId) {
  const output = [];
  const rowHtml = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  let headers = [];

  for (const row of rowHtml) {
    const headerCells = extractCells(row, "th");
    const dataCells = extractCells(row, "td");
    if (headerCells.length >= 3 && !dataCells.length) {
      headers = normalizeHeaders(headerCells);
      continue;
    }

    const cells = extractAllCells(row);
    if (!cells.length || !headers.length) continue;
    const mapped = cells.length >= 7 ? mapStandardReignCells(cells) : mapCells(headers, cells);
    const number = mapped.no ?? mapped.number;
    const champion = mapped.champion;
    const dateWon = mapped.date ?? mapped["date won"] ?? mapped["date won/location"] ?? mapped["championship change date"];
    if (!number || !champion || !dateWon) continue;

    output.push({
      id: `${titleId}-${slug(number)}-${slug(champion)}-${slug(dateWon)}`,
      championshipId: titleId,
      number: clean(number),
      champion: clean(champion),
      dateWon: parseDate(dateWon),
      event: clean(mapped.event ?? mapped["event/notes"] ?? mapped.notes ?? ""),
      location: clean(mapped.location ?? ""),
      reign: clean(mapped.reign ?? ""),
      days: parseNumber(mapped.days),
      recognizedDays: parseNumber(mapped["days recog"] ?? mapped["days recognized"] ?? mapped.recognized),
      notes: clean(mapped.notes ?? mapped["event/notes"] ?? ""),
      sourceIds: ["wikipedia-title-reigns"],
    });
  }

  return output;
}

function extractAllCells(row) {
  return [...row.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(([, , value]) => clean(htmlToText(value)))
    .filter(Boolean);
}

function mapStandardReignCells(cells) {
  return {
    no: cells[0],
    champion: cells[1],
    date: cells[2],
    event: cells[3],
    location: cells[4],
    reign: cells[5],
    days: cells[6],
    notes: cells.slice(7).join(" "),
  };
}

function extractCells(row, cellName) {
  const regex = new RegExp(`<${cellName}[^>]*>([\\s\\S]*?)<\\/${cellName}>`, "gi");
  return [...row.matchAll(regex)].map(([, value]) => clean(htmlToText(value)));
}

function normalizeHeaders(cells) {
  return cells.map((cell) =>
    cell
      .toLowerCase()
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^#$/, "no")
      .trim(),
  );
}

function mapCells(headers, cells) {
  const mapped = {};
  for (let index = 0; index < cells.length; index += 1) {
    mapped[headers[index] ?? `col${index}`] = cells[index];
  }
  return mapped;
}

function htmlToText(html) {
  return html
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#160;/g, " ")
    .replace(/&#91;.*?&#93;/g, "");
}

function clean(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function parseDate(value = "") {
  const cleaned = clean(value);
  const simple = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
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
  const parsed = Date.parse(cleaned);
  if (Number.isNaN(parsed)) return clean(value);
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseNumber(value) {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function upsertChampionship(records, next) {
  upsertById(records, next);
}

function upsertById(records, next) {
  const index = records.findIndex((record) => record.id === next.id);
  if (index >= 0) records[index] = { ...records[index], ...next };
  else records.push(next);
}

function upsertSource(sources, id) {
  if (!sources.some((source) => source.id === id)) sources.push({ id });
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function capitalize(value = "") {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
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
