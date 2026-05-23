import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const templateUrl = process.argv[2] ?? "https://en.wikipedia.org/wiki/Template:WWE_Championships";
const importReigns = !process.argv.includes("--no-reigns");

const db = await readJson(referencePath, emptyDb());
const html = await fetchText(templateUrl);
const links = extractWikiLinks(html);
const championshipLinks = links.filter((link) => isChampionshipPage(link.href));
const reignListLinks = links.filter((link) => isChampionListPage(link.href));
const championshipSeeds = new Map();
const templateSourceId = "wikipedia-championship-template";

db.championships = db.championships.filter(
  (championship) => !(championship.sourceIds ?? []).includes(templateSourceId),
);

for (const link of championshipLinks) {
  const name = championshipNameFromPage(link.href);
  if (!name || /championships$/i.test(name)) continue;
  const id = slug(name);
  championshipSeeds.set(id, {
    id,
    name,
    externalIds: {
      wikipedia: absoluteWikiUrl(link.href),
    },
    sourceIds: [templateSourceId],
  });
}

for (const link of reignListLinks) {
  const name = championshipNameFromList(link);
  const id = slug(name);
  championshipSeeds.set(id, {
    ...(championshipSeeds.get(id) ?? {}),
    id,
    name,
    listUrl: absoluteWikiUrl(link.href),
    externalIds: {
      ...(championshipSeeds.get(id)?.externalIds ?? {}),
      wikipediaList: absoluteWikiUrl(link.href),
    },
    sourceIds: [templateSourceId],
  });
}

for (const championship of championshipSeeds.values()) {
  upsertById(db.championships, championship);
}

upsertSource(db.sources, templateSourceId);
db.generatedAt = new Date().toISOString();
await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);

let importedLists = 0;
if (importReigns) {
  for (const championship of championshipSeeds.values()) {
    if (!championship.listUrl) continue;
    const result = spawnSync(process.execPath, [
      path.join(root, "scripts", "import-wikipedia-title-reigns.mjs"),
      championship.listUrl,
      "--championship-id",
      championship.id,
      "--championship-name",
      championship.name,
    ], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status === 0) importedLists += 1;
    else console.warn(`Skipped reign import for ${championship.name}: ${result.stderr || result.stdout}`);
  }
}

console.log(
  `Imported ${championshipSeeds.size} championship seeds from template; ${importedLists} reign-list pages processed.`,
);

async function fetchText(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "Tobytube personal metadata importer (local prototype)",
    },
  });
  if (!response.ok) throw new Error(`Wikipedia fetch failed: ${response.status}`);
  return response.text();
}

function extractWikiLinks(html) {
  const links = [];
  const regex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const [, href, text] of html.matchAll(regex)) {
    if (!href.startsWith("/wiki/")) continue;
    links.push({ href, text: htmlToText(text) });
  }
  return links;
}

function isChampionshipPage(href) {
  return /_Championship(?:$|[#?])/.test(decodeURIComponent(href)) &&
    !/^(\/wiki\/Template:|\/wiki\/Special:|\/wiki\/Template_talk:)/.test(href);
}

function isChampionListPage(href) {
  const decoded = decodeURIComponent(href);
  return /^\/wiki\/List_of_/.test(decoded) &&
    /_Champions(?:$|[#?])/.test(decoded) &&
    !/List_of_current_champions|List_of_former_champions/i.test(decoded);
}

function championshipNameFromList(link) {
  const page = decodeURIComponent(link.href.split("/wiki/")[1] ?? "")
    .replace(/^List_of_/, "")
    .replace(/_Champions.*$/i, "")
    .replace(/_/g, " ");
  if (/^WWE$/i.test(page)) return "WWE Championship";
  return ensureChampionshipSuffix(page.replace(/\bChampions$/i, "Championship").replace(/\bChampion$/i, "Championship"));
}

function championshipNameFromPage(href) {
  return clean(
    decodeURIComponent(href.split("/wiki/")[1] ?? "")
      .replace(/[#?].*$/, "")
      .replace(/_/g, " "),
  );
}

function ensureChampionshipSuffix(value) {
  return /\bChampionship$/i.test(value) ? value : `${value} Championship`;
}

function absoluteWikiUrl(href) {
  return href.startsWith("http") ? href : `https://en.wikipedia.org${href}`;
}

function htmlToText(html) {
  return html
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"');
}

function clean(value = "") {
  return value.replace(/\s+/g, " ").trim();
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
