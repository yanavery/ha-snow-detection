import sharp from  "sharp";
import path from "path";
import fs from "fs/promises";
import DigestClient from "digest-fetch";

const VERSION = "0.0.5";

// Application configuration
const SNAPSHOT_LOGGING_ENABLED = process.env.SNAPSHOT_LOGGING_ENABLED === "true";
const DRY_RUN_SKIP_HA_UPDATE = process.env.DRY_RUN_SKIP_HA_UPDATE === "true";

// Local snapshot storage directory (for debugging and historical reference)
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR;

// Camera configuration
const SNAPSHOT_URL = process.env.SNAPSHOT_URL;
const SNAPSHOT_URL_USERNAME = process.env.SNAPSHOT_URL_USERNAME;
const SNAPSHOT_URL_PASSWORD = process.env.SNAPSHOT_URL_PASSWORD;

// Polygon points to observe for snow presence (order matters, clockwise from top-left corner)
const POLYGON_POINTS = JSON.parse(process.env.POLYGON_POINTS);

// Snow detection thresholds
const BRIGHTNESS_THRESHOLD = Number(process.env.BRIGHTNESS_THRESHOLD); // 0-255
const SNOW_RATIO_THRESHOLD = Number(process.env.SNOW_RATIO_THRESHOLD); // 0.12 = 12%

// Home Assistant configuration
const HA_URL = process.env.HA_URL;
const HA_TOKEN = process.env.HA_TOKEN;
const HA_ENTITY_ID = process.env.HA_ENTITY_ID;

// Frequency of snow check and HA refresh (in minutes)
const CHECK_INTERVAL_MINUTES = process.env.CHECK_INTERVAL_MINUTES;

/**
 * Build SVG polygon mask
 */
function buildMaskSVG(width, height) {
  const pointsStr = POLYGON_POINTS.map(p => `${p[0]},${p[1]}`).join(" ");
  return `
    <svg width="${width}" height="${height}">
      <polygon points="${pointsStr}" fill="white"/>
    </svg>
  `;
}

/**
 * Retrieve snapshot image from camera feed
 */
async function retrieveSnapshot() {
  console.log(`Fetching snapshot from '${SNAPSHOT_URL}'`);

  const client = new DigestClient(SNAPSHOT_URL_USERNAME, SNAPSHOT_URL_PASSWORD);

  try {
    const res = await client.fetch(SNAPSHOT_URL);

    if (!res.ok) {
      throw new Error(`Snapshot retrieval failed: ${res.status} ${res.statusText}`);
    }

    const snapshot = Buffer.from(await res.arrayBuffer());
    return sharp(snapshot);

  } catch (err) {
    console.error("Snapshot retrieval failed:", err.message);
    throw err;
  }
}

/**
 * Create snapshot folder
 */
async function createSnapshotFolder() {
  if (!SNAPSHOT_LOGGING_ENABLED) return;

  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  console.log(`Retrieved snapshots will be stored to '${SNAPSHOT_DIR}'`);
}

/**
 * Save image to disk using time stamped filename
 */
async function saveImage(img, type, timestamp) {
  if (!SNAPSHOT_LOGGING_ENABLED) return;

  const imagePath = path.join(SNAPSHOT_DIR, `${timestamp}-${type}.jpg`);

  console.log(`Saving ${type} image to '${imagePath}'`);

  const jpegBuffer = await img.jpeg().toBuffer();
  await fs.writeFile(imagePath, jpegBuffer);
}

/**
 * Create mask image from polygon points
 */
async function createMaskImage(width, height) {
  console.log(`Creating ${width}x${height} mask image from polygon points`);

  return sharp(Buffer.from(buildMaskSVG(width, height)))
    .resize(width, height)
    .grayscale();
}

