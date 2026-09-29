import { access, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTitleReigns } from "./import-wikipedia-title-reigns.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");

const titles = [
  title("wwe-wwe-championship", "WWE Championship", "List_of_WWE_Champions", "1963-04-25", "wwe-championship.png"),
  title("wwe-wwe-womens-championship", "WWE Women's Championship", "List_of_WWE_Women%27s_Champions", "2016-04-03", "wwe-womens-championship.png"),
  title("wwe-wwe-world-heavyweight", "World Heavyweight Championship", "List_of_World_Heavyweight_Champions_(WWE,_2023%E2%80%93present)", "2023-04-24", "wwe-world-heavyweight.png"),
  title("wwe-wwe-womens-world", "Women's World Championship", "List_of_Women%27s_World_Champions_(WWE)", "2016-04-03", "wwe-womens-world.png"),
  title("wwe-wwe-united-states", "WWE United States Championship", "List_of_WWE_United_States_Champions", "1975-01-01", "wwe-united-states.png"),
  title("wwe-wwe-womens-united-states", "WWE Women's United States Championship", "WWE_Women%27s_United_States_Championship", "2024-11-08", "wwe-womens-united-states.png"),
  title("wwe-wwe-intercontinental", "WWE Intercontinental Championship", "List_of_WWE_Intercontinental_Champions", "1979-09-01", "wwe-intercontinental.png"),
  title("wwe-wwe-womens-intercontinental", "WWE Women's Intercontinental Championship", "WWE_Women%27s_Intercontinental_Championship", "2024-11-25", "wwe-womens-intercontinental.png"),
  title("wwe-wwe-tag-team", "WWE Tag Team Championship", "List_of_WWE_Tag_Team_Champions", "2016-08-23", "wwe-tag-team.png"),
  title("wwe-wwe-world-tag-team", "World Tag Team Championship", "List_of_World_Tag_Team_Champions_(WWE)", "2002-10-20", "wwe-world-tag-team.png"),
  title("wwe-wwe-womens-tag-team", "WWE Women's Tag Team Championship", "List_of_WWE_Women%27s_Tag_Team_Champions", "2018-12-24", "wwe-womens-tag-team.png"),
  title("wwe-nxt-championship", "NXT Championship", "List_of_NXT_Champions", "2012-07-01", "nxt-championship.png"),
  title("wwe-nxt-womens", "NXT Women's Championship", "List_of_NXT_Women%27s_Champions", "2013-04-05", "nxt-womens.png"),
  title("wwe-nxt-north-american", "NXT North American Championship", "List_of_NXT_North_American_Champions", "2018-03-07", "nxt-north-american.png"),
  title("wwe-nxt-womens-north-american", "NXT Women's North American Championship", "NXT_Women%27s_North_American_Championship", "2024-04-06", "nxt-womens-north-american.png"),
  title("wwe-nxt-tag-team", "NXT Tag Team Championship", "List_of_NXT_Tag_Team_Champions", "2013-01-23", "nxt-tag-team.png"),
  title("wwe-speed-championship", "WWE Speed Championship", "WWE_Speed_Championship", "2024-03-27", "wwe-speed-championship.png"),
  title("wwe-womens-speed-championship", "WWE Women's Speed Championship", "WWE_Women%27s_Speed_Championship", "2024-08-09", "wwe-womens-speed-championship.png"),
  title("wwe-evolve-mens-championship", "WWE Evolve Men's Championship", "WWE_Evolve_Men%27s_Championship", "2025-05-07", "wwe-evolve-mens-championship.png"),
  title("wwe-evolve-womens-championship", "WWE Evolve Women's Championship", "WWE_Evolve_Women%27s_Championship", "2025-05-07", "wwe-evolve-womens-championship.png"),
  title("wwe-id-championship", "WWE ID Championship", "WWE_ID_Championship", "2025-02-18", "wwe-id-championship.png"),
  title("wwe-womens-id-championship", "WWE Women's ID Championship", "WWE_Women%27s_ID_Championship", "2025-02-18", "wwe-womens-id-championship.png"),
  title("wwe-wwe-world-heavyweight-2002", "World Heavyweight Championship (2002-2013)", "List_of_World_Heavyweight_Champions_(WWE,_2002%E2%80%932013)", "2002-09-02", "wwe-world-heavyweight-2002.png", { status: "retired" }),
  title("wwe-wwe-universal", "WWE Universal Championship", "List_of_WWE_Universal_Champions", "2016-07-25", "wwe-universal.png", { status: "retired" }),
  title("wwe-wwe-hardcore", "WWF Hardcore Championship", "List_of_WWE_Hardcore_Champions", "1998-11-02", "wwe-hardcore.png", { status: "retired" }),
  title("wwe-wwe-european", "WWF European Championship", "List_of_WWE_European_Champions", "1997-02-26", "wwe-european.png", { status: "retired" }),
  title("wwe-wwe-divas", "WWE Divas Championship", "List_of_WWE_Divas_Champions", "2008-07-20", "wwe-divas.png", { status: "retired" }),
  title("wwe-wwe-womens-1956", "WWE Women's Championship (1956-2010)", "List_of_WWE_Women%27s_Champions_(1956%E2%80%932010)", "1956-09-18", "wwe-womens-1956.png", { status: "retired" }),
  title("wwe-nxt-united-kingdom", "NXT United Kingdom Championship", "List_of_NXT_United_Kingdom_Champions", "2017-01-15", "nxt-united-kingdom.png", { status: "retired" }),
  title("wwe-nxt-uk-womens", "NXT UK Women's Championship", "List_of_NXT_UK_Women%27s_Champions", "2018-06-18", "nxt-uk-womens.png", { status: "retired" }),
  title("wwe-nxt-uk-tag-team", "NXT UK Tag Team Championship", "List_of_NXT_UK_Tag_Team_Champions", "2018-06-18", "nxt-uk-tag-team.png", { status: "retired" }),
  title("wwe-nxt-cruiserweight", "NXT Cruiserweight Championship", "List_of_NXT_Cruiserweight_Champions", "2016-09-14", "nxt-cruiserweight.png", { status: "retired" }),
  title("wwe-nxt-womens-tag-team", "NXT Women's Tag Team Championship", "List_of_NXT_Women%27s_Tag_Team_Champions", "2021-03-10", "nxt-womens-tag-team.png", { status: "retired" }),
  title("wcw-world-heavyweight-championship", "WCW World Heavyweight Championship", "List_of_WCW_World_Heavyweight_Champions", "1991-01-11", "wcw-world-heavyweight.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-united-states-heavyweight-championship", "WCW United States Heavyweight Championship", "List_of_WWE_United_States_Champions", "1975-01-01", "wcw-united-states-heavyweight.png", { promotionId: "wcw", status: "retired", maxDate: "2001-11-18" }),
  title("wcw-cruiserweight-championship", "WCW Cruiserweight Championship", "List_of_WWE_Cruiserweight_Champions_(1996%E2%80%932007)", "1996-03-20", "wcw-cruiserweight.png", { promotionId: "wcw", status: "retired", maxDate: "2001-03-26" }),
  title("wcw-world-tag-team-championship", "WCW World Tag Team Championship", "List_of_WCW_World_Tag_Team_Champions", "1975-01-29", "wcw-tag-team.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-world-television-championship", "WCW World Television Championship", "List_of_WCW_World_Television_Champions", "1974-02-27", "wcw-television.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-hardcore-championship", "WCW Hardcore Championship", "List_of_WCW_Hardcore_Champions", "1999-07-11", "wcw-hardcore.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-world-six-man-tag-team-championship", "WCW World Six-Man Tag Team Championship", "WCW_World_Six-Man_Tag_Team_Championship", "1991-02-17", "wcw-six-man-tag.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-cruiserweight-tag-team-championship", "WCW Cruiserweight Tag Team Championship", "WCW_Cruiserweight_Tag_Team_Championship", "2001-03-18", "wcw-cruiserweight-tag.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-united-states-tag-team-championship", "WCW United States Tag Team Championship", "WCW_United_States_Tag_Team_Championship", "1986-09-28", "wcw-us-tag.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-international-world-heavyweight-championship", "WCW International World Heavyweight Championship", "WCW_International_World_Heavyweight_Championship", "1993-07-18", "wcw-world-heavyweight.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-light-heavyweight-championship", "WCW Light Heavyweight Championship", "WCW_Light_Heavyweight_Championship", "1991-10-27", "wcw-light-heavyweight.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-women-s-championship", "WCW Women's Championship", "WCW_Women%27s_Championship", "1996-12-29", "wcw-womens.png", { promotionId: "wcw", status: "retired" }),
  title("wcw-women-s-cruiserweight-championship", "WCW Women's Cruiserweight Championship", "WCW_Women%27s_Cruiserweight_Championship", "1997-04-07", "wcw-womens-cruiserweight.png", { promotionId: "wcw", status: "retired" }),
  title("ecw-ecw-world", "ECW World Heavyweight Championship", "List_of_ECW_World_Heavyweight_Champions", "1992-04-25", "ecw-world-heavyweight.png", { promotionId: "ecw", status: "retired", maxDate: "2001-04-11" }),
  title("ecw-ecw-television", "ECW World Television Championship", "List_of_ECW_World_Television_Champions", "1992-08-12", "ecw-television.png", { promotionId: "ecw", status: "retired", maxDate: "2001-04-11" }),
  title("ecw-ecw-tag-team", "ECW World Tag Team Championship", "List_of_ECW_World_Tag_Team_Champions", "1992-06-23", "ecw-tag-team.png", { promotionId: "ecw", status: "retired", maxDate: "2001-04-11" }),
  title("njpw-iwgp-world-heavyweight", "IWGP World Heavyweight Championship (2021-2026)", "List_of_IWGP_Heavyweight_Champions", "2021-03-04", "sdh/iwgp-heavyweight-championship.png", { promotionId: "njpw", status: "retired", minDate: "2021-03-04", maxDate: "2026-01-05" }),
  title("njpw-iwgp-junior-heavyweight", "IWGP Junior Heavyweight Championship", "List_of_IWGP_Junior_Heavyweight_Champions", "1986-02-06", "sdh/iwgp-junior-heavyweight-championship.png", { promotionId: "njpw" }),
  title("njpw-never-openweight", "NEVER Openweight Championship", "List_of_NEVER_Openweight_Champions", "2012-11-19", "sdh/never-openweight-championship.png", { promotionId: "njpw" }),
  title("njpw-iwgp-womens", "IWGP Women's Championship", "List_of_IWGP_Women%27s_Champions", "2022-10-02", "sdh/iwgp-women-s-championship.webp", { promotionId: "njpw" }),
  title("njpw-iwgp-global", "IWGP Global Heavyweight Championship", "IWGP_Global_Heavyweight_Championship", "2023-12-11", "sdh/iwgp-global-heavyweight-championship.png", { promotionId: "njpw" }),
  title("njpw-strong-openweight", "Strong Openweight Championship", "Strong_Openweight_Championship", "2021-04-23", "sdh/strong-openweight-championship.png", { promotionId: "njpw" }),
  title("njpw-strong-womens", "Strong Women's Championship", "List_of_Strong_Women%27s_Champions", "2023-04-27", "sdh/strong-women-s-championship.webp", { promotionId: "njpw" }),
  title("njpw-njpw-world-television", "NJPW World Television Championship", "List_of_NJPW_World_Television_Champions", "2022-10-10", "sdh/njpw-world-television-championship.webp", { promotionId: "njpw" }),
  title("njpw-iwgp-tag-team", "IWGP Tag Team Championship", "List_of_IWGP_Tag_Team_Champions", "1985-12-12", "sdh/iwgp-tag-team-championship.png", { promotionId: "njpw" }),
  title("njpw-iwgp-junior-tag-team", "IWGP Junior Heavyweight Tag Team Championship", "List_of_IWGP_Junior_Heavyweight_Tag_Team_Champions", "1998-08-08", "sdh/iwgp-junior-heavyweight-tag-team-championship.png", { promotionId: "njpw" }),
  title("njpw-strong-openweight-tag-team", "Strong Openweight Tag Team Championship", "Strong_Openweight_Tag_Team_Championship", "2022-06-08", "sdh/strong-openweight-tag-team-championship.webp", { promotionId: "njpw" }),
  title("njpw-never-openweight-six-man", "NEVER Openweight 6-Man Tag Team Championship", "List_of_NEVER_Openweight_6-Man_Tag_Team_Champions", "2015-12-21", "sdh/never-openweight-6-man-tag-team-championship.png", { promotionId: "njpw" }),
  title("njpw-iwgp-heavyweight", "IWGP Heavyweight Championship", "List_of_IWGP_Heavyweight_Champions", "1987-06-12", "sdh/iwgp-heavyweight-championship.png", { promotionId: "njpw" }),
  title("njpw-iwgp-intercontinental", "IWGP Intercontinental Championship", "List_of_IWGP_Intercontinental_Champions", "2011-05-15", "iwgp-intercontinental-championship.png", { promotionId: "njpw", status: "retired" }),
  title("njpw-iwgp-united-states", "IWGP United States Heavyweight Championship", "List_of_IWGP_United_States_Heavyweight_Champions", "2017-07-02", "iwgp-united-states-heavyweight-championship.png", { promotionId: "njpw", status: "retired" }),
  title("njpw-iwgp-u-30", "IWGP U-30 Openweight Championship", "IWGP_U-30_Openweight_Championship", "2003-04-23", "iwgp-u-30-openweight-championship.png", { promotionId: "njpw", status: "retired" }),
  title("njpw-j-crown", "J-Crown", "J-Crown", "1996-08-05", "j-crown.svg", { promotionId: "njpw", status: "retired" }),
  title("njpw-nwf-heavyweight", "NWF Heavyweight Championship", "NWF_Heavyweight_Championship", "1970-01-01", "nwf-heavyweight-championship.png", { promotionId: "njpw", status: "retired" }),
  title("tna-world", "TNA World Championship", "List_of_TNA_World_Champions", "2007-05-13", "sdh/tna-world-championship.png", { promotionId: "tna" }),
  title("tna-x-division", "TNA X Division Championship", "List_of_TNA_X_Division_Champions", "2002-06-19", "sdh/tna-x-division-championship.png", { promotionId: "tna" }),
  title("tna-world-tag-team", "TNA World Tag Team Championship", "List_of_TNA_World_Tag_Team_Champions", "2007-05-17", "sdh/tna-world-tag-team-championship.png", { promotionId: "tna" }),
  title("tna-knockouts-world", "TNA Knockouts World Championship", "List_of_TNA_Knockouts_World_Champions", "2007-10-14", "sdh/tna-knockouts-world-championship.png", { promotionId: "tna" }),
  title("tna-knockouts-world-tag-team", "TNA Knockouts World Tag Team Championship", "List_of_TNA_Knockouts_World_Tag_Team_Champions", "2009-09-20", "sdh/tna-knockouts-world-tag-team-championship.png", { promotionId: "tna" }),
  title("tna-international", "TNA International Championship", "TNA_International_Championship", "2025-04-27", "sdh/tna-international-championship.png", { promotionId: "tna" }),
  title("roh-world", "ROH World Championship", "List_of_ROH_World_Champions", "2002-07-27", "sdh/roh-world-championship.png", { promotionId: "roh" }),
  title("roh-world-television", "ROH World Television Championship", "List_of_ROH_World_Television_Champions", "2010-03-05", "sdh/roh-world-television-championship.png", { promotionId: "roh" }),
  title("roh-pure", "ROH Pure Championship", "List_of_ROH_Pure_Champions", "2004-02-14", "sdh/roh-pure-championship.png", { promotionId: "roh" }),
  title("roh-world-tag-team", "ROH World Tag Team Championship", "List_of_ROH_World_Tag_Team_Champions", "2002-09-21", "sdh/roh-world-tag-team-championship.png", { promotionId: "roh" }),
  title("roh-world-six-man-tag-team", "ROH World Six-Man Tag Team Championship", "List_of_ROH_World_Six-Man_Tag_Team_Champions", "2016-12-02", "sdh/roh-world-six-man-tag-team-championship.png", { promotionId: "roh" }),
  title("roh-womens-world", "ROH Women's World Championship", "List_of_ROH_Women%27s_World_Champions", "2021-09-12", "sdh/roh-women-s-world-championship.png", { promotionId: "roh" }),
  title("roh-womens-world-television", "ROH Women's World Television Championship", "ROH_Women%27s_World_Television_Championship", "2023-12-16", "sdh/roh-women-s-world-television-championship.png", { promotionId: "roh" }),
  title("roh-womens-pure", "ROH Women's Pure Championship", "ROH_Women%27s_Pure_Championship", "2025-07-11", "sdh/roh-women-s-pure-championship.png", { promotionId: "roh" }),
];

