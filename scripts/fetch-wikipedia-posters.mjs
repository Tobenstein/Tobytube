import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pages = {
  "usa-heat": "Heat (1995 film)",
  "usa-fargo": "Fargo (1996 film)",
  "usa-boogie": "Boogie Nights",
  "usa-matrix": "The Matrix",
  "usa-zodiac": "Zodiac (film)",
  "uk-naked": "Naked (1993 film)",
  "uk-trainspotting": "Trainspotting (film)",
  "uk-lock-stock": "Lock, Stock and Two Smoking Barrels",
  "uk-dead-mans-shoes": "Dead Man's Shoes (film)",
  "uk-in-bruges": "In Bruges",
  "fr-400-blows": "The 400 Blows",
  "fr-breathless": "Breathless (1960 film)",
  "fr-playtime": "Playtime",
  "fr-celine-julie": "Celine and Julie Go Boating",
  "fr-subway": "Subway (film)",
  "fr-amelie": "Amelie",
  "fr-cache": "Cache (2005 film)",
  "fr-prophet": "A Prophet",
  "fr-holy-motors": "Holy Motors",
  "fr-portrait": "Portrait of a Lady on Fire",
  "jp-seven-samurai": "Seven Samurai",
  "jp-tokyo-story": "Tokyo Story",
  "jp-harakiri": "Harakiri (1962 film)",
  "jp-high-low": "High and Low (1963 film)",
  "jp-house": "House (1977 film)",
  "jp-tampopo": "Tampopo",
  "jp-akira": "Akira (1988 film)",
  "jp-cure": "Cure (film)",
  "jp-battle-royale": "Battle Royale (film)",
  "jp-spirited-away": "Spirited Away",
  "mighty-boosh": "The Mighty Boosh",
  toast: "Toast of London",
  "derry-girls": "Derry Girls",
  "little-britain": "Little Britain (TV series)",
  "bobs-burgers": "Bob's Burgers",
};

const outputPath = path.join(root, "src", "tmdb-posters.generated.json");
const posters = await readExisting(outputPath);

for (const [id, title] of Object.entries(pages)) {
  if (posters[id]?.posterUrl) continue;

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "TobytubePrototype/0.1 (personal local prototype)",
    },
  });

  if (!response.ok) {
    const fallbackUrl = await scrapeOpenGraphImage(title);
    if (fallbackUrl) {
      posters[id] = {
        source: "wikipedia",
        page: `https://en.wikipedia.org/wiki/${encodeURIComponent(title).replaceAll("%20", "_")}`,
        posterUrl: fallbackUrl,
      };
    } else {
      console.warn(`No Wikipedia summary for ${title}: ${response.status}`);
    }
    await delay(1200);
    continue;
  }

  const json = await response.json();
  const posterUrl = json.originalimage?.source ?? json.thumbnail?.source;
  const fallbackUrl = posterUrl ?? (await scrapeOpenGraphImage(title));
  if (!fallbackUrl) {
    console.warn(`No image for ${title}`);
    await delay(1200);
    continue;
  }

  posters[id] = {
    source: "wikipedia",
    page: json.content_urls?.desktop?.page,
    posterUrl: fallbackUrl,
  };

  await delay(1200);
}

await writeFile(outputPath, `${JSON.stringify(posters, null, 2)}\n`);
console.log(`Wrote ${Object.keys(posters).length} poster mappings to ${outputPath}`);

async function readExisting(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeOpenGraphImage(title) {
  const response = await fetch(`https://en.wikipedia.org/wiki/${encodeURIComponent(title).replaceAll("%20", "_")}`, {
    headers: {
      "User-Agent": "TobytubePrototype/0.1 (personal local prototype)",
    },
  });

  if (!response.ok) return null;

  const html = await response.text();
  const match = html.match(/property="og:image"\s+content="([^"]+)"/);
  return match?.[1] ?? null;
}
