import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const db = JSON.parse(await readFile(referencePath, "utf8"));
const parents = new Map([...(db.events ?? []), ...(db.episodes ?? [])].map((item) => [item.id, item]));

const continentalClassic = {
  id: "aew-continental-classic",
  promotionId: "aew",
  name: "Continental Classic",
  pageType: "round-robin",
  established: "2023-11-22",
  format: "Two-block round robin",
  prize: "AEW Continental Championship",
  imageUrl: "./assets/championships/aew-cc.png",
  summary: "AEW's annual two-league round-robin tournament. Matches use Continental Rules: a 20-minute limit, nobody at ringside, and no outside interference.",
  results: [
    classicResult(2023, "Eddie Kingston", 9, "Blue", "Jon Moxley", 12, "Gold", "2023-12-30", "Worlds End", "Nassau Veterans Memorial Coliseum, Uniondale, New York", {
      Blue: [["Bryan Danielson", 10], ["Andrade El Idolo", 9], ["Claudio Castagnoli", 7], ["Brody King", 6], ["Daniel Garcia", 3]],
      Gold: [["Swerve Strickland", 12], ["Jay White", 12], ["Rush", 6], ["Mark Briscoe", 3], ["Jay Lethal", 0]],
    }),
    classicResult(2024, "Kazuchika Okada", 10, "Blue", "Will Ospreay", 9, "Gold", "2024-12-28", "Worlds End", "Addition Financial Arena, Orlando, Florida", {
      Blue: [["Kyle Fletcher", 12], ["Mark Briscoe", 9], ["Daniel Garcia", 7], ["Shelton Benjamin", 6], ["The Beast Mortos", 0]],
      Gold: [["Ricochet", 10], ["Claudio Castagnoli", 9], ["Darby Allin", 7], ["Brody King", 6], ["Komander", 3], ["Juice Robinson", null, "Replaced due to injury"]],
    }),
    classicResult(2025, "Jon Moxley", 9, "Blue", "Kazuchika Okada", 9, "Gold", "2025-12-27", "Worlds End", "NOW Arena, Hoffman Estates, Illinois", {
      Blue: [["Konosuke Takeshita", 13], ["Claudio Castagnoli", 7], ["Orange Cassidy", 6], ["Mascara Dorada", 6], ["Roderick Strong", 3]],
      Gold: [["Kyle Fletcher", 9], ["Kevin Knight", 7], ["Pac", 7], ["Jungle Jack Perry", 6], ["Speedball Mike Bailey", 6], ["Darby Allin", null, "Replaced due to injury"]],
    }),
  ],
  externalIds: { wikipedia: "https://en.wikipedia.org/wiki/AEW_Continental_Classic" },
  sourceIds: ["wikipedia-aew-continental-classic"],
};

const diamondRing = {
  id: "aew-dynamite-diamond-ring",
  promotionId: "aew",
  name: "Dynamite Diamond Ring",
  pageType: "annual-award",
  established: "2019-11-27",
  format: "Annual battle royal and final",
  prize: "Dynamite Diamond Ring",
  imageUrl: "./assets/championships/aew-ddr.png",
  summary: "An annual AEW achievement decided by the Dynamite Diamond Battle Royale and final. From 2025, the winner also earns a future AEW World Championship match.",
  records: { mostWins: { champion: "MJF", value: 6, unit: "wins" } },
  results: [
    awardResult(2019, "MJF", '"Hangman" Adam Page', "2019-11-27", "Thanksgiving Eve Dynamite", "Hoffman Estates, Illinois"),
    awardResult(2020, "MJF", "Orange Cassidy", "2020-12-09", "Dynamite", "Jacksonville, Florida"),
    awardResult(2021, "MJF", "Dante Martin", "2021-12-15", "Dynamite: Winter Is Coming", "Garland, Texas"),
    awardResult(2022, "MJF", "Ricky Starks", "2022-12-14", "Dynamite: Winter Is Coming", "Garland, Texas", "Winner Takes All for the AEW World Championship and Dynamite Diamond Ring"),
    awardResult(2023, "MJF", "Juice Robinson", "2023-10-25", "Dynamite", "Philadelphia, Pennsylvania"),
    awardResult(2024, "MJF", "Adam Cole", "2024-12-28", "Worlds End", "Orlando, Florida"),
    awardResult(2025, "Bandido", "Ricochet", "2025-12-24", "Dynamite on 34th Street", "New York City, New York", "Taped December 20; winner earned an AEW World Championship match"),
  ],
  externalIds: { wikipedia: "https://en.wikipedia.org/wiki/AEW_Dynamite_Diamond_Ring" },
  sourceIds: ["wikipedia-aew-dynamite-diamond-ring"],
};

