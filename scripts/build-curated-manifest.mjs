import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extractsDir = path.join(root, "tmp", "curated-doc-extracts");
const outputPath = path.join(root, "src", "curated-manifest.generated.json");

const sourceFiles = {
  boxed: "Boxed sets and series prompt.txt",
  criterion: "Criterion notes.txt",
  hbo: "HBO.txt",
  misc: "Misc collections.txt",
};

const manifest = {
  generatedAt: new Date().toISOString(),
  source: "Curated source docs",
  notes: [
    "Curated source documents are authoritative for grouping, order, and local artwork decisions.",
    "TMDB hydration may fill missing metadata/posters but should not overwrite curated local art or curated placement.",
  ],
  collections: {},
  criterion: {
    noir: [],
    directorShowcase: [],
    boxedSets: [],
    officialChannelCollections: [],
    unparsed: [],
  },
  unparsed: [],
};

const boxed = await readLines(sourceFiles.boxed);
const criterion = await readLines(sourceFiles.criterion);
const hbo = await readLines(sourceFiles.hbo);
const misc = await readLinesOptional(sourceFiles.misc);

manifest.collections.hbo = parseKnownCollection(hbo, sourceFiles.hbo, {
  id: "hbo",
  start: "DISREGARD EVERYTHING ABOVE THIS LINE",
  sections: [
    ["essentials", "ESSENTIALS", "tv"],
    ["comedies", "Comedies", "tv"],
    ["limited-series", "Miniseries & Limited Series", "tv"],
    ["documentaries", "Documentary", "movie"],
    ["films", "Films", "movie"],
    ["stand-up", "Stand-Up & Comedy Specials", "movie"],
    ["animation", "Animation", "tv"],
    ["music-variety", "Music & Variety", "tv"],
    ["sports", "Sports", "tv"],
    ["more", "Other:", "tv"],
  ],
  sectionAliases: {
    Documentary: "documentaries",
    "Miniseries & Limited Series": "limited-series",
    "Stand-Up & Comedy Specials": "stand-up",
    "Music & Variety": "music-variety",
    "Other:": "more",
  },
  stopLines: [],
});

manifest.collections["saturday-morning-marathon"] = parseKnownCollection(boxed, sourceFiles.boxed, {
  id: "saturday-morning-marathon",
  start: "Saturday Morning Marathon",
  stop: "Genre Sections",
  sections: [
    ["car22ns", "Car22ns", "tv"],
    ["tgif", "Live Action/TGIF", "tv"],
  ],
});

manifest.collections["endless-anime-odyssey"] = parseKnownCollection(boxed, sourceFiles.boxed, {
  id: "endless-anime-odyssey",
  start: "Endless Anime Odyssey",
  stop: "Universal Monsters",
  sections: [
    ["essentials", "“Essentials” carousel:", "tv"],
    ["extras", "Extras", "tv"],
    ["shonen-giants", "Shonen Giants", "tv"],
    ["toonami-forever", "Toonami Forever", "tv"],
    ["eternal-episode-abyss", "Eternal Episode Abyss", "tv"],
    ["neon-midnight-anime", "Neon Midnight Anime", "tv"],
    ["anime-chaos-energy", "Anime Chaos Energy", "tv"],
  ],
});

manifest.collections["universal-monsters"] = await readTrackedCollection("config/universal-monsters.json");

manifest.collections.kaiju = parseKnownCollection(boxed, sourceFiles.boxed, {
  id: "kaiju",
  start: "Godzilla",
  stop: "Black Excellence",
  sections: [
    ["showa-1954-1975", "Showa Era", "movie"],
    ["heisei-1984-1995", "Heisei Era", "movie"],
    ["millennium-1999-2004", "Millennium Era", "movie"],
    ["reiwa-2016-present", "Reiwa Era", "movie"],
    ["monsterverse", "MonsterVerse", "movie"],
    ["king-kong", "King Kong", "movie"],
    ["all-monsters-attack", "All Monsters Attack", "movie"],
    ["mecha", "Mecha", "movie"],
    ["other-encounters", "Other Encounters", "movie"],
  ],
});

manifest.collections.disney = parseKnownCollection(boxed, sourceFiles.boxed, {
  id: "disney",
  start: "Disney",
  sections: [
    ["animated-classics", "Animated classics (Gold, Silver, and  Brozne  Age)", "movie"],
    ["live-action-classics", "Live-Action Classics", "movie"],
    ["renaissance", "Renaissance (Movies and TV)", "auto"],
    ["post-renaissance", "Post Renaissance", "movie"],
    ["modern-times", "Modern times", "movie"],
    ["pixar", "Pixar", "movie"],
    ["animated-tv", "Animated TV", "tv"],
    ["muppetmania", "MuppetMania", "movie"],
    ["shorts", "Shorts", "movie"],
    ["blast-from-the-past", "Blast from the Past", "movie"],
    ["other-animated-films", "Other Animated Films", "movie"],
  ],
});

