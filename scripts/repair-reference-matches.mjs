import fs from "node:fs";

const file = "src/wrestling-reference.generated.json";
const output = "src/wrestling-reference.generated.json.repaired";
const txt = fs.readFileSync(file, "utf8");
const startKey = '  "matches": [';
const start = txt.indexOf(startKey);
const end = txt.indexOf('\n  "championships":', start);

if (start < 0 || end < 0) throw new Error("Could not locate matches array boundaries.");

const arrayStart = txt.indexOf("[", start);
const body = txt.slice(arrayStart + 1, end - 4);
const writer = fs.createWriteStream(output, "utf8");

writer.write(txt.slice(0, arrayStart + 1));
writer.write("\n");

let depth = 0;
let inString = false;
let escape = false;
let objectStart = -1;
let written = 0;
let failed = 0;
let first = true;

for (let index = 0; index < body.length; index += 1) {
  const char = body[index];
  if (inString) {
    if (escape) escape = false;
    else if (char === "\\") escape = true;
    else if (char === '"') inString = false;
    continue;
  }
  if (char === '"') {
    inString = true;
    continue;
  }
  if (char === "{") {
    if (depth === 0) objectStart = index;
    depth += 1;
    continue;
  }
  if (char === "}") {
    depth -= 1;
    if (depth === 0 && objectStart >= 0) {
      const raw = body.slice(objectStart, index + 1);
      try {
        const parsed = JSON.parse(raw);
        if (!first) writer.write(",\n");
        writer.write(`    ${JSON.stringify(parsed, null, 2).replace(/\n/g, "\n    ")}`);
        first = false;
        written += 1;
      } catch {
        failed += 1;
      }
      objectStart = -1;
    }
  }
}

writer.write("\n  ],");
writer.write(txt.slice(end));
await new Promise((resolve) => writer.end(resolve));

JSON.parse(fs.readFileSync(output, "utf8"));
fs.copyFileSync(output, file);
fs.unlinkSync(output);

console.log(JSON.stringify({ written, failed }, null, 2));
