import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function resolveMediaBinary(kind, { configuredPath = null, root = process.cwd() } = {}) {
  const executable = process.platform === "win32" ? `${kind}.exe` : kind;
  const candidates = [configuredPath].filter(Boolean);

  for (const directory of String(process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(directory, executable));
  }

  if (process.platform === "win32") {
    candidates.push(`C:\\Program Files\\Jellyfin\\Server\\${executable}`);
    candidates.push(path.join(root, "node_modules", packageFolderFor(kind), "win32-x64", executable));
  }

  const store = path.join(root, "node_modules", ".pnpm");
  const packagePrefix = kind === "ffmpeg" ? "@ffmpeg-installer+win32-x64@" : "@ffprobe-installer+win32-x64@";
  const packageFolder = kind === "ffmpeg" ? "@ffmpeg-installer" : "@ffprobe-installer";
  const storeEntries = await readdir(store, { withFileTypes: true }).catch(() => []);
  const bundled = storeEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(packagePrefix))
    .sort((a, b) => b.name.localeCompare(a.name))[0];
  if (bundled) {
    candidates.push(path.join(store, bundled.name, "node_modules", packageFolder, "win32-x64", executable));
  }

  for (const candidate of candidates) {
    if ((await stat(candidate).catch(() => null))?.isFile()) return candidate;
  }
  return configuredPath || executable;
}

function packageFolderFor(kind) {
  return kind === "ffmpeg" ? "@ffmpeg-installer" : "@ffprobe-installer";
}
