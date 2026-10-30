import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const appUrls = [
  "http://localhost:8080/Threejs/",
  "https://jackybaltes.github.io/rcr-perception/ThreeJS/",
];

function usage() {
  return `Usage: node cli.mjs [options]

Options:
  --seed <integer>       Seed from 0 to 4294967295; 0 chooses a new seed per request (default: 0)
  --volumes <integer>    Number of volumes from 0 to 10 (default: 3)
  --holds <integer>      Number of holds from 0 to 50 (default: 10)
  --wall-width <m>       Wall width in meters (default: 0.8)
  --wall-height <m>      Wall height in meters (default: 1.4)
  --camera-height <m>    Stereo camera height; must be non-negative (default: 0.7)
  --camera-distance <m>  Stereo camera distance from the wall; must be positive (default: 1)
  --camera-view <h>,<d>  Add a camera view (height, distance in meters); repeat for multiple views
  --requests <integer>   Number of walls to generate (default: 1)
  --prefix <path>        Output filename prefix (default: wall_)
  --help                 Show this help

Nonzero seeds advance by one for each request. Files are written as
<prefix>cam<camera-index>_<number>.png and <prefix><number>.json.
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

function parseCameraView(value) {
  const parts = value.split(",");
  if (parts.length !== 2) {
    throw new Error("--camera-view must be specified as <height>,<distance>.");
  }
  const [height, distance] = parts.map((part, index) => (
    parseFiniteNumber(part, `--camera-view ${index === 0 ? "height" : "distance"}`)
  ));
  if (height < 0) throw new Error("Camera view height must be non-negative.");
  if (distance <= 0) throw new Error("Camera view distance must be greater than zero.");
  return { height, distance };
}

function parseArguments(args) {
  const options = {
    seed: 0,
    volumes: 3,
    holds: 10,
    wallWidth: 0.8,
    wallHeight: 1.4,
    cameraHeight: 0.7,
    cameraDistance: 1,
    cameraViews: [],
    requests: 1,
    prefix: "wall_",
  };
  let hasLegacyCameraOption = false;
  const names = new Map([
    ["--seed", "seed"],
    ["--volumes", "volumes"],
    ["--holds", "holds"],
    ["--wall-width", "wallWidth"],
    ["--wall-height", "wallHeight"],
    ["--camera-height", "cameraHeight"],
    ["--camera-distance", "cameraDistance"],
    ["--camera-view", "cameraView"],
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
    if (name === "cameraView") {
      options.cameraViews.push(parseCameraView(value));
    } else if (name === "prefix") {
      options[name] = value;
    } else if (name === "wallWidth" || name === "wallHeight") {
      options[name] = parseFiniteNumber(value, flag);
    } else if (name === "cameraHeight" || name === "cameraDistance") {
      hasLegacyCameraOption = true;
      options[name] = parseFiniteNumber(value, flag);
    } else {
      options[name] = parseInteger(value, flag);
    }
  }

  if (options.seed > 0xffffffff) {
    throw new Error("--seed must be between 0 and 4294967295.");
  }
  if (options.volumes > 10) throw new Error("--volumes must be between 0 and 10.");
  if (options.holds > 50) throw new Error("--holds must be between 0 and 50.");
  if (options.wallWidth <= 0) throw new Error("--wall-width must be greater than zero.");
  if (options.wallHeight <= 0) throw new Error("--wall-height must be greater than zero.");
  if (options.cameraHeight < 0) throw new Error("--camera-height must be non-negative.");
  if (options.cameraDistance <= 0) throw new Error("--camera-distance must be greater than zero.");
  if (options.cameraViews.length && hasLegacyCameraOption) {
    throw new Error("Use --camera-view or --camera-height/--camera-distance, not both.");
  }
  if (!options.cameraViews.length) {
    options.cameraViews.push({
      height: options.cameraHeight,
      distance: options.cameraDistance,
    });
  }
  if (options.requests < 1) throw new Error("--requests must be at least 1.");
  if (!options.prefix.trim()) throw new Error("--prefix must not be empty.");
  return options;
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
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (error) => console.error(`Browser error: ${error.message}`));
    let appReady = false;
    for (const appUrl of appUrls) {
      try {
        await page.goto(appUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        await page.waitForFunction(
          () => window.RCRWallAPI?.isReady(),
          undefined,
          { timeout: 60_000 },
        );
        console.log(`Using app at ${appUrl}`);
        appReady = true;
        break;
      } catch (error) {
        console.warn(`Could not use ${appUrl}: ${error.message}`);
      }
    }
    if (!appReady) {
      throw new Error("Could not load the climbing wall app from localhost or GitHub Pages.");
    }

    await page.addStyleTag({ content: "#stereo-scene { height: 320px !important; }" });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));

    const digits = Math.max(4, String(options.requests).length);
    for (let index = 0; index < options.requests; index += 1) {
      const result = await page.evaluate(
        ({ seed, volumeCount, holdCount, cameraViews, wallWidth, wallHeight }) => (
          window.RCRWallAPI.generateRandomWall({
            seed,
            volumeCount,
            holdCount,
            cameraViews,
            wallWidth,
            wallHeight,
          })
        ),
        {
          seed: seedForRequest(options.seed, index),
          volumeCount: options.volumes,
          holdCount: options.holds,
          cameraViews: options.cameraViews,
          wallWidth: options.wallWidth,
          wallHeight: options.wallHeight,
        },
      );
      const sequence = String(index + 1).padStart(digits, "0");
      const jsonPath = `${outputPrefix}${sequence}.json`;
      if (result.stereoPngDataUrls.length !== options.cameraViews.length) {
        throw new Error("The Three.js API returned an unexpected number of camera views.");
      }

      const imagePaths = result.stereoPngDataUrls.map((dataUrl, cameraIndex) => {
        const dataUrlMatch = /^data:image\/png;base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
        if (!dataUrlMatch) {
          throw new Error(`The Three.js API returned an invalid PNG for camera ${cameraIndex + 1}.`);
        }
        return {
          path: `${outputPrefix}cam${cameraIndex + 1}_${sequence}.png`,
          contents: Buffer.from(dataUrlMatch[1], "base64"),
        };
      });

      await Promise.all([
        ...imagePaths.map(({ path: imagePath, contents }) => writeFile(imagePath, contents)),
        writeFile(jsonPath, result.sceneJson, "utf8"),
      ]);
      console.log(
        `Generated seed ${result.seed}: ${imagePaths.map(({ path: image }) => image).join(", ")} and ${jsonPath}`,
      );
    }
  } finally {
    if (browser) await browser.close();
  }
}

run().catch((error) => {
  console.error(`Generation failed: ${error.message}`);
  process.exitCode = 1;
});
