import { readFile, writeFile } from "node:fs/promises";

const source = await readFile("tmp-shimmer-volumes.wiki", "utf8");

const events = [...source.matchAll(/==\s*((?:Volume\s+\d+[^=]*)|Shimmer at The Collective)\s*==([\s\S]*?)(?=\n==\s*(?:Volume\s+\d+|Shimmer at The Collective|See also)|$)/g)]
  .map(([, heading, body]) => {
    const number = heading.match(/Volume\s+(\d+)/)?.[1] ?? (heading === "Shimmer at The Collective" ? "118" : null);
    const date = toIso(clean(field(body, "date")));
    if (!number || !date) return null;
    const attendance = clean(field(body, "attendance"));

    return {
      id: `shimmer-volume-${number}`,
      title: number === "118" ? "Shimmer at The Collective" : `Volume ${number}`,
      date,
      year: Number(date.slice(0, 4)),
      type: "special",
      posterCode: `V${number}`,
      eventLabel: "Volume",
      venue: clean(field(body, "venue")),
      location: clean(field(body, "city")),
      attendance: /^\d[\d,]*$/.test(attendance) ? attendance : null,
      matchCount: [...body.matchAll(/\|match\d+\s*=/g)].length,
    };
  })
  .filter(Boolean);

await writeFile("tmp-shimmer-events.json", JSON.stringify(events, null, 2));
console.log(`Wrote ${events.length} Shimmer volume events.`);

function field(body, name) {
  return body.match(new RegExp(`\\|${name}\\s*=\\s*([^\\n]+)`))?.[1] ?? "";
}

function clean(value = "") {
  return value
    .replace(/<ref[^>]*>.*?<\/ref>/gs, "")
    .replace(/<ref[^/]*\/>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[([^\]|\n]+)\|([^\]\n]+)\]\]/g, "$2")
    .replace(/\[\[([^\]\n]+)\]\]/g, "$1")
    .replace(/'''/g, "")
    .replace(/&amp;/g, "&")
    .trim();
}

function toIso(value) {
  const date = new Date(`${value} UTC`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
