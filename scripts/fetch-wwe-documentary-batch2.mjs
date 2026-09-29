import { writeFile } from "node:fs/promises";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const headers = process.env.TMDB_READ_ACCESS_TOKEN
  ? { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}` }
  : {};

const entries = [
  ["WF001", "Wrestling's Bloopers, Bleeps, & Bodyslams"],
  ["WF002", "Hulkamania"],
  ["WF003", "Best of the WWF #1"],
  ["WF005", "WWF's Most Unusual Matches"],
  ["WF006", "Andre the Giant"],
  ["WF007", "Best of the WWF #2"],
  ["WF008", "Wrestling's Biggest, Smallest, Strangest, Strongest"],
  ["WF009", "Rowdy Roddy Piper's Greatest Hits"],
  ["WF010", "Best of the WWF #3"],
  ["WF011", "The Amazing Managers"],
  ["WF012", "Wrestling's Country Boys"],
  ["WF013", "Best of the WWF #4"],
  ["WF015", "Tag Team Champions"],
  ["WF016", "The Life and Times of Captain Lou Albano"],
  ["WF017", "Best of the WWF #5"],
  ["WF018", "Grudge Matches"],
  ["WF019", "Ricky \"The Dragon\" Steamboat"],
  ["WF020", "Best of the WWF #6"],
  ["WF022", "Villains of the Squared Circle"],
  ["WF023", "Bruno Sammartino: Wrestling's Living Legend"],
  ["WF024", "Best of the WWF #7"],
  ["WF025", "WWF's Explosive TNT Show"],
  ["WF026", "Macho Man Randy Savage & Elizabeth"],
  ["WF027", "Best of the WWF #8"],
  ["WF028", "The Big Event"],
  ["WF029", "Inside the Steel Cage"],
  ["WF030", "The British Bulldogs"],
  ["WF031", "Best of the WWF #9"],
  ["WF032", "Grand Slams"],
  ["WF033", "Hulkamania 2"],
  ["WF034", "Best of the WWF #10"],
  ["WF036", "History of the Intercontinental Belt"],
  ["WF037", "The Hart Foundation"],
  ["WF038", "Best of the WWF #11"],
  ["WF039", "Even More Unusual Matches"],
  ["WF040", "Jake \"The Snake\" Roberts"],
  ["WF041", "Best of the WWF #12"],
  ["WF042", "History of the WWF Heavyweight Title"],
  ["WF043", "The Ken Patera Story"],
  ["WF044", "Best of the WWF #13"],
  ["WF045", "Piledriver: Wrestling Music Videos"],
  ["WF046", "Wrestling's Most Embarrassing Moments"],
  ["WF047", "George \"The Animal\" Steele"],
  ["WF048", "Best of the WWF #14"],
  ["WF050", "Saturday Night's Main Event: The Greatest Hits"],
  ["WF051", "Brutus \"The Barber\" Beefcake"],
  ["WF052", "Best of the WWF #15"],
  ["WF054", "Women of the WWF"],
  ["WF055", "Hulkamania 3"],
  ["WF056", "Best of the WWF #16"],
  ["WF058", "Wrestlefest 1988"],
  ["WF059", "Macho Madness"],
  ["WF060", "Best of the WWF #17"],
  ["WF063", "Brains Behind the Brawn"],
  ["WF064", "Hacksaw Jim Duggan"],
  ["WF065", "Best of the WWF #18"],
  ["WF067", "More Saturday Night's Main Event"],
  ["WF068", "Ultimate Warrior"],
  ["WF069", "Best of the WWF #19"],
  ["WF070", "Fan Favorites"],
  ["WF071", "Demolition"],
  ["WF072", "Best of the WWF #20"],
  ["WF074", "Hulkamania 4"],
  ["WF077", "Supertape #1"],
  ["WF079", "World Tour 1990"],
  ["WF080", "Wrestlefest 1990"],
  ["WF081", "Supertape #2"],
  ["WF082", "Battle of the WWF Superstars"],
  ["WF084", "Hottest Matches"],
  ["WF085", "Hulkamania Forever"],
  ["WF087", "Supertape #3"],
  ["WF089", "Mega Matches"],
  ["WF091", "Supertape #4"],
  ["WF092", "2nd Annual Battle of the WWF Superstars"],
  ["WF093", "Wrestlefest 1991"],
  ["WF094", "World Tour 1991"],
  ["WF096", "Rampage 1991"],
  ["WF097", "Hulkamania 6"],
  ["WF099", "Supertape 1992"],
  ["WF101", "Invasion 1992"],
  ["WF103", "Crunch Classic"],
  ["WF104", "1992 Battle of the Superstars"],
  ["WF105", "Wrestlefest 1992"],
  ["WF106", "World Tour 1992"],
  ["WF108", "Rampage 1992"],
  ["WF109", "Ultimate Warrior"],
  ["WF112", "Wrestling Grudge Matches"],
  ["WF114", "Smack 'em Whack 'em"],
  ["WF115", "UK Rampage 1993"],
  ["WF116", "Bashed in the USA"],
  ["WF117", "Invasion of the Bodyslammers"],
  ["WF118", "UK Fan Favourites 1993"],
  ["WF120", "Global Warfare"],
  ["WF121", "Wrestlefest 1993"],
  ["WF123", "Grudges, Gripes, & Grunts"],
  ["WF124", "1993 The Year in Review"],
  ["WF126", "Undertaker: His Gravest Matches"],
  ["WF128", "History of WrestleMania"],
  ["WF130", "Monday Night Raw Prime Cuts"],
  ["WF133", "Inside the WWF"],
  ["WF134", "Mania"],
  ["WF135", "Shawn Michaels Hits from the Heartbreak Kid"],
  ["WF136", "Wrestlefest 1994"],
  ["WF137", "Bloopers, Bleeps, & Bodyslams"],
  ["WF138", "Mega Matches 1995"],
  ["WF139", "Wrestlefest 1995"],
  ["WF140", "Bret \"Hitman\" Hart"],
  ["WF141", "1994 The Year in Review"],
  ["WF143", "Razor Ramon"],
  ["WF146", "Paul Bearer's Hits from the Crypt"],
  ["WF147", "UK Fan Favourites 1995"],
  ["WF149", "1995 The Year in Review"],
  ["WF150", "Wham Bam Bodyslam"],
  ["WF151", "Brawl in the Family"],
  ["WF165", "Best of Raw Vol. 01"],
  ["WF167", "Best of Raw Vol. 02"],
  ["WF171", "Best of Raw Vol. 03"],
  ["WF174", "Best of Raw Vol. 04"],
  ["WF178", "Best of Raw Vol. 05"],
  ["WF183", "Best of Raw Vol. 06"],
];

const records = [];
for (const [releaseCode, title] of entries) {
  const tmdb = await findTmdbMatch(title, releaseCode);
  records.push(toRecord(releaseCode, title, tmdb));
  await delay(100);
}

await writeFile("tmp-wwe-documentary-batch2.json", JSON.stringify(records, null, 2));
console.log(`Wrote ${records.length} second-batch WWE videos, ${records.filter((item) => item.posterUrl).length} with posters.`);

async function findTmdbMatch(title, releaseCode) {
  const queries = [
    `WWF ${title}`,
    `WWE ${title}`,
    title,
    `${releaseCode} ${title}`,
  ];
  const candidates = [];
  for (const query of queries) {
    const payload = await tmdbJson("search/movie", { query, page: 1 });
    candidates.push(...(payload.results ?? []));
    if (candidates.some((movie) => scoreMovie(movie, title, releaseCode) >= 100)) break;
    await delay(50);
  }

  return candidates
    .map((movie) => ({ movie, score: scoreMovie(movie, title, releaseCode) }))
    .filter((candidate) => candidate.score > 35)
    .sort((a, b) => b.score - a.score)[0]?.movie;
}

async function tmdbJson(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set("language", "en-US");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  if (!headers.Authorization && process.env.TMDB_API_KEY) url.searchParams.set("api_key", process.env.TMDB_API_KEY);

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB ${path} fetch failed: ${response.status}`);
  return response.json();
}

