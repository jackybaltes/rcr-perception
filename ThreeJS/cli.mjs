import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedAssetRoots = new Set(["Assets", "ThreeJS"]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".stl", "model/stl"],
]);

function usage() {
  return `Usage: node cli.mjs [options]

Options:
  --seed <integer>       Seed from 0 to 4294967295; 0 chooses a new seed per request (default: 0)
  --volumes <integer>    Number of volumes from 0 to 50 (default: 3)
  --holds <integer>      Number of holds from 0 to 50 (default: 10)
  --camera-height <m>    Stereo camera height; must be non-negative (default: 1.25)
  --camera-distance <m>  Stereo camera distance from the wall; must be positive (default: 0.75)
  --requests <integer>   Number of walls to generate (default: 1)
  --prefix <path>        Output filename prefix (default: wall_)
  --help                 Show this help

Nonzero seeds advance by one for each request. Files are written as
<prefix><number>.png and <prefix><number>.json.
`;
}

function parseInteger(value, name) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative whole number.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${name} is too large.`);
  }
  return number;
}

function parseFiniteNumber(value, name) {
  if (value.trim() === "") throw new Error(`${name} must be a number.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number.`);
  return number;
}

function parseArguments(args) {
  const options = {
    seed: 0,
    volumes: 3,
    holds: 10,
    cameraHeight: 1.25,
    cameraDistance: 0.75,
    requests: 1,
    prefix: "wall_",
  };
  const names = new Map([
    ["--seed", "seed"],
    ["--volumes", "volumes"],
    ["--holds", "holds"],
    ["--camera-height", "cameraHeight"],
    ["--camera-distance", "cameraDistance"],
    ["--requests", "requests"],
    ["--prefix", "prefix"],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--help" || flag === "-h") return { help: true };

    const name = names.get(flag);
    if (!name) throw new Error(`Unknown option: ${flag}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}.`);
    }
    index += 1;
    if (name === "prefix") {
      options[name] = value;
    } else if (name === "cameraHeight" || name === "cameraDistance") {
      options[name] = parseFiniteNumber(value, flag);
    } else {
      options[name] = parseInteger(value, flag);
    }
  }

  if (options.seed > 0xffffffff) {
    throw new Error("--seed must be between 0 and 4294967295.");
  }
  for (const name of ["volumes", "holds"]) {
    if (options[name] > 50) throw new Error(`--${name} must be between 0 and 50.`);
  }
  if (options.cameraHeight < 0) throw new Error("--camera-height must be non-negative.");
  if (options.cameraDistance <= 0) throw new Error("--camera-distance must be greater than zero.");
  if (options.requests < 1) throw new Error("--requests must be at least 1.");
  if (!options.prefix.trim()) throw new Error("--prefix must not be empty.");
  return options;
}

function createStaticServer() {
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }

    let requestedPath;
    try {
      requestedPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
        .replace(/^\/+/, "");
    } catch {
      response.writeHead(400).end("Invalid request path.");
      return;
    }
    if (!requestedPath) requestedPath = "ThreeJS/index.html";

    const normalizedPath = path.normalize(requestedPath);
    const assetRoot = normalizedPath.split(path.sep)[0];
    const filePath = path.resolve(projectRoot, normalizedPath);
    const relativePath = path.relative(projectRoot, filePath);
    if (
      !allowedAssetRoots.has(assetRoot)
      || relativePath === ".."
      || relativePath.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativePath)
    ) {
      response.writeHead(404).end("Not found.");
      return;
    }

    let resolvedPath = filePath;
    if (path.extname(resolvedPath) === "") {
      resolvedPath = path.join(resolvedPath, "index.html");
    }
    const contentType = contentTypes.get(path.extname(resolvedPath).toLowerCase());
    if (!contentType) {
      response.writeHead(404).end("Not found.");
      return;
    }
    try {
      if (!(await stat(resolvedPath)).isFile()) {
        response.writeHead(404).end("Not found.");
        return;
      }
    } catch {
      response.writeHead(404).end("Not found.");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = createReadStream(resolvedPath);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  });
}

function seedForRequest(baseSeed, requestIndex) {
  if (baseSeed === 0) return 0;
  return ((baseSeed - 1 + requestIndex) % 0xffffffff) + 1;
}

async function run() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(`\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }

  const outputPrefix = path.resolve(process.cwd(), options.prefix);
  await mkdir(path.dirname(outputPrefix), { recursive: true });

  const server = createStaticServer();
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
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
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (error) => console.error(`Browser error: ${error.message}`));
    await page.goto(`http://127.0.0.1:${port}/ThreeJS/`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.addStyleTag({ content: "#stereo-scene { height: 320px !important; }" });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForFunction(
      () => window.RCRWallAPI?.isReady(),
      undefined,
      { timeout: 120_000 },
    );

    const digits = Math.max(4, String(options.requests).length);
    for (let index = 0; index < options.requests; index += 1) {
      const result = await page.evaluate(
        ({ seed, volumeCount, holdCount, cameraHeight, cameraDistance }) => (
          window.RCRWallAPI.generateRandomWall({
            seed,
            volumeCount,
            holdCount,
            cameraHeight,
            cameraDistance,
          })
        ),
        {
          seed: seedForRequest(options.seed, index),
          volumeCount: options.volumes,
          holdCount: options.holds,
          cameraHeight: options.cameraHeight,
          cameraDistance: options.cameraDistance,
        },
      );
      const sequence = String(index + 1).padStart(digits, "0");
      const imagePath = `${outputPrefix}${sequence}.png`;
      const jsonPath = `${outputPrefix}${sequence}.json`;
      const dataUrlMatch = /^data:image\/png;base64,([A-Za-z0-9+/]+=*)$/.exec(
        result.stereoPngDataUrl,
      );
      if (!dataUrlMatch) throw new Error("The Three.js API returned an invalid PNG.");

      await Promise.all([
        writeFile(imagePath, Buffer.from(dataUrlMatch[1], "base64")),
        writeFile(jsonPath, result.sceneJson, "utf8"),
      ]);
      console.log(`Generated seed ${result.seed}: ${imagePath} and ${jsonPath}`);
    }
  } finally {
    if (browser) await browser.close();
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

run().catch((error) => {
  console.error(`Generation failed: ${error.message}`);
  process.exitCode = 1;
});
