import { readFile, writeFile } from "node:fs/promises";

const category = JSON.parse(await readFile("tmp-pwg-category.json", "utf8"));
const pages = category.query.categorymembers.map((item) => item.title).filter((title) => title.startsWith("PWG "));
const events = [];

for (const title of pages) {
  const url = `https://prowrestling.fandom.com/api.php?action=parse&prop=wikitext&format=json&page=${encodeURIComponent(title)}`;
  const response = await fetch(url);
  if (!response.ok) continue;
  const data = await response.json();
  const text = data.parse?.wikitext?.["*"] ?? "";
  const date = toIso(clean(field(text, "date")));
  if (!date) continue;

  events.push({
    id: slug(title),
    title: title.replace(/^PWG\s+/, ""),
    date,
    year: Number(date.slice(0, 4)),
    type: "special",
    posterCode: "PWG",
    eventLabel: "Event",
    venue: clean(field(text, "venue")),
    location: clean(field(text, "city")),
    attendance: clean(field(text, "attendance")) || null,
    matchCount: [...text.matchAll(/\|match\d+\s*=/g)].length,
  });

  await delay(80);
}

events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
await writeFile("tmp-pwg-events.json", JSON.stringify(events, null, 2));
console.log(`Wrote ${events.length} PWG events.`);

function field(text, name) {
  return text.match(new RegExp(`\\|${name}\\s*=\\s*([^\\n]+)`))?.[1] ?? "";
}

function clean(value = "") {
  return value
    .replace(/<ref[^>]*>.*?<\/ref>/gs, "")
    .replace(/<ref[^/]*\/>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[([^\]|\n]+)\|([^\]\n]+)\]\]/g, "$2")
    .replace(/\[\[([^\]\n]+)\]\]/g, "$1")
    .replace(/'''/g, "")
    .replace(/&amp;/g, "&")
    .trim();
}

function toIso(value) {
  const date = new Date(`${value} UTC`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
