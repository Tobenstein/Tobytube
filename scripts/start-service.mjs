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

launchDetachedServer();

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

function launchDetachedServer() {
  if (process.platform === "win32") {
    const logPath = path.join(root, `tobytube-service-${port}.log`);
    const command = [
      `$env:PORT = '${port}'`,
      `Set-Location -LiteralPath '${escapePowerShell(root)}'`,
      `Start-Process -FilePath '${escapePowerShell(process.execPath)}' -ArgumentList 'scripts\\tobytube-server.mjs' -WorkingDirectory '${escapePowerShell(root)}' -RedirectStandardOutput '${escapePowerShell(logPath)}' -RedirectStandardError '${escapePowerShell(path.join(root, `tobytube-service-${port}.err.log`))}' -WindowStyle Hidden`,
    ].join("; ");
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }

  const child = spawn(process.execPath, ["scripts/tobytube-server.mjs"], {
    cwd: root,
    detached: true,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  child.unref();
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}