Object.assign(manifest.collections, parseGenreCollections(boxed, sourceFiles.boxed));
applyHorrorKillersOverride(manifest.collections);

if (misc.length) applyMiscCollectionOverrides(misc, sourceFiles.misc);

parseCriterion(criterion, sourceFiles.criterion);

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

const collectionCount = Object.keys(manifest.collections).length;
const sectionCount = Object.values(manifest.collections).reduce((sum, collection) => sum + collection.sections.length, 0);
const itemCount = Object.values(manifest.collections).reduce(
  (sum, collection) => sum + collection.sections.reduce((inner, section) => inner + section.items.length, 0),
  0,
);
const criterionItemCount = [
  ...manifest.criterion.noir,
  ...manifest.criterion.directorShowcase,
  ...manifest.criterion.boxedSets,
  ...manifest.criterion.officialChannelCollections,
].reduce((sum, collection) => sum + collection.items.length, 0);

console.log(`Wrote ${collectionCount} collections, ${sectionCount} sections, ${itemCount} collection items.`);
console.log(`Wrote ${criterionItemCount} Criterion items across generated Criterion buckets.`);

async function readLines(fileName) {
  const text = await readFile(path.join(extractsDir, fileName), "utf8");
  return text
    .split(/\r?\n/)
    .map((text, index) => ({ text: normalizeLine(text), line: index + 1 }))
    .filter((entry) => entry.text);
}

async function readLinesOptional(fileName) {
  try {
    return await readLines(fileName);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function applyMiscCollectionOverrides(lines, sourceFile) {
  const upnCollection = parseKnownCollection(lines, sourceFile, {
    id: "black-excellence",
    start: "Black Excellence",
    stop: "Westerns",
    sections: [
      ["cinema", "Cinema", "movie"],
      ["tv-classics", "Television Classics", "tv"],
      ["umoja-unity-the-prestige-collection", "Umoja (Unity): The Prestige collection", "auto"],
      ["kujichagulia-self-determination-stand-up-comedy", "Kujichagulia (Self-Determination): Stand-up Comedy", "auto"],
      ["ujima-collective-work-and-responsibility-sketches-and-animation", "Ujima (Collective Work & Responsibility): Sketches & Animation", "auto"],
      ["ujamaa-cooperative-economics-horror-because-it-doesn-t-fit-anywhere-else", "Ujamaa (Cooperative Economics): Horror (because it doesn't fit anywhere else).", "movie"],
      ["nia-purpose-comedy", "Nia (Purpose): Comedy", "movie"],
      ["kumbaaa-creativity-music-and-culture", "Kumbaaa (Creativity): Music & Culture", "auto"],
      ["imani-faith-afrofuturism-and-sci-fi", "Imani (Faith): Afrofuturism & Sci-fi", "auto"],
    ],
  });
  const legacyPrestigeSection = upnCollection.sections.find((section) => section.id === "umoja-unity-the-prestige-collection");
  if (legacyPrestigeSection) legacyPrestigeSection.title = "Drama";
  manifest.collections["black-excellence"] = upnCollection;

  manifest.collections.kaiju = parseKnownCollection(lines, sourceFile, {
    id: "kaiju",
    start: "Godzilla",
    sections: [
      ["showa-1954-1975", "Showa (1954-1975)", "movie"],
      ["heisei-1984-1995", "Heisei (1984-1995)", "movie"],
      ["millennium-1999-2004", "Millennium (1999-2004)", "movie"],
      ["reiwa-2016-present", "Reiwa (2016-Present)", "auto"],
      ["monsterverse", "MonsterVerse", "auto"],
      ["king-kong", "King Kong", "movie"],
      ["all-monsters-attack", "All Monsters Attack!", "auto"],
      ["mecha", "Mecha", "auto"],
      ["other-encounters", "Other Encounters", "auto"],
    ],
  });
}

function parseKnownCollection(lines, sourceFile, spec) {
  const startIndex = findLine(lines, spec.start);
  const stopIndex = spec.stop ? findLine(lines, spec.stop, startIndex + 1) : lines.length;
  const sectionSpecs = spec.sections.map(([id, title, mediaType]) => ({
    id,
    title: cleanDisplayTitle(title),
    rawTitle: normalizeLine(title),
    mediaType,
  }));
  const indexes = sectionSpecs
    .map((section) => ({ ...section, index: findLine(lines, section.rawTitle, startIndex + 1, stopIndex) }))
    .filter((section) => section.index !== -1)
    .sort((a, b) => a.index - b.index);

  const sections = indexes.map((section, index) => {
    const nextIndex = indexes[index + 1]?.index ?? stopIndex;
    const rawItems = lines.slice(section.index + 1, nextIndex);
    return {
      id: section.id,
      title: section.title,
      source: { file: sourceFile, line: lines[section.index].line },
      items: rawItems
        .filter((entry) => isLikelyMediaLine(entry.text))
        .map((entry) => parseItem(entry, sourceFile, section.mediaType))
        .filter(Boolean),
    };
  });

  return {
    id: spec.id,
    source: { file: sourceFile, line: startIndex === -1 ? null : lines[startIndex].line },
    sections,
  };
}

async function readTrackedCollection(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const definition = JSON.parse(await readFile(sourcePath, "utf8"));
  return {
    id: definition.id,
    title: definition.title,
    collectionType: definition.collectionType,
    folderAliases: definition.folderAliases ?? [],
    source: { file: relativePath, line: 1 },
    sections: (definition.sections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      source: { file: relativePath, line: null },
      items: (section.items ?? []).map(([title, year, mediaType]) => ({
        id: `curated-${slugify(title)}-${year ?? "tba"}`,
        title,
        year: year ?? null,
        mediaType: mediaType ?? section.mediaType ?? "movie",
        season: null,
        source: { file: relativePath, line: null },
      })),
    })),
  };
}