const db = JSON.parse(await readFile(referencePath, "utf8"));
const imported = [];
const heritageCup = db.championships.find((championship) => championship.id === "wwe-nxt-heritage-cup");
if (heritageCup) heritageCup.status = "retired";

for (const definition of titles) {
  const response = await fetch(definition.url, { headers: { "user-agent": "Tobytube personal metadata importer (local prototype)" } });
  if (!response.ok) {
    console.warn(`${definition.name}: Wikipedia returned ${response.status}`);
    continue;
  }
  const reigns = parseTitleReigns(await response.text(), definition.id).filter((reign) => (!definition.minDate || !reign.dateWon || reign.dateWon >= definition.minDate) && (!definition.maxDate || !reign.dateWon || reign.dateWon <= definition.maxDate)).map((reign) => ({
    ...reign,
    personId: /vacat|deactivat|unified/i.test(reign.champion) ? null : `wrestler-${slug(reign.champion)}`,
  }));
  if (!reigns.length) {
    console.warn(`${definition.name}: no reign table was found`);
    continue;
  }
  db.titleReigns = db.titleReigns.filter((reign) => reign.championshipId !== definition.id);
  db.titleReigns.push(...reigns);
  const computed = computeStats(reigns);
  const imageUrl = await resolveImageUrl(definition);
  upsert(db.championships, {
    id: definition.id,
    promotionId: definition.promotionId,
    name: definition.name,
    established: definition.established,
    status: definition.status,
    imageUrl,
    currentChampion: computed.currentChampion,
    summary: `${definition.name} history maintained by Tobytube's wrestling reference database. Event records remain authoritative when linked to championship changes.`,
    recordStats: computed.recordStats,
    externalIds: { wikipedia: definition.url },
    sourceIds: ["wikipedia-championship-histories"],
  });
  imported.push({ name: definition.name, reigns: reigns.length });
}

