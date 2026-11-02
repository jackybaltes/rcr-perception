import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".stl", "model/stl"],
]);

function createFileServer() {
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://localhost");
      const decodedPath = decodeURIComponent(requestUrl.pathname);
      let filePath = path.resolve(repositoryRoot, `.${decodedPath}`);
      const relativePath = path.relative(repositoryRoot, filePath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      if ((await stat(filePath)).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      const contents = await readFile(filePath);
      response.writeHead(200, {
        "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase())
          ?? "application/octet-stream",
      });
      response.end(contents);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Unable to read requested file");
    }
  });
}

async function run() {
  const [manifestPath] = process.argv.slice(2);
  if (!manifestPath) {
    throw new Error("Usage: node score.mjs <score-manifest.json>");
  }

  const tasks = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(tasks)) {
    throw new Error("The score manifest must contain an array of comparison tasks.");
  }

  const server = createFileServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--enable-webgl",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--use-gl=angle",
        "--use-angle=swiftshader",
      ],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const address = server.address();
    await page.goto(`http://127.0.0.1:${address.port}/ThreeJS/`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await page.waitForFunction(
      () => window.RCRWallAPI?.isReady(),
      undefined,
      { timeout: 60_000 },
    );

    const results = [];
    for (const task of tasks) {
      const [activeJson, testJson] = await Promise.all([
        readFile(task.referencePath, "utf8"),
        readFile(task.testPath, "utf8"),
      ]);
      const score = await page.evaluate(
        ({ reference, submission }) => (
          window.RCRWallAPI.scoreScenes(reference, submission)
        ),
        { reference: activeJson, submission: testJson },
      );
      if (!Number.isFinite(score)) {
        throw new Error(`The simulator returned an invalid score for ${task.testPath}.`);
      }
      results.push({ team: task.team, solution: task.solution, score });
    }

    process.stdout.write(`${JSON.stringify(results)}\n`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

run().catch((error) => {
  console.error(`Scoring failed: ${error.message}`);
  process.exitCode = 1;
});
