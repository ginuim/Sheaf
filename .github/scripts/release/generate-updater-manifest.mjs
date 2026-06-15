import fs from "node:fs";
import path from "node:path";

const assetsRoot = process.env.RELEASE_ASSETS_ROOT ?? "release-assets";
const repository = process.env.GITHUB_REPOSITORY ?? "ginuim/Sheaf";
const releaseTag = process.env.RELEASE_TAG ?? "";
const notesPath = process.env.RELEASE_NOTES_PATH ?? "release-notes.md";
const outputPath = process.env.OUTPUT_PATH ?? "release/latest.json";

if (!releaseTag) {
  throw new Error("RELEASE_TAG is required.");
}

function walkMetadataFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMetadataFiles(fullPath, results);
      continue;
    }

    if (entry.name === "release-metadata.json") {
      results.push(fullPath);
    }
  }

  return results;
}

const metadataFiles = walkMetadataFiles(assetsRoot);
if (metadataFiles.length === 0) {
  throw new Error(`No release-metadata.json files found under ${assetsRoot}`);
}

const platforms = {};
for (const metadataPath of metadataFiles) {
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  if (!metadata.platform || !metadata.filename || !metadata.signature) {
    throw new Error(`Invalid updater metadata: ${metadataPath}`);
  }

  platforms[metadata.platform] = {
    signature: metadata.signature,
    url: `https://github.com/${repository}/releases/download/${releaseTag}/${metadata.filename}`,
  };
}

const notes = fs.existsSync(notesPath)
  ? fs.readFileSync(notesPath, "utf8").trim()
  : "";

const version = releaseTag.replace(/^v/, "");
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

const outputDir = path.dirname(outputPath);
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${outputPath} for ${Object.keys(platforms).join(", ")}`);
