import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataSource = await readFile(path.join(root, "src", "data.js"), "utf8");
const categories = JSON.parse(await readFile(path.join(root, "src", "wwe-documentary-categories.generated.json"), "utf8"));
const startMarker = "export const wweDocumentaries = ";
const start = dataSource.indexOf(startMarker);
const end = dataSource.indexOf("const wwePpvByYear = ", start);
if (start < 0 || end < 0) throw new Error("Could not locate wweDocumentaries in src/data.js");
const documentaryJson = dataSource.slice(start + startMarker.length, end).trim().replace(/;$/, "").trim();
const documentaries = JSON.parse(documentaryJson);
const assignedKeys = new Set((categories.assignments ?? []).map((entry) => normalizeTitle(entry.title)));
const other = documentaries
  .filter((item) => !assignedKeys.has(normalizeTitle(item.title)))
  .sort((a, b) => String(a.title).localeCompare(String(b.title), "en", { sensitivity: "base" }));
const lines = [
  "WWE Documentaries - Other",
  `Total objects: ${other.length}`,
  "",
  ...other.map((item) => item.title),
  "",
];
const outputPath = path.join(root, "docs", "WWE Documentaries - Other.txt");
await writeFile(outputPath, lines.join("\n"), "utf8");
console.log(`Wrote ${other.length} titles to ${outputPath}`);

function normalizeTitle(value) {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}