function horrorKillerFranchiseManifestItem(id, title, posterFile, options = {}) {
  return {
    id: `horror-franchise-${id}`,
    title,
    year: null,
    mediaType: "franchise",
    posterUrl: `./assets/collections/horror/killers/${posterFile}`,
    targetCollectionId: options.targetCollectionId ?? null,
    franchiseCarousels: options.franchiseCarousels ?? [],
    summary: options.summary ?? `${title} franchise hub.`,
    source: { file: "Horror Killers franchise override", line: null },
  };
}

function applyHorrorKillersOverride(collections) {
  const horror = collections.horror;
  if (!horror?.sections?.length) return;
  const killers = horror.sections.find((section) => section.id === "killers");
  if (!killers) return;
  killers.items = [
    horrorKillerFranchiseManifestItem("freddy-vs-jason", "Freddy vs Jason", "friday-the-13th-nightmare-on-elm-street.png", {
      franchiseCarousels: ["Friday the 13th", "A Nightmare on Elm Street", "Crossovers and More"],
      summary: "Combo franchise hub for Friday the 13th, A Nightmare on Elm Street, Freddy vs Jason, related TV, and documentaries.",
    }),
    horrorKillerFranchiseManifestItem("alien-vs-predator", "Alien vs Predator", "alien-vs-predator-button.png", {
      franchiseCarousels: ["Alien", "Predator", "Crossovers and More"],
      summary: "Combo franchise hub for Alien, Predator, Alien vs Predator crossovers, Alien: Earth, and related documentaries.",
    }),
    horrorKillerFranchiseManifestItem("tales-from-the-creepshow", "Tales from the Creepshow", "tales-from-the-creepshow-button.png", {
      franchiseCarousels: ["Creepshow", "Tales from the Crypt"],
      summary: "Creepshow, Tales from the Crypt, and their gruesomely good television and film relatives.",
    }),
    horrorKillerFranchiseManifestItem("universal-monsters", "Universal Monsters", "universal-monsters-button.png", { targetCollectionId: "universal-monsters" }),
    horrorKillerFranchiseManifestItem("hammer", "The House of Hammer", "hammer-button.png", { targetCollectionId: "hammer" }),
    horrorKillerFranchiseManifestItem("candyman", "Candyman", "candyman-button.png"),
    horrorKillerFranchiseManifestItem("children-of-the-corn", "Children of the Corn", "children-of-the-corn-button.png"),
    horrorKillerFranchiseManifestItem("evil-dead", "The Evil Dead", "evil-dead-button.png"),
    horrorKillerFranchiseManifestItem("childs-play", "Child's Play", "childs-play-button.png"),
    horrorKillerFranchiseManifestItem("exorcist", "The Exorcist", "exorcist-button.png"),
    horrorKillerFranchiseManifestItem("halloween", "Halloween", "halloween-button.png"),
    horrorKillerFranchiseManifestItem("the-omen", "The Omen", "the-omen-button.png"),
    horrorKillerFranchiseManifestItem("texas-chainsaw-massacre", "Texas Chainsaw Massacre", "texas-chainsaw-massacre-button.png"),
    horrorKillerFranchiseManifestItem("phantasm", "Phantasm", "phantasm-button.png"),
    horrorKillerFranchiseManifestItem("psycho", "Psycho", "psycho-button.png"),
    horrorKillerFranchiseManifestItem("hellraiser", "Hellraiser", "hellrasier-button.png"),
    horrorKillerFranchiseManifestItem("saw", "Saw", "saw-button.png"),
    horrorKillerFranchiseManifestItem("scream", "Scream", "scream-button.png"),
  ];
}

