import { readFile, writeFile } from "node:fs/promises";

const events = JSON.parse(await readFile("tmp-shimmer-events.json", "utf8"));
let data = await readFile("src/data.js", "utf8");
const block = `const shimmerVolumeEvents = ${JSON.stringify(events, null, 2)};\n\n`;

if (data.includes("const shimmerVolumeEvents = ")) {
  data = data.replace(/const shimmerVolumeEvents = [\s\S]*?\n\nexport const years = /, `${block}export const years = `);
} else {
  data = data.replace("export const years = ", `${block}export const years = `);
}

await writeFile("src/data.js", data);
