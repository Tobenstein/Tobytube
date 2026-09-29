import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.replace(/^--/, "").split("="); return [key, value]; }));
const promotion = String(args.promotion ?? "all").toLowerCase();
const year = Number(args.year ?? new Date().getFullYear());
const validateOnly = args["validate-only"] === "true";
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const backupDir = path.join(root, "cache", "twdb-refresh-backups");
const statusPath = path.join(root, "cache", "twdb-refresh-status.json");
await fs.mkdir(backupDir, { recursive: true });
const beforeText = await fs.readFile(referencePath, "utf8");
const before = JSON.parse(beforeText);
const backupPath = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(backupPath, beforeText);

const commands = [];
if (!validateOnly) {
  const bundledPython = path.join(process.env.USERPROFILE ?? "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
  const python = process.env.TWDB_PYTHON || (fsSync.existsSync(bundledPython) ? bundledPython : "python");
  if (["all", "wwe"].includes(promotion)) commands.push([python, ["scripts/import-wwe-sdh-results.py", "--refresh"]]);
  if (["all", "aew"].includes(promotion)) commands.push([python, ["scripts/import-aew-sdh-results.py", "--refresh"]]);
  if (["all", "tna"].includes(promotion)) commands.push([python, ["scripts/import-tna-sdh-results.py", "--refresh"]]);
  commands.push([process.execPath, ["scripts/sanitize-wrestling-match-text.mjs"]]);
}

try {
  for (const [command, commandArgs] of commands) await run(command, commandArgs);
  await run(process.execPath, ["scripts/validate-twdb-refresh.mjs", `--promotion=${promotion}`, `--year=${year}`]);
  if (!validateOnly) {
    await run(process.execPath, ["scripts/split-wrestling-reference.mjs"]);
    await run(process.execPath, ["scripts/generate-wrestling-library.mjs"]);
  }
  const after = JSON.parse(await fs.readFile(referencePath, "utf8"));
  const summary = summarize(before, after);
  await fs.writeFile(statusPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (!validateOnly) await fs.writeFile(referencePath, beforeText);
  const failure = { ok: false, promotion, year, failedAt: new Date().toISOString(), error: error.message, rolledBack: !validateOnly, backupPath };
  await fs.writeFile(statusPath, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: root, env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${commandArgs[0]} failed (${code}): ${output.slice(-1000)}`)));
  });
}

function summarize(beforeDb, afterDb) {
  const count = (db, key) => (db[key] ?? []).filter((item) => (promotion === "all" || item.promotionId === promotion) && (!year || String(item.date ?? "").startsWith(String(year)))).length;
  return { ok: true, promotion, year, validateOnly, finishedAt: new Date().toISOString(), before: { events: count(beforeDb, "events"), episodes: count(beforeDb, "episodes"), matches: count(beforeDb, "matches") }, after: { events: count(afterDb, "events"), episodes: count(afterDb, "episodes"), matches: count(afterDb, "matches") }, backupPath };
}
