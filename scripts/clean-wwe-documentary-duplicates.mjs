import { readFile, writeFile } from "node:fs/promises";

const removeIds = new Set([
  "wwe-documentary-brock-lesnar-here-comes-the-pain-2012",
  "wwe-documentary-randy-orton-the-evolution-of-a-predator-2004",
  "wwe-documentary-the-john-cena-experience-2010",
  "wwe-documentary-saturday-night-s-main-event-greatest-hits-2006",
]);

let data = await readFile("src/data.js", "utf8");
const match = data.match(/export const wweDocumentaries = ([\s\S]*?);\n\nconst wwePpvByYear = /);
if (!match) throw new Error("Could not find wweDocumentaries block.");

const docs = JSON.parse(match[1]);
const cleaned = docs.filter((doc) => !removeIds.has(doc.id));
const johnCena = cleaned.find((doc) => doc.id === "wwe-documentary-john-cena-experience-2007");
if (johnCena) johnCena.title = "The John Cena Experience";

const block = `export const wweDocumentaries = ${JSON.stringify(cleaned, null, 2)};\n\n`;
data = data.replace(/export const wweDocumentaries = [\s\S]*?\n\nconst wwePpvByYear = /, `${block}const wwePpvByYear = `);
await writeFile("src/data.js", data);
console.log(`Removed ${docs.length - cleaned.length} duplicate WWE documentary rows.`);