function scoreMovie(movie, title, releaseCode) {
  const movieTitle = movie.title ?? "";
  const left = normalize(movieTitle);
  const right = normalize(title);
  const code = releaseCode.toLowerCase();
  let score = 0;
  if (left === right || left === normalize(`WWF ${title}`) || left === normalize(`WWE ${title}`)) score += 100;
  if (left.includes(right) || right.includes(left)) score += 45;
  if (/wwf|wwe|wrestl|hulkamania|supertape|wrestlefest|raw/i.test(movieTitle)) score += 14;
  if (left.includes(code)) score += 20;
  if (movie.poster_path) score += 8;
  return score;
}

function toRecord(releaseCode, title, tmdb) {
  const releaseDate = tmdb?.release_date || null;
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) : null;
  return {
    id: `wwe-documentary-${releaseCode.toLowerCase()}-${slug(title)}`,
    releaseCode,
    tmdbId: tmdb?.id ?? null,
    title,
    date: releaseDate,
    year,
    listedYear: year,
    type: "documentary",
    eventLabel: "Home Video",
    posterCode: releaseCode,
    metadataSource: tmdb ? "TMDB" : "Seeded List",
    summary: tmdb?.overview || null,
    posterUrl: tmdb?.poster_path ? `https://image.tmdb.org/t/p/w342${tmdb.poster_path}` : null,
    backdropUrl: tmdb?.backdrop_path ? `https://image.tmdb.org/t/p/w780${tmdb.backdrop_path}` : null,
    voteAverage: tmdb?.vote_average ?? null,
  };
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/#/g, " ")
    .replace(/vol\.\s*0?(\d+)/g, "vol $1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value) {
  return normalize(value).replaceAll(" ", "-");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
