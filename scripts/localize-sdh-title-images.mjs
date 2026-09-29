import fs from "node:fs";
import path from "node:path";

const appPath = path.resolve("src/app.js");
const outputDir = path.resolve("assets/championships/sdh");
const appSource = fs.readFileSync(appPath, "utf8");
const candidateCachePath = path.resolve("cache/sdh-title-image-candidates.json");
const candidateUrls = fs.existsSync(candidateCachePath)
  ? new Map(
      JSON.parse(fs.readFileSync(candidateCachePath, "utf8")).map((candidate) => [
        normalizeTitle(candidate.text),
        candidate.url,
      ]),
    )
  : new Map();
const mapMatch = appSource.match(/const sdhChampionshipImageMap = \{([\s\S]*?)\n\};/);

if (!mapMatch) {
  throw new Error("Could not find sdhChampionshipImageMap in src/app.js");
}

fs.mkdirSync(outputDir, { recursive: true });

const entries = [...mapMatch[1].matchAll(/^\s+"([^"]+)":\s+"(https:\/\/[^"]+)"/gm)].map((match) => ({
  title: match[1],
  url: match[2],
}));

let updatedSource = appSource;
let downloaded = 0;
let skipped = 0;
let failed = 0;

for (const entry of entries) {
  const sourceUrl = candidateUrls.get(normalizeTitle(entry.title)) ?? entry.url;
  const url = new URL(sourceUrl);
  const extension = getExtension(url.pathname);
  const fileName = `${slugify(entry.title)}${extension}`;
  const relativePath = `./assets/championships/sdh/${fileName}`;
  const outputPath = path.join(outputDir, fileName);

  try {
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) {
      const response = await fetch(sourceUrl, {
        headers: {
          "user-agent": "Mozilla/5.0 Tobytube prototype metadata fetcher",
          referer: "https://www.thesmackdownhotel.com/",
        },
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outputPath, bytes);
      downloaded += 1;
    } else {
      skipped += 1;
    }

    updatedSource = updatedSource.replaceAll(entry.url, relativePath);
  } catch (error) {
    failed += 1;
    console.warn(`Failed: ${entry.title} (${sourceUrl}) - ${error.message}`);
  }
}

fs.writeFileSync(appPath, updatedSource);
console.log(JSON.stringify({ entries: entries.length, downloaded, skipped, failed }, null, 2));

function getExtension(pathname) {
  const extension = path.extname(pathname).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return extension;
  return ".png";
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTitle(value) {
  return String(value ?? "")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