function genreSectionSpecs() {
  return {
    horror: {
      marker: "Horror",
      title: "Horror",
      sections: [
        ["killers", "Killers", "movie"],
        ["slashers", "Slashers", "movie"],
        ["creature-features", ["Creature Features", "Creatures Feaures"], "movie", "Creature Features"],
        ["supernatural", "Supernatural", "movie"],
        ["sci-fi-horror", "Sci-Fi Horror", "movie"],
        ["cult-experimental", ["Cult/Experimental", "Cult / Experimental"], "movie", "Cult/Experimental"],
        ["found-footage", "Found Footage", "movie"],
        ["evil-puppets", "Evil Puppets", "movie"],
        ["relentless-pursuers", ["Relentless Pursuers", "\"Relentless Pursuer Horror\""], "movie", "Relentless Pursuers"],
        ["spooky-kids-tv", "TV", "tv", "Spoopy Kids TV", "SpoOpY Kids' horror", "Movies"],
        ["spoopy-kids-movies", "Movies", "movie", "Spoopy Kids Movies", "SpoOpY Kids' horror"],
        ["gateway-horror", "Gateway Horror", "movie"],
      ],
    },
    fantasy: {
      marker: "Fantasy",
      title: "Fantasy",
      sections: [
        ["grand-epics", "Grand Epics", "movie"],
        ["science-fantasy", "Science Fantasy", "movie"],
        ["sword-and-sorcery", "Sword & Sorcery", "movie"],
        ["fairy-tales", "Fairy Tales", "movie"],
        ["dark-fantasy", "Dark Fantasy", "movie"],
        ["urban-fantasy", "Urban Fantasy", "movie"],
        ["mythology", "Mythology", "movie"],
        ["portals-to-other-worlds", "Portals to Other Worlds", "movie"],
        ["comic-fantasy", "Comic Fantasy", "movie"],
      ],
    },
    comedy: {
      marker: "Comedy",
      title: "Comedy",
      sections: [
        ["marx-brothers", "Marx Brothers", "movie"],
        ["buddy-comedies", "Buddy Comedies", "movie", "Buddies"],
        ["odd-couples", "Odd Couples", "movie"],
        ["fish-out-of-water", "Fish-out-of-Water", "movie"],
        ["black-excellence", "Black Excellence", "movie", "Black"],
        ["slapstick", "Slapstick", "movie"],
        ["indefensible-stupidity", "Indefensible Stupidity", "movie"],
        ["road-trips", "Road Trips", "movie", "Road Trip"],
        ["satire", "Satire", "movie"],
        ["dark-comedy", "Dark Comedy", "movie", "Dark"],
        ["farce", "Farce", "movie"],
        ["observational", "Observational", "movie"],
        ["mockumentary", "Mockumentary", "movie"],
        ["parody", "Parody", "movie"],
        ["musicals", "Musicals", "movie"],
        ["stoner-comedy", "Stoner Comedy", "movie", "Stoner"],
        ["teen", "Teen", "movie"],
        ["family", "Family", "movie"],
      ],
    },
    "sci-fi": {
      marker: "Sci-Fi",
      title: "Sci-Fi",
      sections: [
        ["alien-invaders", "Alien Invaders", "movie"],
        ["science-experiments-gone-wrong", "Science Experiments Gone Wrong", "movie"],
        ["devils-in-the-machine", "Devils in the Machine", "movie"],
        ["space-opera", "Space Opera", "movie"],
        ["hard-sci-fi", "Hard Sci-fi", "movie"],
        ["cyberpunk", "Cyberpunk", "movie"],
        ["steampunk", "Steampunk", "movie"],
        ["military-sci-fi", "Military Sci-Fi", "movie", "Military"],
        ["climate-disasters", "Climate Disasters", "movie"],
        ["dystopia", "Dystopia", "movie"],
        ["time-travel", "Time Travel", "movie"],
        ["post-apocalypse", "Post-Apocalypse", "movie"],
        ["weird-new-worlds", "Weird New Worlds", "movie"],
      ],
    },
    western: {
      marker: "Westerns",
      title: "Western",
      sections: [
        ["indigenous-heroes", "Indigenous Heroes", "movie"],
        ["manifest-destiny", "Manifest Destiny", "movie"],
        ["singing-cowboys", "Singing Cowboys", "movie"],
        ["spaghetti-westerns", "Spaghetti Westerns", "movie"],
        ["oosterns", "Oosterns (Red Westerns)", "movie", "Oosterns"],
        ["revisionist-westerns", "Revisionist Western", "movie", "Revisionist Westerns"],
        ["anti-western", "Anti-Western", "movie"],
        ["outlaws", "Outlaws", "movie"],
        ["survivalism", "Survivalism", "movie"],
        ["neo-western", "Neo-Western", "movie"],
        ["borderlands", "Borderlands", "movie"],
        ["weird-westerns", "Weird Westerns", "movie"],
        ["eastern-influence", "Eastern Influence", "auto", "Eastern Influences"],
      ],
    },
    romance: {
      marker: "Romance",
      title: "Romance",
      sections: [
        ["romcoms", "RomComs", "movie"],
        ["romdrams", "RomDrams", "movie"],
        ["historical", "Historical", "movie", "Historicals"],
        ["paranormal-and-fantasy", "Paranormal & Fantasy", "movie"],
        ["action-and-thriller", "Action & Thriller", "movie"],
        ["coming-of-age-and-ya", "Coming-of-Age & YA", "movie"],
        ["lgbtq", "LGBTQ+", "movie"],
        ["musicals", "Musicals", "movie", "Musical"],
        ["erotica", "Erotica", "movie"],
      ],
    },
    action: {
      marker: "Action",
      title: "Action",
      sections: [
        ["adventure", "Adventure", "movie"],
        ["thriller", "Thriller", "movie"],
        ["martial-arts", "Martial Arts", "movie"],
        ["cops-and-crime", "Cops & Crime", "movie"],
        ["car-go-vroom", "CAR GO VROOM", "movie"],
        ["spies-and-espionage", "Spies & Espionage", "movie"],
        ["military-and-war", "Military & War", "movie"],
        ["action-comedy", "Action Comedy", "movie"],
        ["high-terror", "High Terror", "movie"],
        ["disaster-and-survival", "Disaster & Survival", "movie"],
        ["vigilantes-and-revenge", "Vigilantes & Revenge", "movie"],
        ["action-sci-fi", "Action Sci-Fi", "movie"],
      ],
    },
    drama: {
      marker: "Drama",
      title: "Drama",
      sections: [
        ["historical", "Historical", "movie"],
        ["coming-of-age", "Coming-of-Age", "movie"],
        ["romantic-drama", "Romantic Drama", "movie"],
        ["character-driven", "Character-Driven", "movie"],
        ["social-drama", "Social Drama", "movie"],
        ["tragedy", "Tragedy", "movie"],
        ["prestige-oscar-bait", "Prestige (Oscar Bait)", "movie"],
        ["biopics", "Biopics", "movie"],
        ["family-drama", "Family Drama", "movie"],
        ["crime-and-legal", "Crime & Legal", "movie"],
        ["psychological", "Psychological", "movie"],
        ["war", "War", "movie"],
        ["meoldrama", ["Meoldrama", "Melodrama"], "movie", "Meoldrama"],
        ["working-class", "Working-Class", "movie"],
        ["period", "Period", "movie"],
      ],
    },
    documentary: {
      marker: "Documentaries",
      title: "Documentary",
      sections: [
        ["true-crime", "True Crime", "movie"],
        ["biography", "Biography", "movie"],
        ["historical", "Historical", "movie"],
        ["social-and-cultural", "Social & Cultural", "movie"],
        ["nature-and-wildlife", "Nature & Wildlife", "movie"],
        ["expose", ["Expose", "Exposé"], "movie", "Expose"],
        ["observational", "Observational", "movie"],
        ["participatory", "Participatory", "movie"],
        ["music", "Music", "movie"],
        ["political", "Political", "movie"],
        ["sports", "Sports", "movie"],
        ["science-and-technology", "Science & Technology", "movie"],
        ["travel-and-exploration", "Travel & Exploration", "movie"],
        ["experimental-essay", "Experimental/Essay", "movie"],
      ],
    },
    sports: {
      marker: "Sports",
      title: "Sport",
      sections: [
        ["drama", "Drama", "movie"],
        ["comedy", "Comedy", "movie"],
        ["biopic", "Biopic", "movie"],
        ["underdogs", "Underdogs", "movie"],
        ["documentary", "Documentary", "movie"],
        ["combat-sports", "Combat Sports", "movie"],
        ["racing", "Racing", "movie"],
        ["teams", "Teams", "movie"],
        ["individual-excellence", "Individual Excellence", "movie"],
        ["extreme-sports", "Extreme Sports", "movie"],
      ],
    },
  };
}

