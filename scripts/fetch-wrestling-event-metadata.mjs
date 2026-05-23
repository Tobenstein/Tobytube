import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "src", "wrestling-metadata.generated.json");
const metadataPath = path.join(root, "src", "metadata.generated.json");
const title = process.argv.slice(2).join(" ") || "WrestleMania X-Seven";
const pageTitle = title.replaceAll(" ", "_");

const [wikitext, summary, existing, metadata] = await Promise.all([
  fetchWikitext(pageTitle),
  fetchSummary(pageTitle),
  readJson(outputPath, {}),
  readJson(metadataPath, { records: [] }),
]);

const infobox = parseInfobox(wikitext);
const matches = parseResults(wikitext);
const spoilerSafeMatches = buildSpoilerSafeMatches(matches, title);
const canonicalTitle = cleanWikiText(infobox.name ?? summary.title ?? title);
const record = findMetadataRecord(metadata.records, canonicalTitle, infobox.date);
const posterUrl = await getPosterUrl(infobox.image, summary);
const scraped = {
  source: "wikipedia",
  page: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${pageTitle}`,
  title: canonicalTitle,
  summary: summary.extract ?? null,
  posterUrl,
  caption: cleanWikiText(infobox.caption),
  tagline: cleanWikiText(infobox.tagline),
  promotion: cleanWikiText(infobox.promotion),
  date: parseStartDate(infobox.date),
  venue: cleanWikiText(infobox.venue),
  city: cleanWikiText(infobox.city),
  attendance: cleanWikiText(infobox.attendance),
  buyrate: cleanWikiText(infobox.buyrate),
  eventSeries: cleanWikiText(infobox.event),
  previousEvent: cleanWikiText(infobox.lastevent),
  nextEvent: cleanWikiText(infobox.nextevent),
  matches,
  spoilerSafeMatches,
};

const keys = new Set([
  slug(canonicalTitle),
  record?.id,
  record?.id?.replace(/^wrestling-/, ""),
].filter(Boolean));

for (const key of keys) {
  existing[key] = scraped;
}

async function getPosterUrl(imageName, summary) {
  if (!imageName) return summary.originalimage?.source ?? summary.thumbnail?.source ?? null;

  const specialUrl = `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(imageName).replaceAll("%20", "_")}`;
  try {
    const response = await fetch(specialUrl, { headers: userAgentHeaders() });
    if (response.ok && response.url) return response.url;
  } catch {
    return specialUrl;
  }

  return specialUrl;
}

await writeFile(outputPath, `${JSON.stringify(existing, null, 2)}\n`);
console.log(
  `Wrote ${canonicalTitle}: ${matches.length} matches, poster ${scraped.posterUrl ? "found" : "missing"}.`,
);

async function fetchWikitext(page) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("page", page);
  url.searchParams.set("prop", "wikitext");

  const response = await fetch(url, { headers: userAgentHeaders() });
  if (!response.ok) throw new Error(`Wikipedia parse failed: ${response.status}`);
  const json = await response.json();
  return json.parse?.wikitext?.["*"] ?? "";
}

async function fetchSummary(page) {
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${page}`, {
    headers: userAgentHeaders(),
  });
  if (!response.ok) return {};
  return response.json();
}

function parseInfobox(wikitext) {
  const start = wikitext.indexOf("{{Infobox Wrestling event");
  if (start < 0) return {};
  const end = findTemplateEnd(wikitext, start);
  const block = wikitext.slice(start, end);
  const fields = {};

  for (const line of block.split("\n")) {
    const match = line.match(/^\|([^=]+?)\s*=\s*(.*)$/);
    if (!match) continue;
    fields[match[1].trim()] = match[2].trim();
  }

  return fields;
}

