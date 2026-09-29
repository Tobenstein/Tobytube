import { writeFile } from "node:fs/promises";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const headers = process.env.TMDB_READ_ACCESS_TOKEN
  ? { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}` }
  : {};

const documentariesByYear = {
  1998: [
    "D-Generation X",
    "Three Faces of Foley",
    "The Undertaker: The Phenom",
    "Austin 3:16 Uncensored",
  ],
  1999: [
    "The Rock: Know Your Role",
    "Hell Yeah: The Stone Cold Saga Continues",
    "It's Our Time: Triple H & Chyna",
  ],
  2000: [
    "Chris Jericho: Break Down the Walls",
    "Kurt Angle: It's True! It's True!",
    "The Rock: The People's Champ",
    "Mick Foley: Hard Knocks & Cheap Pops",
  ],
  2001: [
    "The Undertaker: This Is My Yard",
    "Hardy Boyz: Leap of Faith",
    "Lita: It Just Feels Right",
  ],
  2002: [
    "Austin vs. McMahon",
    "Triple H: The Game",
    "The Rock: Just Bring It",
    "nWo: Back in Black",
    "Hollywood Hulk Hogan: Hulk Still Rules",
    "Stone Cold Steve Austin: What?",
  ],
  2003: [
    "Brock Lesnar: Here Comes the Pain",
    "Trish Stratus: 100% Stratusfaction Guaranteed",
    "From the Vault: Shawn Michaels",
    "Rey Mysterio: 619",
    "Ric Flair: The Ultimate Collection",
  ],
  2004: [
    "Cause Stone Cold Said So",
    "Bloodbath: Wrestling's Most Incredible Steel Cage Matches",
    "The History of WrestleMania I-IX",
    "Tombstone: The History of the Undertaker",
    "Randy Orton: The Evolution of a Predator",
    "Cheating Death, Stealing Life: The Eddie Guerrero Story",
  ],
  2005: [
    "Hulk Hogan: The Ultimate Anthology",
    "Bret \"Hit Man\" Hart: The Best There Is, The Best There Was, The Best There Ever Will Be",
    "The Road Warriors",
    "Jake \"The Snake\" Roberts: Pick Your Poison",
    "The Ultimate Ric Flair Collection",
    "The History of the Intercontinental Championship",
    "Ladder Match",
    "The Shawn Michaels Story: Heartbreak & Triumph",
    "Greatest Wrestling Stars of the '80s",
  ],
  2006: [
    "ECW: Bloodsport",
    "The Self-Destruction of the Ultimate Warrior",
    "Brian Pillman: Loose Cannon",
    "DX: One Last Stand",
    "Greatest Superstars of WrestleMania",
    "Ric Flair & The Four Horsemen",
    "Rey Mysterio: Biggest Little Man",
    "John Cena: My Life",
    "Rob Van Dam: One of a Kind",
    "The History of WWE",
    "Viva La Raza: The Legacy of Eddie Guerrero",
    "Saturday Night's Main Event Greatest Hits",
  ],
  2007: [
    "The Triumph and Tragedy of World Class Championship Wrestling",
    "The New & Improved DX",
    "Mr. McMahon",
    "The Condemned Behind the Scenes",
    "The Best of Saturday Night's Main Event",
    "The Life and Times of Mr. Perfect",
    "John Cena Experience",
    "Wrestling's Highest Flyers",
    "The Best of Raw: 15th Anniversary",
    "Twist of Fate: The Matt & Jeff Hardy Story",
    "Edge: A Decade of Decadence",
    "The Ladder Match 2: Crash & Burn",
    "Greatest Stars of the 90s",
  ],
  2008: [
    "Ric Flair: Definitive Collection",
    "The Rock: The Most Electrifying Man in Sports Entertainment",
    "Ultimate Nature Boy Collection",
    "The Best of Saturday Night's Main Event Vol. 2",
    "Nature Boy Ric Flair: The Definitive Collection",
    "Hell in a Cell",
    "The Rise and Fall of ECW",
    "Viva Las Divas",
    "The Legacy of Stone Cold Steve Austin",
    "Twisted, Disturbed Life of Kane",
    "Greatest Stars of the New Millennium",
  ],
  2009: [
    "History of the World Heavyweight Championship",
    "The Best of SmackDown: 10th Anniversary",
    "The Greatest Superstars of the 21st Century",
    "The Very Best of WCW Monday Nitro",
    "Allied Powers: The World's Greatest Tag Teams",
    "Hulk Hogan's Unreleased Collector's Series",
    "Greatest Rivalries: Shawn Michaels vs. Bret Hart",
    "Starrcade: The Essential Collection",
    "Ricky Steamboat: The Life Story of the Dragon",
    "Greatest Stars of the 2000s",
  ],
  2010: [
    "Bret Hart: Survival of the Hitman",
    "Straight to the Top: The Money in the Bank Ladder Match Anthology",
    "Shawn Michaels: My Journey",
    "WWE's Greatest Stars of the 90s",
    "John Morrison: Rock Star",
    "The Best PPV Matches of 2009-2010",
    "Ricky \"The Dragon\" Steamboat Collection",
    "Falls Count Anywhere",
    "The John Cena Experience",
    "Kane: Journey to Hell",
    "Raw: The Best of 2010",
  ],
  2011: [
    "Greatest Rivalries: The Rock vs. Stone Cold Steve Austin",
    "DX: Biggest and Baddest",
    "The True Story of WrestleMania",
    "WCW's Greatest Pay-Per-View Matches",
    "Randy Orton: Evolution of a Predator",
    "Macho Madness: The Randy Savage Ultimate Collection",
    "The Best of King of the Ring",
    "Stone Cold Steve Austin: The Bottom Line on the Most Popular Superstar of All Time",
    "OMG! The Top 50 Incidents in WWE History",
    "CM Punk: Best in the World",
    "Greatest Cage Matches of All Time",
  ],
  2012: [
    "You Think You Know Me? The Story of Edge",
    "WWE '12: Greatest Moments",
    "The Best of Raw & SmackDown 2011",
    "Legends of Mid-South Wrestling",
    "Falls Count Anywhere: The Greatest Street Fights and Other Out-of-Control Matches",
    "The Epic Journey of Dwayne \"The Rock\" Johnson",
    "The Attitude Era",
    "nWo: The Revolution",
    "Brock Lesnar: Here Comes the Pain",
    "ECW Unreleased Vol. 1",
    "Top 50 Superstars of All Time",
  ],
  2013: [
    "The Best of WCW Monday Nitro Vol. 2",
    "Bret Hart: The Dungeon Collection",
    "For All Mankind: The Life & Career of Mick Foley",
    "Top 25 Rivalries in Wrestling History",
    "Best of War Games",
    "ECW Unreleased Vol. 2",
    "Best of Madison Square Garden",
    "Mid-South Wrestling",
    "Triple H: Thy Kingdom Come",
    "Goldberg",
    "The History of WWE: 50 Years of Sports Entertainment",
    "Raw 20th Anniversary Collection",
    "Best Pay-Per-View Matches 2013",
  ],
  2014: [
    "The Best of Raw & SmackDown 2013",
    "Ultimate Warrior Collection",
    "Jake \"The Snake\" Roberts: The Power and the Glory",
    "Best of WWE at Madison Square Garden",
    "WrestleMania XXX Collector's Set",
    "Ladies and Gentlemen, My Name Is Paul Heyman",
    "Sting: Into the Light",
    "The Best of WCW Clash of the Champions",
    "Monday Night War Vol. 1",
    "Macho Man: The Randy Savage Story",
    "The Destruction of the Shield",
  ],
  2015: [
    "The Best of Raw & SmackDown 2014",
    "The Destruction of The Shield",
    "Chris Jericho: The Road Is Jericho",
    "Ultimate Warrior: Always Believe",
    "ECW Unreleased Vol. 3",
    "Monday Night War Vol. 1: Shots Fired",
    "Just Say Yes! Yes! Yes! Daniel Bryan",
    "It's Good to Be King: The Jerry Lawler Story",
    "Living on a Razor's Edge: The Scott Hall Story",
    "Owen: Hart of Gold",
    "The Kliq Rules",
    "Sting: Into the Light",
  ],
};

const records = [];

for (const [year, titles] of Object.entries(documentariesByYear)) {
  for (const title of titles) {
    const tmdb = await findTmdbMatch(title, Number(year));
    records.push(toRecord(title, Number(year), tmdb));
    await delay(120);
  }
}

await writeFile("tmp-wwe-documentaries.json", JSON.stringify(records, null, 2));
console.log(`Wrote ${records.length} WWE documentaries, ${records.filter((item) => item.posterUrl).length} with posters.`);

async function findTmdbMatch(title, year) {
  const queries = [`WWE ${title}`, title.replace(/^WWE\s+/i, "")];
  const candidates = [];
  for (const query of queries) {
    const payload = await tmdbJson("search/movie", { query, year, page: 1 });
    candidates.push(...(payload.results ?? []));
    if (candidates.length) break;
  }

  return candidates
    .map((movie) => ({ movie, score: scoreMovie(movie, title, year) }))
    .filter((candidate) => candidate.score > 0)
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

function scoreMovie(movie, title, expectedYear) {
  const movieTitle = movie.title ?? "";
  const movieYear = Number((movie.release_date ?? "").slice(0, 4));
  const left = normalize(movieTitle);
  const right = normalize(title);
  let score = 0;
  if (left === right || left === normalize(`WWE ${title}`)) score += 100;
  if (left.includes(right) || right.includes(left)) score += 45;
  if (/wwe|wwf|wrestle|raw|smackdown|wcw|ecw|nwo/i.test(movieTitle)) score += 15;
  if (movieYear === expectedYear) score += 30;
  if (Math.abs(movieYear - expectedYear) === 1) score += 10;
  if (movie.poster_path) score += 6;
  return score;
}

function toRecord(title, year, tmdb) {
  const releaseDate = tmdb?.release_date || `${year}-01-01`;
  return {
    id: `wwe-documentary-${slug(title)}-${year}`,
    tmdbId: tmdb?.id ?? null,
    title,
    date: releaseDate,
    year: Number(releaseDate.slice(0, 4)) || year,
    listedYear: year,
    type: "documentary",
    eventLabel: "Documentary",
    posterCode: "DOC",
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
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value) {
  return normalize(value).replaceAll(" ", "-");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
