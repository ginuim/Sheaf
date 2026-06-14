import fs from "node:fs";
import path from "node:path";

const releaseDir = process.env.RELEASE_DIR;
const updaterPlatform = process.env.UPDATER_PLATFORM;
const artifactBase = process.env.ARTIFACT_BASE;
const releaseTag = process.env.RELEASE_TAG ?? "";

if (!releaseDir || !updaterPlatform || !artifactBase) {
  throw new Error("RELEASE_DIR, UPDATER_PLATFORM, and ARTIFACT_BASE are required.");
}

function resolveBundleName(platform, artifactBase) {
  if (platform.startsWith("darwin-")) {
    return `${artifactBase}.app.tar.gz`;
  }

  if (platform.startsWith("windows-")) {
    return `${artifactBase}-setup.exe`;
  }

  throw new Error(`Unsupported updater platform: ${platform}`);
}

const bundleName = resolveBundleName(updaterPlatform, artifactBase);
const bundlePath = path.join(releaseDir, bundleName);
const signaturePath = `${bundlePath}.sig`;

if (!fs.existsSync(bundlePath)) {
  throw new Error(`Updater bundle not found: ${bundlePath}`);
}

if (!fs.existsSync(signaturePath)) {
  throw new Error(`Updater signature not found: ${signaturePath}`);
}

const metadata = {
  filename: bundleName,
  platform: updaterPlatform,
  signature: fs.readFileSync(signaturePath, "utf8").trim(),
  version: releaseTag.replace(/^v/, ""),
};

fs.writeFileSync(
  path.join(releaseDir, "release-metadata.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
);

console.log(`Created updater metadata for ${updaterPlatform}: ${bundleName}`);
