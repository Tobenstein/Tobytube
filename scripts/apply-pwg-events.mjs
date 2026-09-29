import { readFile, writeFile } from "node:fs/promises";

const events = JSON.parse(await readFile("tmp-pwg-tmdb-events.json", "utf8")).map((event) => ({
  ...event,
  summary: decodeHtml(event.summary),
}));
let data = await readFile("src/data.js", "utf8");
const block = `const pwgEvents = ${JSON.stringify(events, null, 2)};\n\n`;

if (data.includes("const pwgEvents = ")) {
  data = data.replace(/const pwgEvents = [\s\S]*?\n\nconst shimmerVolumeEvents = /, `${block}const shimmerVolumeEvents = `);
} else {
  data = data.replace("const shimmerVolumeEvents = ", `${block}const shimmerVolumeEvents = `);
}

await writeFile("src/data.js", data);
console.log(`Embedded ${events.length} PWG events.`);

function decodeHtml(value) {
  if (!value) return value;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}
