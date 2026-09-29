import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://127.0.0.1:8092", { waitUntil: "networkidle" });

async function clickSelector(selector) {
  await page.evaluate((value) => document.querySelector(value)?.click(), selector);
  await page.waitForTimeout(300);
}

async function openCollection(id) {
  await clickSelector('[data-section="collections"]');
  await page.evaluate((collectionId) => document.querySelector(`[data-collection-id="${collectionId}"]`)?.click(), id);
  await page.waitForTimeout(300);
  return {
    rows: await page.evaluate(() =>
      Array.from(document.querySelectorAll(".curated-jump-row")).map((row) =>
        Array.from(row.querySelectorAll("button")).map((button) => button.textContent.trim().replace(/\s+/g, " ")),
      ),
    ),
    shelves: await page.evaluate(() =>
      Array.from(document.querySelectorAll(".curated-lane .lane-head h2")).map((heading) => heading.textContent.trim()),
    ),
  };
}

const blackExcellence = await openCollection("black-excellence");
const kaiju = await openCollection("kaiju");
const horror = await openCollection("horror");
const fantasy = await openCollection("fantasy");
const drama = await openCollection("drama");
const sciFi = await openCollection("sci-fi");
const sport = await openCollection("sports");
const western = await openCollection("western");

await browser.close();

console.log(
  JSON.stringify(
    {
      blackExcellence: {
        rows: blackExcellence.rows,
        shelves: blackExcellence.shelves.slice(0, 12),
      },
      kaiju: {
        rows: kaiju.rows,
        shelves: kaiju.shelves.slice(0, 12),
      },
      genrePages: {
        horror: { rows: horror.rows, shelves: horror.shelves.slice(0, 14) },
        fantasy: { rows: fantasy.rows, shelves: fantasy.shelves.slice(0, 12) },
        drama: { rows: drama.rows, shelves: drama.shelves.slice(0, 17) },
        sciFi: { rows: sciFi.rows, shelves: sciFi.shelves.slice(0, 15) },
        sport: { rows: sport.rows, shelves: sport.shelves.slice(0, 12) },
        western: { rows: western.rows, shelves: western.shelves.slice(0, 15) },
      },
    },
    null,
    2,
  ),
);
