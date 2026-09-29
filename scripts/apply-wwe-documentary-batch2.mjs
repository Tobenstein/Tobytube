import { readFile, writeFile } from "node:fs/promises";

const batch = JSON.parse(await readFile("tmp-wwe-documentary-batch2.json", "utf8"));
const listings = JSON.parse(await readFile("tmp-coliseum-listings.json", "utf8"));
let data = await readFile("src/data.js", "utf8");
const match = data.match(/export const wweDocumentaries = ([\s\S]*?);\n\nconst wwePpvByYear = /);
if (!match) throw new Error("Could not find wweDocumentaries block.");

const existing = JSON.parse(match[1]);
const existingIds = new Set(existing.map((item) => item.id));
const enriched = batch
  .filter((item) => !existingIds.has(item.id))
  .map((item) => {
    const listing = listings[item.releaseCode];
    return {
      ...item,
      sourceTitle: listing?.title ?? null,
      metadataSource: listing ? `${item.metadataSource} + Pro Wrestling History` : item.metadataSource,
      contents: listing?.contents ?? [],
    };
  });

const merged = [...existing, ...enriched];
const block = `export const wweDocumentaries = ${JSON.stringify(merged, null, 2)};\n\n`;
data = data.replace(/export const wweDocumentaries = [\s\S]*?\n\nconst wwePpvByYear = /, `${block}const wwePpvByYear = `);
await writeFile("src/data.js", data);
console.log(
  `Embedded ${enriched.length} second-batch WWE videos with ${enriched.filter((item) => item.contents?.length).length} content listings.`,
);
