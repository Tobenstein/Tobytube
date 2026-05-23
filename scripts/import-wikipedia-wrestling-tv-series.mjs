import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const sourceUrl = process.argv[2] ?? "https://en.wikipedia.org/wiki/List_of_professional_wrestling_television_series";

const db = await readJson(referencePath, emptyDb());
const raw = await fetchRawWikitext(sourceUrl);
const rows = parseTables(raw).map((row) => toSeriesRecord(row)).filter(Boolean);

for (const record of rows) {
  ensurePromotion(db.promotions, record.promotionId, record.promotion);
  upsertById(db.series, record);
}

upsertSource(db.sources, "wikipedia-wrestling-tv-series");
db.generatedAt = new Date().toISOString();
await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);

const byPromotion = rows.reduce((counts, row) => {
  counts[row.promotion] = (counts[row.promotion] ?? 0) + 1;
  return counts;
}, {});
console.log(`Imported ${rows.length} professional wrestling TV series records.`);
console.log(
  JSON.stringify(
    Object.entries(byPromotion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([promotion, count]) => ({ promotion, count })),
    null,
    2,
  ),
);

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

function parseTables(raw) {
  const rows = [];
  const tables = raw.match(/\{\|class="wikitable sortable"[\s\S]*?\n\|\}/g) ?? [];

  for (const table of tables) {
    const section = currentSection(raw, raw.indexOf(table));
    for (const row of table.split(/\n\|-/).slice(1)) {
      const cells = row
        .split(/\n\|/)
        .slice(1)
        .map((cell) => cell.trim());
      if (cells.length < 4 || /^!/.test(cells[0])) continue;
      rows.push({
        section,
        seriesCell: cells[0],
        countryCell: cells[1],
        durationCell: cells[2],
        promotionCell: cells[3],
        episodesCell: cells[4] ?? "",
      });
    }
  }

  return rows;
}

function currentSection(raw, index) {
  const before = raw.slice(0, index);
  const matches = [...before.matchAll(/^==\s*([^=]+?)\s*==$/gm)];
  return cleanWikiText(matches.at(-1)?.[1] ?? "unknown");
}

function toSeriesRecord(row) {
  const title = parseWikiLink(row.seriesCell);
  const promotion = cleanWikiText(row.promotionCell) || "Unknown";
  const duration = parseDuration(row.durationCell);
  const episodes = parseEpisodeCount(row.episodesCell);
  const name = cleanWikiText(title.label);
  if (!name) return null;

  return {
    id: `${promotionSlug(promotion)}-${slug(name)}`,
    promotionId: promotionSlug(promotion),
    promotion,
    name,
    page: title.page,
    programType: "weekly",
    category: row.section,
    status: duration.endYear ? "former" : "current",
    country: cleanWikiText(row.countryCell),
    startYear: duration.startYear,
    endYear: duration.endYear,
    duration: cleanWikiText(row.durationCell),
    episodesTotal: episodes,
    externalIds: title.page ? { wikipedia: `https://en.wikipedia.org/wiki/${title.page}` } : {},
    sourceIds: ["wikipedia-wrestling-tv-series"],
  };
}

function parseDuration(value = "") {
  const text = cleanWikiText(value);
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]));
  const present = /present/i.test(text);
  return {
    startYear: years[0] ?? null,
    endYear: present ? null : years.at(-1) ?? null,
  };
}

function parseEpisodeCount(value = "") {
  const number = cleanWikiText(value).match(/\b\d{1,5}\b/);
  return number ? Number(number[0]) : null;
}

function parseWikiLink(value = "") {
  const link = value.match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/);
  if (!link) return { page: null, label: cleanWikiText(value) };
  const [, page, label] = link;
  return { page, label: cleanWikiText(label ?? page) };
}

function cleanWikiText(value = "") {
  return value
    .replace(/\{\{flag\|([^}|]+)[^}]*\}\}/gi, "$1")
    .replace(/\{\{([A-Z]{2,3})\}\}/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<ref[^/]*\/>/g, "")
    .replace(/'''/g, "")
    .replace(/''/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensurePromotion(promotions, id, name) {
  if (promotions.some((promotion) => promotion.id === id)) return;
  promotions.push({
    id,
    name,
    summary: "Imported from professional wrestling television series list.",
    externalIds: {},
    sourceIds: ["wikipedia-wrestling-tv-series"],
  });
}

function upsertById(records, next) {
  const index = records.findIndex((record) => record.id === next.id);
  if (index >= 0) records[index] = { ...records[index], ...next };
  else records.push(next);
}

function upsertSource(sources, id) {
  if (!sources.some((source) => source.id === id)) sources.push({ id });
}

function promotionSlug(value = "") {
  const normalized = cleanWikiText(value);
  const aliases = {
    "World Wrestling Federation": "wwe",
    "World Wrestling Entertainment": "wwe",
    WWE: "wwe",
    WWF: "wwe",
    "World Championship Wrestling": "wcw",
    WCW: "wcw",
    "Extreme Championship Wrestling": "ecw",
    ECW: "ecw",
    "Total Nonstop Action Wrestling": "tna",
    "Impact Wrestling": "tna",
    TNA: "tna",
    "All Elite Wrestling": "aew",
    AEW: "aew",
    "Ring of Honor": "roh",
    ROH: "roh",
    "New Japan Pro-Wrestling": "njpw",
    "New Japan Pro Wrestling": "njpw",
    NJPW: "njpw",
    "All Japan Pro Wrestling": "ajpw",
    AJPW: "ajpw",
    "Pro Wrestling Noah": "noah",
    NOAH: "noah",
    "American Wrestling Association": "awa",
    AWA: "awa",
    "World Class Championship Wrestling": "wccw",
    WCCW: "wccw",
  };
  return aliases[normalized] ?? slug(normalized);
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
