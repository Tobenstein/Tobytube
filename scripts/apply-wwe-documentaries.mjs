import { readFile, writeFile } from "node:fs/promises";

const documentaries = JSON.parse(await readFile("tmp-wwe-documentaries.json", "utf8"));
let data = await readFile("src/data.js", "utf8");
const block = `export const wweDocumentaries = ${JSON.stringify(documentaries, null, 2)};\n\n`;

if (data.includes("export const wweDocumentaries = ")) {
  data = data.replace(/export const wweDocumentaries = [\s\S]*?\n\nconst wwePpvByYear = /, `${block}const wwePpvByYear = `);
} else {
  data = data.replace("const wwePpvByYear = ", `${block}const wwePpvByYear = `);
}

await writeFile("src/data.js", data);
console.log(`Embedded ${documentaries.length} WWE documentaries.`);