function parseCriterion(lines, sourceFile) {
  const noirStart = findLine(lines, "Criterion Noir Collections");
  const directorsStart = findLine(lines, "Director showcases.");
  const boxedStart = findLine(lines, "“Semi-Official Criterion Boxed Sets”");
  const channelStart = findLine(lines, "Official Criterion Channel Collections");

  manifest.criterion.noir = parseLooseCollections(lines, sourceFile, noirStart + 1, directorsStart, {
    bucket: "criterion-noir",
    mediaType: "movie",
    includeTitle: (title) => title.toLowerCase().includes("noir") || !title.match(/^international noir$/i),
  });

  manifest.criterion.directorShowcase = parseDirectorShowcases(lines, sourceFile, directorsStart + 1, boxedStart);

  manifest.criterion.boxedSets = parseLooseCollections(lines, sourceFile, boxedStart + 1, channelStart, {
    bucket: "criterion-boxed-sets",
    mediaType: "movie",
    skipTitles: new Set(["Films"]),
  });

  manifest.criterion.officialChannelCollections = parseLooseCollections(lines, sourceFile, channelStart + 1, lines.length, {
    bucket: "criterion-channel-collections",
    mediaType: "movie",
  });
  manifest.criterion.officialChannelCollections = mergeCriterionAliases(
    manifest.criterion.officialChannelCollections,
    new Map([["weimar-germany", "weimar-cinema"]]),
  );
}

