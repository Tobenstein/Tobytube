import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const outputPath = path.join(root, "src", "wrestling-reference-ui.generated.json");

const reference = JSON.parse(await readFile(referencePath, "utf8"));
const championshipImageOverrides = {
  "aew-aew-national": "https://upload.wikimedia.org/wikipedia/en/thumb/5/5a/AEW_National_Title.png/330px-AEW_National_Title.png",
};

const payload = {
  generatedAt: new Date().toISOString(),
  source: "wrestling-reference.generated.json",
  championships: (reference.championships ?? []).map((championship) => ({
    ...championship,
    imageUrl: championshipImageOverrides[championship.id] ?? championship.imageUrl,
  })),
  titleReigns: reference.titleReigns ?? [],
  tournaments: reference.tournaments ?? [],
};

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(
  `Generated wrestling reference UI payload: ${payload.championships.length} championships, ${payload.titleReigns.length} title reigns, ${payload.tournaments.length} tournaments.`,
);