db.tournaments ??= [];
db.championships ??= [];
db.people ??= [];
for (const achievement of [continentalClassic, diamondRing]) {
  achievement.results = achievement.results.map(linkResultEvent);
  upsert(db.tournaments, achievement);
  upsert(db.championships, {
    id: achievement.id,
    promotionId: "aew",
    name: achievement.name,
    cardType: "achievement",
    imageUrl: achievement.imageUrl,
    summary: achievement.summary,
    externalIds: achievement.externalIds,
  });
}
db.tournaments = db.tournaments.filter((item) => !["continental-classic", "dynamite-diamond-ring"].includes(item.id));
db.championships = db.championships.filter((item) => !["continental-classic", "dynamite-diamond-ring"].includes(item.id));

for (const tournament of db.tournaments.filter((item) => item.promotionId === "aew")) {
  for (const result of tournament.results ?? []) {
    ensurePerson(result.winner, result.winnerPersonId);
    ensurePerson(result.runnerUp, result.runnerUpPersonId);
    for (const league of Object.values(result.leagues ?? {})) {
      for (const entrant of league) ensurePerson(entrant.name, entrant.personId);
    }
  }
}

for (const id of ["wikipedia-aew-continental-classic", "wikipedia-aew-dynamite-diamond-ring"]) {
  if (!db.sources.some((source) => source.id === id)) db.sources.push({ id });
}
db.generatedAt = new Date().toISOString();
const tempPath = `${referencePath}.achievements`;
await writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`);
await rename(tempPath, referencePath);
console.log("Generated AEW Continental Classic and Dynamite Diamond Ring histories.");

function classicResult(year, winner, winnerPoints, winnerLeague, runnerUp, runnerUpPoints, runnerUpLeague, date, event, venue, leagues) {
  return {
    year,
    winner,
    winnerPersonId: slug(winner),
    winnerPoints,
    winnerLeague,
    runnerUp,
    runnerUpPersonId: slug(runnerUp),
    runnerUpPoints,
    runnerUpLeague,
    final: { date, event, venue },
    leagues: Object.fromEntries(Object.entries(leagues).map(([name, entrants]) => [name, entrants.map(([entrant, points, note]) => ({ name: entrant, personId: slug(entrant), points, note: note ?? null }))])),
  };
}

function awardResult(year, winner, runnerUp, date, event, venue, notes = "") {
  return { year, winner, winnerPersonId: slug(winner), runnerUp, runnerUpPersonId: slug(runnerUp), final: { date, event, venue }, notes };
}

function linkResultEvent(result) {
  return { ...result, final: { ...result.final, eventId: findParent(result.final.date, result.final.event)?.id ?? null } };
}

function findParent(date, eventName) {
  const candidates = [...parents.values()].filter((item) => (item.date ?? item.broadcastDate) === date && item.promotionId === "aew");
  const key = normalize(eventName);
  return candidates.find((item) => {
    const title = normalize(item.name ?? item.title ?? item.displayTitle);
    return title.includes(key) || key.includes(title) || (/dynamite/.test(key) && /dynamite/.test(title));
  }) ?? candidates[0];
}

function ensurePerson(name, id = slug(name)) {
  if (!name || !id || db.people.some((person) => person.id === id)) return;
  db.people.push({ id, name, sourceIds: ["wikipedia-aew-achievements"] });
}

function normalize(value = "") {
  return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value = "") {
  return normalize(value).replace(/\s+/g, "-");
}

function upsert(records, next) {
  const index = records.findIndex((record) => record.id === next.id);
  if (index >= 0) records[index] = { ...records[index], ...next };
  else records.push(next);
}