function mergeCriterionAliases(collections, aliases) {
  const bySlug = new Map(collections.map((collection) => [slugify(collection.title), { ...collection, items: [...collection.items] }]));
  aliases.forEach((targetSlug, sourceSlug) => {
    const source = bySlug.get(sourceSlug);
    const target = bySlug.get(targetSlug);
    if (!source || !target) return;
    target.items = dedupeItems([...target.items, ...source.items]);
    bySlug.delete(sourceSlug);
  });
  return [...bySlug.values()];
}

function parseDirectorShowcases(lines, sourceFile, start, stop) {
  if (start < 0 || stop < 0 || start >= stop) return [];
  const entries = lines.slice(start, stop);
  const meaningful = entries.filter((entry) => !isNoteLine(entry.text));
  const directorLines = new Set();

  meaningful.forEach((entry, index) => {
    const next = meaningful[index + 1];
    if (isLikelyDirectorHeading(entry.text) && (index === 0 || (next && isDirectorSectionHeading(next.text)))) directorLines.add(entry.line);
  });

  const collections = [];
  let collection = null;
  let section = null;
  for (const entry of entries) {
    const text = cleanDisplayTitle(entry.text);
    if (!text || isNoteLine(text)) continue;
    if (/^Male Shelf$/i.test(text)) break;

    if (directorLines.has(entry.line)) {
      collection = createLooseCollection(text, entry, sourceFile, { bucket: "criterion-director-showcase" });
      collection.sections = [];
      collections.push(collection);
      section = null;
      continue;
    }
    if (!collection) continue;

    if (isDirectorSectionHeading(text)) {
      if (isExcludedDirectorSection(text)) {
        section = { excluded: true };
        continue;
      }
      const title = normalizeDirectorSectionTitle(text);
      section = collection.sections.find((candidate) => candidate.id === slugify(title));
      if (!section) {
        section = { id: slugify(title), title, source: { file: sourceFile, line: entry.line }, items: [] };
        collection.sections.push(section);
      }
      continue;
    }

    if (!hasYearLine(text)) continue;
    if (section?.excluded) continue;
    if (!section) {
      section = { id: "directed-films", title: "Directed Films", source: { file: sourceFile, line: entry.line }, items: [] };
      collection.sections.push(section);
    }
    const item = parseItem(entry, sourceFile, "movie");
    if (item) section.items.push(item);
  }

  return collections
    .map((entry) => ({
      ...entry,
      sections: entry.sections
        .map((sectionEntry) => ({ ...sectionEntry, items: dedupeItems(sectionEntry.items) }))
        .filter((sectionEntry) => sectionEntry.items.length),
      items: dedupeItems(entry.sections.flatMap((sectionEntry) => sectionEntry.items)),
    }))
    .filter((entry) => entry.items.length);
}

function isLikelyDirectorHeading(value) {
  const title = cleanDisplayTitle(value);
  return Boolean(title)
    && !hasYearLine(title)
    && !/\d{4}/.test(title)
    && title.length <= 80
    && !/^(?:Several|Various)\b/i.test(title)
    && !/\b(?:did not|is relatively|episodes)$/i.test(title);
}

function isDirectorSectionHeading(value) {
  const title = cleanDisplayTitle(value);
  return /^(?:Silent|Black and White|Colour|Narrative films|Documentaries(?:\s*\/.*)?|Narrative Feature Films|Student & Early Films|Major films|Political Era|Television & Video Essays|Feature Films|Short Films|Television & Documentary Series Work|Feature-Length Films|Television|Director|Screenwriter|Shorts|Five Films|Features|Television Dramas|Expanded from Dekalog|Feature-Length Narrative Films|Feature-Length Documentaries|Documentary Shorts \/ Essay Films|Silent Films|Sound Feature Films|Historical \/ Educational Features|Directed Features|Writer Only|Other Screenwriting Credits|Other Television Work|Sound Films|Shorts \/ Documentaries|Essential Shelf|Screenwriting)$/i.test(title);
}

function isExcludedDirectorSection(value) {
  return /^Essential Shelf$/i.test(cleanDisplayTitle(value));
}

function normalizeDirectorSectionTitle(value) {
  const title = cleanDisplayTitle(value);
  if (/^(?:Writer Only|Screenwriter|Screenwriting|Other Screenwriting Credits)$/i.test(title)) return "Screenwriting Credits";
  if (/^Director$/i.test(title)) return "Directed Films";
  return title;
}

