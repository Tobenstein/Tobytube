import { readFile, writeFile } from "node:fs/promises";

const pages = JSON.parse(await readFile("tmp-fandom-wwe-dvd-releases.json", "utf8")).filter((page) => page.ns === 0);
let data = await readFile("src/data.js", "utf8");
const match = data.match(/export const wweDocumentaries = ([\s\S]*?);\n\nconst wwePpvByYear = /);
if (!match) throw new Error("Could not find wweDocumentaries block.");

const original = JSON.parse(match[1]);
const skipTitles = new Set(["Category:WWE Superstar Collection DVD's", "List of WWE DVD and Video releases"]);
const duplicateIdsToRemove = new Set([
  "wwe-documentary-sting-into-the-light-2014",
  "wwe-documentary-the-destruction-of-the-shield-2014",
]);

const docs = original.filter((item) => !duplicateIdsToRemove.has(item.id));
const matchedPageIds = new Set();
const updates = { matched: 0, posterFilled: 0, added: 0, demolitionFixed: false };

for (const doc of docs) {
  if (doc.releaseCode === "WF071") {
    Object.assign(doc, {
      title: "Demolition: Witness the Power",
      imdbId: "tt6422970",
      tmdbId: null,
      date: "1989-01-01",
      year: 1989,
      listedYear: 1989,
      metadataSource: "IMDb + Pro Wrestling History",
      summary:
        "A WWF Home Video Classic spotlighting Demolition, including bouts against The Powers of Pain, The Hart Foundation, and other teams.",
      posterUrl: null,
      backdropUrl: null,
      voteAverage: null,
    });
    updates.demolitionFixed = true;
  }

  const page = bestPageForDoc(doc, pages, matchedPageIds);
  if (!page) continue;
  matchedPageIds.add(page.pageid);
  updates.matched += 1;
  applyPage(doc, page);
  if (!doc.posterUrl && page.thumbnail?.source) {
    doc.posterUrl = page.thumbnail.source;
    updates.posterFilled += 1;
  }
}

for (const page of pages) {
  if (matchedPageIds.has(page.pageid) || skipTitles.has(page.title)) continue;
  const title = cleanTitle(page.title);
  if (!title || docs.some((doc) => similarity(normalize(doc.title), normalize(title)) > 0.92)) continue;
  docs.push(fandomPageToDoc(page, title));
  updates.added += 1;
}

docs.sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)) || a.title.localeCompare(b.title));
const block = `export const wweDocumentaries = ${JSON.stringify(docs, null, 2)};\n\n`;
data = data.replace(/export const wweDocumentaries = [\s\S]*?\n\nconst wwePpvByYear = /, `${block}const wwePpvByYear = `);
await writeFile("src/data.js", data);
console.log(JSON.stringify({ ...updates, total: docs.length, posters: docs.filter((item) => item.posterUrl).length }, null, 2));

function bestPageForDoc(doc, candidates, used) {
  const codePage = doc.releaseCode ? candidates.find((page) => !used.has(page.pageid) && field(wikitext(page), "code") === doc.releaseCode) : null;
  if (codePage) return codePage;

  const docKeys = titleKeys(doc.title);
  const scored = candidates
    .filter((page) => !used.has(page.pageid))
    .map((page) => {
      const pageKeys = titleKeys(page.title);
      const score = Math.max(...docKeys.flatMap((left) => pageKeys.map((right) => similarity(left, right))));
      return { page, score };
    })
    .filter((candidate) => candidate.score >= 0.86)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.page ?? null;
}

function applyPage(doc, page) {
  const text = wikitext(page);
  doc.fandomTitle = page.title;
  doc.fandomUrl = page.fullurl;
  doc.fandomPageId = page.pageid;
  doc.fandomPosterUrl = page.thumbnail?.source ?? null;
  doc.length = doc.length ?? field(text, "length") ?? null;
  const yearValue = field(text, "year");
  const parsedYear = parseYear(yearValue);
  if (!doc.date && parsedYear) doc.date = `${parsedYear}-01-01`;
  doc.year = doc.year ?? parsedYear;
  doc.listedYear = doc.listedYear ?? parsedYear;
  if (!doc.summary) doc.summary = extractFirstSentence(text);
  if (!String(doc.metadataSource ?? "").includes("Fandom")) doc.metadataSource = `${doc.metadataSource ?? "Seeded List"} + Fandom`;
}

function fandomPageToDoc(page, title) {
  const text = wikitext(page);
  const year = parseYear(field(text, "year"));
  return {
    id: `wwe-documentary-fandom-${slug(title)}`,
    title,
    date: year ? `${year}-01-01` : null,
    year,
    listedYear: year,
    type: "documentary",
    eventLabel: "DVD Release",
    posterCode: "DVD",
    metadataSource: "Fandom",
    summary: extractFirstSentence(text),
    posterUrl: page.thumbnail?.source ?? null,
    backdropUrl: null,
    voteAverage: null,
    fandomTitle: page.title,
    fandomUrl: page.fullurl,
    fandomPageId: page.pageid,
    fandomPosterUrl: page.thumbnail?.source ?? null,
    length: field(text, "length") || null,
    contents: [],
  };
}

function titleKeys(title) {
  const clean = cleanTitle(title);
  const base = normalize(clean);
  return [
    base,
    base.replace(/^the /, ""),
    base.replace(/ dvd$/, ""),
    base.replace(/^wwe /, "").replace(/^wwf /, ""),
    base.replace(/ and /g, " "),
  ].filter(Boolean);
}

function cleanTitle(title) {
  return String(title)
    .replace(/\s*\((DVD|Video)\)\s*$/i, "")
    .replace(/^WWE:\s*/i, "")
    .replace(/^WWF:\s*/i, "")
    .trim();
}

function normalize(value) {
  return cleanTitle(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/\bthree\b/g, "3")
    .replace(/\bfour\b/g, "4")
    .replace(/\bthe\b/g, "")
    .replace(/\bvol(?:ume)?\b/g, "vol")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

function field(text, name) {
  return cleanWiki(text.match(new RegExp(`\\|\\s*${escapeRegex(name)}\\s*=\\s*([^\\n]+)`, "i"))?.[1] ?? "");
}

function extractFirstSentence(text) {
  const body = cleanWiki(text)
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/\[\[Category:[^\]]+\]\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return body.match(/'''[^']+'''[^.]+\./)?.[0]?.replace(/'''/g, "") ?? null;
}

function cleanWiki(value) {
  return String(value)
    .replace(/\[\[File:[^\]]+\]\]/gi, "")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/'''/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseYear(value) {
  return Number(String(value).match(/\b(19|20)\d{2}\b/)?.[0]) || null;
}

function wikitext(page) {
  return page.revisions?.[0]?.slots?.main?.["*"] ?? "";
}

function getSortKey(item) {
  return item.date ?? (item.listedYear ? `${item.listedYear}-01-01` : "9999-12-31");
}

function slug(value) {
  return normalize(value).replaceAll(" ", "-");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
