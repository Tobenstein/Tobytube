import { readFile, writeFile } from "node:fs/promises";

const html = await readFile("tmp-coliseum.html", "utf8");
const sections = [...html.matchAll(/<h2[^>]*>\s*<b>\s*([\s\S]*?)\s*\((WF\d{3})\)<\/b><\/h2><br>\s*<table[^>]*>([\s\S]*?)<\/table>/gi)];
const listings = Object.fromEntries(
  sections.map(([, title, releaseCode, table]) => [
    releaseCode,
    {
      releaseCode,
      title: clean(title),
      contents: [...table.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)].map(
        ([, date, description], index) => ({
          order: index + 1,
          dateText: clean(date),
          description: clean(description),
        }),
      ),
    },
  ]),
);

await writeFile("tmp-coliseum-listings.json", JSON.stringify(listings, null, 2));
console.log(`Parsed ${Object.keys(listings).length} Coliseum listings.`);

function clean(value) {
  return String(value)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
