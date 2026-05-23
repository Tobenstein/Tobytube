import { openSync } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 8092);
const url = `http://127.0.0.1:${port}/`;

if (await isListening(port)) {
  console.log(`Tobytube already running at ${url}`);
  process.exit(0);
}

const out = openSync(path.join(root, `tobytube-service-${port}.log`), "a");
const err = openSync(path.join(root, `tobytube-service-${port}.err.log`), "a");
const child = spawn(process.execPath, ["scripts/tobytube-server.mjs"], {
  cwd: root,
  detached: true,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", out, err],
  windowsHide: true,
});
child.unref();

for (let attempt = 0; attempt < 20; attempt += 1) {
  await delay(250);
  if (await isListening(port)) {
    console.log(`Tobytube started at ${url}`);
    process.exit(0);
  }
}

console.error(`Tobytube did not start within 5 seconds. Check tobytube-service-${port}.err.log.`);
process.exit(1);

async function isListening(candidatePort) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${candidatePort}/api/metadata/status`, (response) => {
      response.resume();
      resolve(true);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(750, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