function parseResults(wikitext) {
  const tableStart = wikitext.match(/\{\{Pro wrestling results table/i);
  if (!tableStart) return [];
  const start = tableStart.index;
  const end = findTemplateEnd(wikitext, start);
  const block = wikitext.slice(start, end);
  const byNumber = new Map();

  for (const line of block.split("\n")) {
    const match = line.match(/^\|\s*(match|stip|time)(\d+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, field, number, value] = match;
    const current = byNumber.get(number) ?? { order: Number(number) };
    current[field === "stip" ? "stipulation" : field] = cleanWikiText(value);
    byNumber.set(number, current);
  }

  return [...byNumber.values()].sort((a, b) => a.order - b.order);
}

function buildSpoilerSafeMatches(matches, seedTitle) {
  return matches.map((match) => {
    const sides = extractMatchSides(match.match, match.stipulation);
    return {
      ...match,
      match: sides.length ? sides.join(" vs ") : spoilerNeutralize(match.match),
      resultHidden: true,
      originalOrder: stableHash(`${seedTitle}-${match.order}`) % 2 === 0 ? "as-written" : "flipped",
    };
  });
}

function extractMatchSides(matchText = "", stipulation = "") {
  const normalized = matchText.replace(/\s+/g, " ").trim();
  const eliminated = normalized.match(/^(.+?) won by last eliminating (.+)$/i);
  const draw = normalized.match(/^(.+?) (?:vs\.?|versus) (.+?) ended in .+$/i);
  const withoutMethod = eliminated || draw ? normalized : normalized.replace(/\s+(?:via|by)\s+.+$/i, "");
  const defeated = withoutMethod.match(/^(.+?) defeated (.+)$/i);
  const rawSides = defeated
    ? [defeated[1], defeated[2]]
    : eliminated
      ? [eliminated[1], eliminated[2]]
      : draw
        ? [draw[1], draw[2]]
        : [];
  if (!rawSides.length) return [];

  const sides = expandMultiSideMatch(rawSides, stipulation).map((side) =>
    side.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "").trim(),
  );
  const championIndex = sides.findIndex((side) => /\(c\)/i.test(side));
  if (championIndex > 0) {
    const [champion] = sides.splice(championIndex, 1);
    sides.unshift(champion);
    return sides;
  }

  if (championIndex === 0) return sides;

  return stableHash(normalized) % 2 === 0 ? sides : [...sides].reverse();
}

function expandMultiSideMatch(sides, stipulation = "") {
  if (/triple threat/i.test(stipulation) && sides.length === 2) {
    return [sides[0], ...sides[1].split(/\s+and\s+(?=\[\[|[A-Z])/)];
  }

  return sides;
}

function spoilerNeutralize(matchText = "") {
  return matchText
    .replace(/\bdefeated\b/i, "vs")
    .replace(/\bwon by last eliminating\b/i, "vs")
    .replace(/\s+(?:via|by)\s+.+$/i, "")
    .replace(/\s+ended in .+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stableHash(value = "") {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function findTemplateEnd(text, start) {
  let depth = 0;
  for (let index = start; index < text.length - 1; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
    } else if (pair === "}}") {
      depth -= 1;
      index += 1;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

function cleanWikiText(value = "") {
  return value
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<ref[^/]*\/>/g, "")
    .replace(/\{\{start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})\}\}/gi, "$1-$2-$3")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''/g, "")
    .replace(/''/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseStartDate(value = "") {
  const startDate = value.match(/\{\{start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})\}\}/i);
  if (startDate) {
    const [, year, month, day] = startDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return cleanWikiText(value);
}

function findMetadataRecord(records, eventTitle, date) {
  const normalizedTitle = normalize(eventTitle);
  return records.find(
    (record) =>
      record.mediaType === "wrestling" &&
      normalize(record.title) === normalizedTitle &&
      (!date || record.date === parseStartDate(date)),
  );
}

function normalize(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value = "") {
  return normalize(value).replaceAll(" ", "-");
}

function userAgentHeaders() {
  return {
    "User-Agent": "TobytubePrototype/0.1 (personal local prototype)",
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}
