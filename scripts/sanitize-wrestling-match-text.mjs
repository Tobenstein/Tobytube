import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "src/wrestling-reference.generated.json",
  "src/wrestling-reference-pages/wwe/2026.generated.json",
  "src/wrestling-library.generated.json",
  "src/wrestling-library-wwe.generated.json",
  "src/wrestling-library-pages/wwe-2026.generated.json",
  "src/wrestling-matches.generated.json",
  "src/wrestling-library-pages/wwe-2026-matches.generated.json",
];
const editableKeys = new Set(["raw", "displayText", "match", "result"]);
let changedValues = 0;
let changedValuesForFile = 0;

for (const relativePath of files) {
  const filePath = path.join(root, relativePath);
  const original = await readFile(filePath, "utf8");
  const database = JSON.parse(original);
  clean(database);
  if (!changedValuesForFile) continue;
  const pretty = original.includes("\n  \"");
  await writeFile(filePath, `${JSON.stringify(database, null, pretty ? 2 : undefined)}\n`);
  console.log(`${relativePath}: removed ${changedValuesForFile} editorial marker(s)`);
  changedValuesForFile = 0;
}

console.log(`Removed ${changedValues} wrestling match editorial marker(s).`);

function clean(value) {
  if (Array.isArray(value)) {
    value.forEach(clean);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (editableKeys.has(key) && typeof child === "string") {
      const sanitized = child.replace(/\s*-\s*TITLE CHANGE\s*!+\s*$/i, "").trim();
      if (sanitized !== child) {
        value[key] = sanitized;
        changedValues += 1;
        changedValuesForFile += 1;
      }
      continue;
    }
    clean(child);
  }
}