function parseGenreCollections(lines, sourceFile) {
  const genreStart = findLine(lines, "Genre Sections");
  const disneyStart = findLine(lines, "Disney");
  const specs = genreSectionSpecs();
  const starts = Object.entries(specs)
    .map(([id, spec]) => ({ id, ...spec, index: findLine(lines, `## ${spec.marker}`, genreStart + 1, disneyStart) }))
    .filter((genre) => genre.index !== -1);
  starts.sort((a, b) => a.index - b.index);

  return Object.fromEntries(
    starts.map((genre, index) => {
      const stop = starts[index + 1]?.index ?? disneyStart;
      const sections = parseExpectedSections(lines, sourceFile, genre.index + 1, stop, genre.sections);
      return [
        genre.id,
        {
          id: genre.id,
          source: { file: sourceFile, line: lines[genre.index].line },
          sections,
        },
      ];
    }),
  );
}

function parseExpectedSections(lines, sourceFile, start, stop, sectionSpecs) {
  const indexes = sectionSpecs
    .map(([id, rawTitles, mediaType, displayTitle, parentTitle, stopTitle]) => {
      const titles = Array.isArray(rawTitles) ? rawTitles : [rawTitles];
      const parentIndex = parentTitle ? findAnyLine(lines, [parentTitle], start, stop) : -1;
      const searchStart = parentIndex === -1 ? start : parentIndex + 1;
      const index = findAnyLine(lines, titles, searchStart, stop);
      return {
        id,
        title: cleanDisplayTitle(displayTitle ?? titles[0]),
        mediaType,
        index,
        explicitStop: stopTitle && index !== -1 ? findLine(lines, stopTitle, index + 1, stop) : -1,
      };
    })
    .filter((section) => section.index !== -1)
    .sort((a, b) => a.index - b.index);

  return indexes
    .map((section, index) => {
      const nextIndex = section.explicitStop !== -1 ? section.explicitStop : indexes[index + 1]?.index ?? stop;
      return {
        id: section.id,
        title: section.title,
        source: { file: sourceFile, line: lines[section.index].line },
        items: lines
          .slice(section.index + 1, nextIndex)
          .filter((entry) => isLikelyMediaLine(entry.text))
          .map((entry) => parseItem(entry, sourceFile, section.mediaType))
          .filter(Boolean),
      };
    })
    .filter((section) => section.items.length);
}

function parseLooseSections(lines, sourceFile, start, stop, options = {}) {
  const sections = [];
  let current = null;
  for (const entry of lines.slice(start, stop)) {
    const text = entry.text;
    if (isNoteLine(text)) continue;
    if (hasYearLine(text)) {
      if (!current) {
        current = {
          id: slugify(options.genreTitle ?? "uncategorized"),
          title: options.genreTitle ?? "Uncategorized",
          source: { file: sourceFile, line: entry.line },
          items: [],
        };
        sections.push(current);
      }
      const item = parseItem(entry, sourceFile, options.mediaType ?? "movie");
      if (item) current.items.push(item);
      continue;
    }
    const title = cleanDisplayTitle(text);
    if (!title || title.length > 72) continue;
    current = {
      id: slugify(title),
      title,
      source: { file: sourceFile, line: entry.line },
      items: [],
    };
    sections.push(current);
  }
  return sections.filter((section) => section.items.length);
}

function parseLooseCollections(lines, sourceFile, start, stop, options = {}) {
  if (start < 0 || stop < 0 || start >= stop) return [];
  const collections = [];
  let current = null;
  const skipped = options.skipTitles ?? new Set();

  for (const entry of lines.slice(start, stop)) {
    const text = entry.text;
    if (isNoteLine(text)) continue;

    if (hasYearLine(text)) {
      if (!current) {
        current = createLooseCollection("Untitled", entry, sourceFile, options);
        collections.push(current);
      }
      const item = parseItem(entry, sourceFile, options.mediaType ?? "movie");
      if (item) current.items.push(item);
      continue;
    }

    const title = cleanDisplayTitle(text);
    if (!title || skipped.has(title) || title.length > 96) continue;
    current = createLooseCollection(title, entry, sourceFile, options);
    collections.push(current);
  }

  return mergeDuplicateCollections(collections.filter((collection) => collection.items.length));
}

function mergeDuplicateCollections(collections) {
  const byId = new Map();
  collections.forEach((collection) => {
    const existing = byId.get(collection.id);
    if (!existing) {
      byId.set(collection.id, { ...collection, items: dedupeItems(collection.items) });
      return;
    }
    existing.items = dedupeItems([...existing.items, ...collection.items]);
  });
  return [...byId.values()];
}

function dedupeItems(items) {
  return [...new Map(items.map((item) => [`${slugify(item.title)}-${item.year ?? "tba"}-${item.mediaType ?? "movie"}`, item])).values()];
}

function createLooseCollection(title, entry, sourceFile, options) {
  return {
    id: `${options.bucket}-${slugify(title)}`,
    title,
    source: { file: sourceFile, line: entry.line },
    items: [],
  };
}

