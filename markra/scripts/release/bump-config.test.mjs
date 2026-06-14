import assert from "node:assert/strict";
import test from "node:test";

import config, { bumppFilePaths, updateCargoPackageVersion } from "../../bump.config.mjs";

test("bumpp only updates package manifests directly", () => {
  assert.deepEqual(bumppFilePaths, ["package.json", "apps/desktop/package.json"]);
  assert.deepEqual(config.files, bumppFilePaths);
  assert.equal(bumppFilePaths.includes("apps/desktop/src-tauri/Cargo.toml"), false);
});

test("cargo version sync updates only the package version", () => {
  const cargoManifest = `[package]
name = "markra"
version = "0.3.0"

[dependencies]
dispatch2 = "0.3.0"
objc2-app-kit = { version = "0.3.0", default-features = false }

[target.'cfg(target_os = "macos")'.dependencies]
objc2-foundation = { version = "0.3.0", default-features = false }
`;

  assert.equal(
    updateCargoPackageVersion(cargoManifest, "0.4.0"),
    `[package]
name = "markra"
version = "0.4.0"

[dependencies]
dispatch2 = "0.3.0"
objc2-app-kit = { version = "0.3.0", default-features = false }

[target.'cfg(target_os = "macos")'.dependencies]
objc2-foundation = { version = "0.3.0", default-features = false }
`,
  );
});