if (!db.sources.some((source) => source.id === "wikipedia-championship-histories")) {
  db.sources.push({ id: "wikipedia-championship-histories", name: "Wikipedia championship histories" });
}
db.generatedAt = new Date().toISOString();
const tempPath = `${referencePath}.importing-wwe-active`;
await writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`);
await rename(tempPath, referencePath);
console.log(`Imported ${imported.length} WWE active championship pages (${imported.reduce((sum, item) => sum + item.reigns, 0)} reign rows).`);

function title(id, name, page, established, imageName, options = {}) {
  return { id, name, page, established, imageUrl: `./assets/championships/${imageName}`, url: `https://en.wikipedia.org/wiki/${page}`, promotionId: options.promotionId ?? "wwe", status: options.status ?? "active", minDate: options.minDate ?? null, maxDate: options.maxDate ?? null };
}

async function resolveImageUrl(definition) {
  try {
    await access(path.join(root, definition.imageUrl.replace(/^\.\//, "")));
    return definition.imageUrl;
  } catch {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("prop", "pageimages");
    url.searchParams.set("piprop", "thumbnail");
    url.searchParams.set("pithumbsize", "700");
    url.searchParams.set("titles", decodeURIComponent(definition.page).replaceAll("_", " "));
    const response = await fetch(url, { headers: { "user-agent": "Tobytube personal metadata importer (local prototype)" } });
    if (!response.ok) return definition.imageUrl;
    const pages = Object.values((await response.json()).query?.pages ?? {});
    if (pages[0]?.thumbnail?.source) return pages[0].thumbnail.source;
    const pageResponse = await fetch(definition.url, { headers: { "user-agent": "Tobytube personal metadata importer (local prototype)" } });
    const image = pageResponse.ok ? (await pageResponse.text()).match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] : null;
    return image ? image.replaceAll("&amp;", "&") : definition.imageUrl;
  }
}

function computeStats(reigns) {
  const valid = reigns.filter((reign) => !/vacat|deactivat|unified/i.test(reign.champion));
  const daysByChampion = new Map();
  const reignsByChampion = new Map();
  valid.forEach((reign) => {
    const champion = reign.champion;
    daysByChampion.set(champion, (daysByChampion.get(champion) ?? 0) + (Number(reign.days) || 0));
    reignsByChampion.set(champion, Math.max(reignsByChampion.get(champion) ?? 0, Number(reign.reign) || 1));
  });
  const longest = valid.filter((reign) => Number.isFinite(reign.days)).sort((a, b) => b.days - a.days)[0];
  const shortest = valid.filter((reign) => Number.isFinite(reign.days)).sort((a, b) => a.days - b.days)[0];
  const mostReigns = maxEntry(reignsByChampion);
  const longestCombined = maxEntry(daysByChampion);
  return {
    currentChampion: valid.at(-1)?.champion ?? null,
    recordStats: {
      inauguralChampion: valid[0]?.champion ?? null,
      mostReigns: mostReigns ? record(mostReigns[0], mostReigns[1], "reigns") : null,
      longestReign: longest ? record(longest.champion, longest.days, "days") : null,
      shortestReign: shortest ? record(shortest.champion, shortest.days, "days") : null,
      longestCombinedReign: longestCombined ? record(longestCombined[0], longestCombined[1], "days") : null,
    },
  };
}

function record(champion, value, unit) { return { champion, value, unit }; }
function maxEntry(map) { return [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? null; }
function upsert(records, next) { const index = records.findIndex((item) => item.id === next.id); if (index >= 0) records[index] = { ...records[index], ...next }; else records.push(next); }
function slug(value = "") { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
