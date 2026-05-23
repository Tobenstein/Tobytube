import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const sourceUrl = process.argv[2] ?? "https://en.wikipedia.org/wiki/List_of_WWE_television_programming";
const promotionId = getArg("--promotion-id") ?? "wwe";
const promotionName = getArg("--promotion-name") ?? "WWE";

const db = await readJson(referencePath, emptyDb());
const raw = await fetchRawWikitext(sourceUrl);
const programs = [
  ...parseCurrentWeeklyPrograms(raw),
  ...parseCurrentEventSeries(raw, "Premium live events", "premium-live-event-series"),
  ...parseCurrentEventSeries(raw, "Television specials", "television-special-series"),
  ...parseHeadingPrograms(raw),
].map((program) => ({
  id: `${promotionId}-${slug(program.name)}`,
  promotionId,
  promotion: promotionName,
  externalIds: program.page ? { wikipedia: `https://en.wikipedia.org/wiki/${program.page}` } : {},
  sourceIds: ["wikipedia-programming-list"],
  ...program,
}));

for (const program of uniqueById(programs)) {
  upsertById(db.series, program);
}

upsertSource(db.sources, "wikipedia-programming-list");
db.generatedAt = new Date().toISOString();
await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);

const summary = uniqueById(programs).reduce((counts, program) => {
  counts[program.programType] = (counts[program.programType] ?? 0) + 1;
  return counts;
}, {});
console.log(`Imported ${uniqueById(programs).length} ${promotionName} programming records.`);
console.log(JSON.stringify(summary, null, 2));

async function fetchRawWikitext(url) {
  const pageTitle = decodeURIComponent(url.split("/wiki/")[1] ?? url).replace(/#.*$/, "");
  const rawUrl = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(pageTitle)}&action=raw`;
  const response = await fetch(rawUrl, {
    headers: {
      "user-agent": "Tobytube personal metadata importer (local prototype)",
    },
  });
  if (!response.ok) throw new Error(`Wikipedia raw fetch failed: ${response.status}`);
  return response.text();
}

function parseCurrentWeeklyPrograms(raw) {
  const table = sectionBetween(raw, "==== Weekly television shows ====", "==== Television specials ====");
  return parseWikiRows(table)
    .map((cells) => {
      if (cells.length < 3) return null;
      const title = parseWikiLink(cells[0]);
      if (!title?.label || /\bn\/a\b/i.test(title.label)) return null;
      return {
        name: title.label,
        page: title.page,
        programType: "weekly",
        category: "current in-ring show",
        status: "current",
        startYear: parseYear(cells[1]),
        endYear: null,
        notes: cleanWikiText(cells[2]),
        brands: cleanWikiText(cells[3] ?? ""),
      };
    })
    .filter(Boolean);
}

function parseCurrentEventSeries(raw, heading, programType) {
  const nextHeading = heading === "Premium live events" ? "==== Weekly television shows ====" : "### Other shows";
  const table = sectionBetween(raw, `==== ${heading} ====`, nextHeading);
  const programs = [];

  for (const cells of parseWikiRows(table)) {
    for (let index = 1; index < cells.length - 1; index += 2) {
      const title = parseWikiLink(cells[index]);
      if (!title?.label || /\bn\/a\b/i.test(title.label)) continue;
      programs.push({
        name: title.label,
        page: title.page,
        programType,
        category: heading.toLowerCase(),
        status: "current",
        startYear: parseYear(cells[index + 1]),
        endYear: null,
        notes: "",
      });
    }
  }

  return programs;
}

function parseHeadingPrograms(raw) {
  const programs = [];
  let currentStatus = null;
  let currentCategory = null;

  for (const line of raw.split(/\r?\n/)) {
    const h2 = line.match(/^==\s*(.+?)\s*==$/);
    if (h2) {
      currentStatus = /former/i.test(h2[1]) ? "former" : /current/i.test(h2[1]) ? "current" : currentStatus;
      continue;
    }

    const h3 = line.match(/^===\s*(.+?)\s*===$/);
    if (h3) {
      currentCategory = cleanWikiText(h3[1]).toLowerCase();
      continue;
    }

    const h4 = line.match(/^====\s*(.+?)\s*====\s*$/);
    if (!h4) continue;
    const parsed = parseHeadingTitle(h4[1]);
    if (!parsed?.name) continue;

    programs.push({
      name: parsed.name,
      page: parsed.page,
      programType: programTypeFromCategory(currentCategory),
      category: currentCategory,
      status: currentStatus ?? "unknown",
      startYear: parsed.startYear,
      endYear: parsed.endYear,
      notes: "",
    });
  }

  return programs;
}

function parseHeadingTitle(value) {
  const range = cleanWikiText(value).match(/\((\d{4})(?:[–-](present|\d{4}))?\)/i);
  const links = [...value.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
  const italicNames = [...value.matchAll(/''([^']+)''/g)].map(([, name]) => cleanWikiText(name));
  const linkedNames = links.map(([, page, label]) => ({ page, label: cleanWikiText(label ?? page) }));
  const first = linkedNames[0] ?? (italicNames[0] ? { page: null, label: italicNames.join(" and ") } : null);
  if (!first) return null;

  return {
    name: first.label,
    page: first.page,
    startYear: range ? Number(range[1]) : null,
    endYear: !range || !range[2] || /present/i.test(range[2]) ? null : Number(range[2]),
  };
}

function programTypeFromCategory(category = "") {
  if (/recap/i.test(category)) return "recap";
  if (/reality/i.test(category)) return "reality";
  if (/other/i.test(category)) return "other";
  if (/in-ring/i.test(category)) return "weekly";
  return "program";
}

function parseWikiRows(tableText) {
  return tableText
    .split(/\n\|-/)
    .map((row) =>
      row
        .split(/\n\|/)
        .slice(1)
        .map((cell) => cell.replace(/^rowspan="[^"]+"\s*\|/i, "").replace(/^colspan="[^"]+"\s*\|/i, "").trim()),
    )
    .filter((cells) => cells.length);
}

function parseWikiLink(value = "") {
  const link = value.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (!link) return { page: null, label: cleanWikiText(value) };
  const [, page, label] = link;
  return { page, label: cleanWikiText(label ?? page) };
}

function sectionBetween(raw, startMarker, endMarker) {
  const start = raw.indexOf(startMarker);
  if (start < 0) return "";
  const end = raw.indexOf(endMarker, start + startMarker.length);
  return raw.slice(start, end < 0 ? raw.length : end);
}

function cleanWikiText(value = "") {
  return value
    .replace(/\{\{n\/a\}\}/gi, "N/a")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''/g, "")
    .replace(/''/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<ref[^/]*\/>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseYear(value = "") {
  const year = cleanWikiText(value).match(/\b(19|20)\d{2}\b/);
  return year ? Number(year[0]) : null;
}

function uniqueById(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function upsertById(records, next) {
  const index = records.findIndex((record) => record.id === next.id);
  if (index >= 0) records[index] = { ...records[index], ...next };
  else records.push(next);
}

function upsertSource(sources, id) {
  if (!sources.some((source) => source.id === id)) sources.push({ id });
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
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
