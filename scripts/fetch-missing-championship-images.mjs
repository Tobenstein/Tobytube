import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  { title: "NWF Heavyweight Championship", file: "nwf-heavyweight-championship.png" },
];

for (const target of targets) {
  const api = new URL("https://en.wikipedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("format", "json");
  api.searchParams.set("prop", "pageimages");
  api.searchParams.set("piprop", "original|thumbnail");
  api.searchParams.set("pithumbsize", "1200");
  api.searchParams.set("titles", target.title);
  const response = await fetch(api, { headers: { "user-agent": "Tobytube personal metadata importer (local prototype)" } });
  if (!response.ok) throw new Error(`${target.title}: Wikipedia API returned ${response.status}`);
  const page = Object.values((await response.json()).query?.pages ?? {})[0];
  const imageUrl = page?.original?.source ?? page?.thumbnail?.source;
  if (!imageUrl) throw new Error(`${target.title}: no page image was available`);
  const imageResponse = await fetch(imageUrl, { headers: { "user-agent": "Tobytube personal metadata importer (local prototype)" } });
  if (!imageResponse.ok) throw new Error(`${target.title}: image returned ${imageResponse.status}`);
  const output = path.join(root, "assets", "championships", target.file);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(await imageResponse.arrayBuffer()));
  console.log(`${target.title}: ${output}`);
}
