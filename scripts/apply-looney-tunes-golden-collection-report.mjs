import { copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const reportPath = path.resolve("config/looney-tunes-golden-collection-report.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
if (report.expectedCartoons !== 356 || report.matchedCartoons !== 356 || report.missingDiscEntries?.length) {
  throw new Error("Refusing to apply an incomplete Looney Tunes organization report");
}
for (const move of report.moves) {
  move.destination = move.destination.replace(/(\d{4}-\d{2})-00(?=\s+-)/, "$1");
  if (!(await stat(move.source).catch(() => null))?.isFile()) throw new Error(`Source file is missing: ${move.source}`);
  if (await stat(move.destination).catch(() => null)) throw new Error(`Refusing to overwrite: ${move.destination}`);
}
for (const move of report.moves) {
  await mkdir(path.dirname(move.destination), { recursive: true });
  const sourceStats = await stat(move.source);
  await copyFile(move.source, move.destination);
  const destinationStats = await stat(move.destination);
  if (destinationStats.size !== sourceStats.size) throw new Error(`Copied file failed size verification: ${move.destination}`);
  await unlink(move.source);
}
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Moved ${report.matchedCartoons} cartoons and ${report.extras} extras to ${report.destinationRoot}`);
