import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const db = JSON.parse(await readFile(referencePath, "utf8"));
const id = "aew-aew-world";
const index = db.championships.findIndex((championship) => championship.id === id);
const metadata = {
  id,
  name: "AEW World Championship",
  promotionId: "aew",
  status: "active",
  established: "2019-05-25",
  retired: null,
  imageUrl: "./assets/championships/aew-world.png",
  summary: "All Elite Wrestling's top men's world championship, unveiled on May 25, 2019.",
  currentChampion: "Kenny Omega",
  currentReign: 2,
  recordStats: {
    inauguralChampion: "Chris Jericho",
    mostReigns: { champion: "Jon Moxley", value: 4 },
    longestReign: { champion: "MJF", value: 406, unit: "days" },
    shortestReign: { champion: "CM Punk", value: 3, unit: "days" },
    longestCombinedReign: { champion: "Jon Moxley", value: 620, unit: "days" },
    youngestChampion: { champion: "MJF", value: 26, unit: "years" },
    oldestChampion: { champion: "Chris Jericho", value: 48, unit: "years" },
  },
  externalIds: {
    ...(index >= 0 ? db.championships[index].externalIds ?? {} : {}),
    wikipedia: "https://en.wikipedia.org/wiki/AEW_World_Championship",
    wikipediaList: "https://en.wikipedia.org/wiki/List_of_AEW_World_Champions",
  },
  sourceIds: [...new Set([...(index >= 0 ? db.championships[index].sourceIds ?? [] : []), "wikipedia-title-reigns"])],
};
if (index >= 0) db.championships[index] = { ...db.championships[index], ...metadata };
else db.championships.push(metadata);

for (const reign of db.titleReigns.filter((item) => item.championshipId === id)) {
  const champion = reign.champion.replace(/\s*\(Interim\)\s*$/i, "").replace(/^"|"$/g, "");
  reign.personId = /^Vacated$/i.test(champion) ? null : `wrestler-${slug(champion)}`;
}
db.generatedAt = new Date().toISOString();
await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);
console.log("Applied AEW World Championship page metadata.");

function slug(value = "") { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
