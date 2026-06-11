export type MacArch = "arm64" | "x64";
export type DownloadRegion = "cn" | "global";

const GITHUB_REPO = "ginuim/Sheaf";
const RELEASE_VERSION = "0.1.0";

const DMG_NAMES: Record<MacArch, string> = {
  arm64: "Sheaf-macos-arm64.dmg",
  x64: "Sheaf-macos-x64.dmg",
};

// TODO: CDN 上线后取消注释，并填入 OSS/CDN 根地址（末尾不要加斜杠）
// const OSS_CDN_BASE = "https://sheaf-download.reaidea.com";
//
// function ossAssetUrl(arch: MacArch): string {
//   return `${OSS_CDN_BASE}/${DMG_NAMES[arch]}`;
// }

function githubAssetUrl(arch: MacArch): string {
  const file = DMG_NAMES[arch];
  return `https://github.com/${GITHUB_REPO}/releases/download/v${RELEASE_VERSION}/${file}`;
}

export function getDownloadUrl(_region: DownloadRegion, arch: MacArch): string {
  // TODO: CDN 上线后改为：国内 IP 走 OSS，其余（含 VPN 出海）走 GitHub
  // return region === "cn" ? ossAssetUrl(arch) : githubAssetUrl(arch);
  return githubAssetUrl(arch);
}

export function detectMacArch(): MacArch {
  const ua = navigator.userAgent;
  if (/Intel Mac OS X/.test(ua) || navigator.platform === "MacIntel") {
    return "x64";
  }
  return "arm64";
}
