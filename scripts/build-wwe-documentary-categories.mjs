import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.argv[2] ?? "D:/Media/Wrestling/Major Promotions/WWFE/Documentaries";
const distributionPath = process.argv[3];
if (!distributionPath) throw new Error("Pass the documentary distribution text file as the second argument.");

const folders = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const text = await readFile(distributionPath, "utf8");
const headingMap = new Map(folders.map((folder) => [normalizeHeading(folder), folder]));
headingMap.set("other", folders.find((folder) => /^others?$/i.test(folder)) ?? "Others");
headingMap.set("others", folders.find((folder) => /^others?$/i.test(folder)) ?? "Others");

let currentCategory = null;
const assignments = [];
for (const rawLine of text.split(/\r?\n/)) {
  const trimmed = rawLine.trim();
  if (!trimmed || /^wrestling$/i.test(trimmed)) continue;
  const heading = headingMap.get(normalizeHeading(trimmed));
  if (heading) {
    currentCategory = heading;
    continue;
  }
  if (!currentCategory || /^this section contains links/i.test(trimmed)) continue;
  const title = cleanListEntry(trimmed);
  if (!title || /^this section contains links/i.test(title)) continue;
  assignments.push({ title, key: normalizeTitle(title), category: currentCategory });
}

const otherFolder = folders.find((folder) => /^others?$/i.test(folder)) ?? "Others";
const orderedFolders = folders.filter((folder) => folder !== otherFolder).concat(otherFolder);
const output = {
  generatedAt: new Date().toISOString(),
  sourceRoot: path.resolve(sourceRoot),
  categories: orderedFolders.map((folder) => ({ folder, title: folder === otherFolder ? "Other" : folder })),
  assignments,
};
await writeFile(path.join(root, "src", "wwe-documentary-categories.generated.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Wrote ${assignments.length} documentary assignments across ${orderedFolders.length} categories.`);

function cleanListEntry(value) {
  return value
    .replace(/^(?:[â€¢·•]|o)\s*/i, "")
    .replace(/^[^$A-Za-z0-9'\"]+/, "")
    .trim();
}

function normalizeHeading(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeTitle(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/â€™|â€“|â€”|’/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