function parseItem(entry, sourceFile, mediaTypeHint = "movie") {
  let text = cleanDisplayTitle(entry.text)
    .replace(/\s+—\s+.*$/, "")
    .replace(/\s+[—–]\s+.*$/, "")
    .replace(/\s+-\s+Dir\.?.*$/i, "")
    .replace(/\s+\[[^\]]+\]$/, "")
    .replace(/(\(\d{4}(?:\s*[–—â€“â€”-]\s*\d{2,4})?\))\s*[A-Z]{2,3}\b/g, "$1")
    .replace(/\p{Regional_Indicator}{2}/gu, "")
    .trim();
  if (!text || isNoteLine(text)) return null;

  let season = null;
  const seasonMatch = text.match(/\((?:Season|Series)\s+(\d+)\)/i);
  if (seasonMatch) {
    season = Number(seasonMatch[1]);
    text = text.replace(/\((?:Season|Series)\s+\d+\)\s*/i, "").trim();
  }

  const rangeMatch = text.match(/\((\d{4})\s*[–—-]\s*(\d{2,4})\)/);
  const yearMatch = text.match(/\((\d{4})\)/);
  const year = rangeMatch ? Number(rangeMatch[1]) : yearMatch ? Number(yearMatch[1]) : null;
  const title = text
    .replace(/\s*\((\d{4})\s*[–—-]\s*(\d{2,4})\)\s*/g, "")
    .replace(/\s*\((\d{4})\)\s*/g, "")
    .replace(/(?!^)\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\([^)]*(?:feature|segment|often|categorized|fantastical|silent|original|version|expansion|DCAMU|distribution|optional)[^)]*\)\s*/gi, " ")
    .replace(/\s*\((lost|Lana only|DCAMU.*|distribution.*|optional)\)\s*/gi, "")
    .replace(/\s*[-–—]\s*(?:Animated|Live Action|Live-Action|Animated\s*\/\s*Live Action Hybrid|Live Action\s*\/\s*Animation Hybrid)\s*$/i, "")
    .replace(/\b[A-Z]{2,3}\b$/g, "")
    .replace(/ðŸ‡[^\s(]*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title || !/[A-Za-z0-9]/.test(title)) return null;

  const mediaType = mediaTypeHint === "auto" ? guessMediaType(title, season, rangeMatch) : mediaTypeHint;
  return {
    id: `curated-${slugify(title)}-${year ?? "tba"}`,
    title,
    year,
    mediaType,
    season,
    source: { file: sourceFile, line: entry.line },
  };
}

function isLikelyMediaLine(text) {
  if (!text || isNoteLine(text)) return false;
  if (hasYearLine(text)) return true;
  if (/^[A-Z0-9][A-Za-z0-9'’!?:.&,+\-\s]+$/.test(text) && text.length <= 72) return true;
  return false;
}

function hasYearLine(text) {
  return /\(\d{4}(?:\s*[–—-]\s*\d{2,4})?\)/.test(text);
}

function isNoteLine(text) {
  return (
    !text ||
    /^\*+\s*Note:/i.test(text) ||
    /^\(.+\)$/.test(text) ||
    /^Description:/i.test(text) ||
    /^Titles pulled/i.test(text) ||
    /^The most /i.test(text) ||
    /^Additional titles/i.test(text) ||
    /^A few sources/i.test(text) ||
    /^Reorder buttons/i.test(text) ||
    /^And sequels\.?$/i.test(text) ||
    /^Additional sequels\.?$/i.test(text) ||
    /\scarousel:?$/i.test(text)
  );
}

function guessMediaType(title, season, rangeMatch) {
  if (season || rangeMatch) return "tv";
  return "movie";
}

function findLine(lines, needle, start = 0, stop = lines.length) {
  const normalizedNeedle = normalizeLine(needle).toLowerCase();
  return lines.findIndex((entry, index) => index >= start && index < stop && entry.text.toLowerCase() === normalizedNeedle);
}

function findAnyLine(lines, needles, start = 0, stop = lines.length) {
  const normalizedNeedles = new Set(needles.map((needle) => normalizeLine(needle).toLowerCase()));
  return lines.findIndex((entry, index) => index >= start && index < stop && normalizedNeedles.has(entry.text.toLowerCase()));
}

function cleanDisplayTitle(value) {
  return normalizeLine(value)
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/\s+carousel:?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLine(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/â€œ|â€/g, '"')
    .replace(/â€™/g, "'")
    .replace(/â€“/g, "-")
    .replace(/â€”/g, "-")
    .replace(/Ã©/g, "e")
    .replace(/Ã¨/g, "e")
    .replace(/Ã¡/g, "a")
    .replace(/Ã³/g, "o")
    .replace(/Ã¶/g, "o")
    .replace(/Ã¼/g, "u")
    .replace(/Ã´/g, "o")
    .replace(/Ãª/g, "e")
    .replace(/Ã§/g, "c")
    .replace(/Ã±/g, "n")
    .replace(/Ã /g, "a")
    .replace(/Â½/g, "1/2")
    .replace(/ðŸ‡[\\s\\S]{0,1}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