async function calculateBrightnessData(imgGrey, imgMask, width, height) {
  console.log("Calculating brightness data");

  const grayBuffer = await imgGrey.raw().toBuffer();
  const maskBuffer = await imgMask.raw().toBuffer();

  if (grayBuffer.length !== maskBuffer.length) {
    throw new Error(
      `Buffer size mismatch in debug image: grayBuffer=${grayBuffer.length}, maskBuffer=${maskBuffer.length}`
    );
  }

  const outBuffer = Buffer.alloc(width * height * 3);

  let grandTotal = 0;
  let total = 0;
  let bright = 0;

  for (let i = 0; i < grayBuffer.length; i++) {
    grandTotal++;

    const gray = grayBuffer[i];
    const mask = maskBuffer[i];

    const outIndex = i * 3;

    // Only count pixels inside the mask
    if (mask > 0) {
      total++;

      if (gray >= BRIGHTNESS_THRESHOLD) {
        bright++;

        // paint red
        outBuffer[outIndex] = 255;
        outBuffer[outIndex + 1] = 0;
        outBuffer[outIndex + 2] = 0;
        continue;
      }
    }

    // default: grayscale pixel
    outBuffer[outIndex] = gray;
    outBuffer[outIndex + 1] = gray;
    outBuffer[outIndex + 2] = gray;
  }

  const imgBright = sharp(outBuffer, {
    raw: {
      width,
      height,
      channels: 3,
    },
  });

  return {
    imgBright,
    grandTotal,
    totalWithinMask: total,
    brightWithinMask: bright,
  };
}

/**
 * Create greyscale version of given image
 */
async function createGreyscaleImage(img) {
  console.log(`Creating greyscale image from snapshot`);

  return img.clone().grayscale();
}

/**
 * Update Home Assistant entity with snow detection result
 */
async function updateHA(snowDetected) {
  if (DRY_RUN_SKIP_HA_UPDATE) return;

  const url = `${HA_URL}/api/states/${HA_ENTITY_ID}`;

  console.log(`Updating HA @ '${url}' ===> ${snowDetected ? "on" : "off"}`);

  const payload = {
    state: snowDetected ? "on" : "off",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HA update failed: ${res.status} ${res.statusText} - ${text}`);
    }
  } catch (err) {
    console.error("HA update failed:", err.message);
    throw err;
  }
}

/**
 * Check for snow in the masked image and update Home Assistant with result
 */
async function checkSnow() {
  console.log("Snow detection begin");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  try {
    const imgSnaphot = await retrieveSnapshot();
    await saveImage(imgSnaphot.clone(), 'snapshot', timestamp);

    const metadata = await imgSnaphot.metadata();

    const imgGrey = await createGreyscaleImage(imgSnaphot);
    await saveImage(imgGrey.clone(), 'greyscale', timestamp);

    const imgMask = await createMaskImage(metadata.width, metadata.height);
    await saveImage(imgMask.clone(), 'mask', timestamp);

    const brightData = await calculateBrightnessData(
      imgGrey,
      imgMask,
      metadata.width,
      metadata.height
    );
    await saveImage(brightData.imgBright.clone(), "bright", timestamp);

    const ratio = brightData.totalWithinMask > 0 ? brightData.brightWithinMask / brightData.totalWithinMask : 0;
    const snowDetected = ratio >= SNOW_RATIO_THRESHOLD;

    console.log(`Pixel count total='${brightData.grandTotal}' totalWithinMask='${brightData.totalWithinMask}' brightWithinMask=${brightData.brightWithinMask} ratio='${ratio.toFixed(4)}'`);
    console.log(`Bright pixel threshold='${SNOW_RATIO_THRESHOLD}' ===> snowDetected = ${snowDetected}`);

    await updateHA(snowDetected);
  } catch (err) {
    console.error("checkSnow failed:", err.message);
  }

  console.log("Snow detection complete");
}

async function main() {
  console.log(`Snow Detection v${VERSION} starting ...`);
  console.log(`Snow presence will be checked every ${CHECK_INTERVAL_MINUTES} minute(s)`);
  console.log(`Brightness threshold: ${BRIGHTNESS_THRESHOLD}, Snow ratio threshold: ${SNOW_RATIO_THRESHOLD}`);
  console.log(`Polygon points: ${JSON.stringify(POLYGON_POINTS)}`);

  await createSnapshotFolder();
  await checkSnow();

  setInterval(checkSnow, CHECK_INTERVAL_MINUTES * 60 * 1000);
}

main();
