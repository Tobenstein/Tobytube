import { writeFile } from "node:fs/promises";

const api = "https://prowrestling.fandom.com/api.php";
const members = [];
let cmcontinue = null;

do {
  const url = new URL(api);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "categorymembers");
  url.searchParams.set("cmtitle", "Category:World Wrestling Entertainment DVD releases");
  url.searchParams.set("cmlimit", "500");
  url.searchParams.set("format", "json");
  if (cmcontinue) url.searchParams.set("cmcontinue", cmcontinue);

  const payload = await json(url);
  members.push(...(payload.query?.categorymembers ?? []));
  cmcontinue = payload.continue?.cmcontinue ?? null;
} while (cmcontinue);

const pages = [];
for (const chunk of chunks(members, 50)) {
  const url = new URL(api);
  url.searchParams.set("action", "query");
  url.searchParams.set("pageids", chunk.map((item) => item.pageid).join("|"));
  url.searchParams.set("prop", "pageimages|extracts|info|revisions");
  url.searchParams.set("pithumbsize", "600");
  url.searchParams.set("exintro", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("format", "json");

  const payload = await json(url);
  pages.push(...Object.values(payload.query?.pages ?? {}));
  await delay(100);
}

pages.sort((a, b) => a.title.localeCompare(b.title));
await writeFile("tmp-fandom-wwe-dvd-releases.json", JSON.stringify(pages, null, 2));
console.log(`Wrote ${pages.length} Fandom WWE DVD release pages.`);

async function json(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Tobytube metadata prototype" } });
  if (!response.ok) throw new Error(`Fandom API failed: ${response.status}`);
  return response.json();
}

function chunks(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
