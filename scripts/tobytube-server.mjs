import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = await readConfig();
const port = Number(process.env.PORT ?? config.port ?? 8088);
const status = {
  state: "idle",
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  error: null,
  stats: null,
  mediaRoots: config.mediaRoots ?? [],
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/metadata/status") {
      sendJson(response, status);
      return;
    }

    if (url.pathname === "/api/metadata/rescan" && request.method === "POST") {
      if (status.state !== "scanning") runScan();
      sendJson(response, status);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.stack ?? String(error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Tobytube preview running at http://127.0.0.1:${port}/`);
  if (config.scanOnStartup !== false) runScan();
});

function runScan() {
  status.state = "scanning";
  status.startedAt = new Date().toISOString();
  status.finishedAt = null;
  status.exitCode = null;
  status.error = null;
  status.stats = null;
  status.mediaRoots = config.mediaRoots ?? [];

  const args = [path.join(root, "scripts", "metadata-pipeline.mjs")];
  for (const mediaRoot of config.mediaRoots ?? []) {
    args.push("--media-root", path.resolve(root, mediaRoot));
  }
  if (config.refreshProviders) args.push("--refresh-providers");

  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    process.stderr.write(chunk);
  });
  child.on("close", async (code) => {
    status.exitCode = code;
    status.finishedAt = new Date().toISOString();
    status.error = code === 0 ? null : stderr.trim() || `Metadata scan exited with ${code}`;

    try {
      const metadata = JSON.parse(
        await readFile(path.join(root, "src", "metadata.generated.json"), "utf8"),
      );
      status.stats = metadata.stats;
    } catch (error) {
      status.error = status.error ?? `Could not read generated metadata: ${error.message}`;
    }

    status.state = code === 0 ? "ready" : "error";
  });
}

async function serveStatic(urlPath, response) {
  const requestedPath = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[\\/])+/, "");
  const filePath = path.join(root, safePath);
  const fileStats = await stat(filePath).catch(() => null);

  if (!fileStats?.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": contentType(filePath) });
  createReadStream(filePath).pipe(response);
}

async function readConfig() {
  try {
    return JSON.parse(await readFile(path.join(root, "config", "tobytube.config.json"), "utf8"));
  } catch {
    return {};
  }
}

function sendJson(response, body) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body, null, 2));
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    }[extension] ?? "application/octet-stream"
  );
}
