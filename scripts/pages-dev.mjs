import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  dirname,
  extname,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

import { syncPagesReadme } from "./sync-pages-readme.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const pagesDir = resolve(repoRoot, "pages");
const readmePath = resolve(repoRoot, "README.md");
const defaultPort = 3000;
const devEventsPath = "/__dev/events";
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

const devClients = new Set();
let pendingReadmeSyncTimer;
let pendingPageReloadTimer;
let isShuttingDown = false;

await syncPagesReadme();

const server = createServer((request, response) => {
  if (request.url === devEventsPath) {
    handleDevEvents(response);
    return;
  }

  void serveStaticFile(request, response);
});

server.on("error", (error) => {
  console.error("Pages dev server crashed.", error);
  closeDevLoop();
  process.exit(1);
});

const readmeWatcher = watch(readmePath, { persistent: true }, () => {
  scheduleReadmeSync();
});

const pagesWatcher = watch(pagesDir, { persistent: true }, (_eventType, file) => {
  const fileName = typeof file === "string" ? file : "";

  if (fileName === "README.md") {
    return;
  }

  schedulePageReload(fileName);
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(defaultPort, () => {
    server.off("error", rejectListen);
    resolveListen();
  });
});

console.log(`Pages dev server ready at http://localhost:${defaultPort}`);
console.log("Watching README.md and pages/ for changes.");

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

function handleDevEvents(response) {
  response.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
  });
  response.write("retry: 1000\n\n");

  devClients.add(response);

  response.on("close", () => {
    devClients.delete(response);
  });
}

async function serveStaticFile(request, response) {
  try {
    const requestPath = getSafeRequestPath(request.url || "/");
    const filePath = await resolveStaticFilePath(requestPath);
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      respondNotFound(response);
      return;
    }

    const fileContents = await readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(fileContents),
      "Content-Type": getContentType(filePath),
    });
    response.end(fileContents);
  } catch (error) {
    if (isMissingFileError(error)) {
      respondNotFound(response);
      return;
    }

    console.error("Unable to serve Pages preview file.", error);
    response.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Local Pages preview tripped over its shoelaces.");
  }
}

function getSafeRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");

  return normalizedPath === "/" ? "/index.html" : normalizedPath;
}

async function resolveStaticFilePath(requestPath) {
  const candidatePath = resolve(pagesDir, `.${requestPath}`);
  const relativePath = relative(pagesDir, candidatePath);

  if (relativePath.startsWith("..")) {
    throw new Error(`Refusing to serve path outside pages/: ${requestPath}`);
  }

  const fileStats = await stat(candidatePath);

  if (fileStats.isDirectory()) {
    return join(candidatePath, "index.html");
  }

  return candidatePath;
}

function getContentType(filePath) {
  return contentTypes[extname(filePath)] || "application/octet-stream";
}

function scheduleReadmeSync() {
  clearTimeout(pendingReadmeSyncTimer);
  pendingReadmeSyncTimer = setTimeout(() => {
    void syncReadmeForPreview();
  }, 100);
}

function schedulePageReload(fileName) {
  clearTimeout(pendingPageReloadTimer);
  pendingPageReloadTimer = setTimeout(() => {
    broadcastDevEvent("page-reload", {
      path: fileName || "pages",
    });
  }, 60);
}

async function syncReadmeForPreview() {
  try {
    await syncPagesReadme();
    broadcastDevEvent("readme-updated", {
      path: "README.md",
    });
  } catch (error) {
    console.error("Unable to sync README.md into pages/.", error);
  }
}

function broadcastDevEvent(eventName, payload) {
  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of devClients) {
    client.write(message);
  }
}

function handleShutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  closeDevLoop();
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 500).unref();

  if (signal === "SIGINT") {
    console.log("\nPages dev server stopped.");
  }
}

function closeDevLoop() {
  clearTimeout(pendingReadmeSyncTimer);
  clearTimeout(pendingPageReloadTimer);
  readmeWatcher.close();
  pagesWatcher.close();

  for (const client of devClients) {
    client.end();
  }

  devClients.clear();
}

function respondNotFound(response) {
  response.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end("File not found.");
}

function isMissingFileError(error) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
