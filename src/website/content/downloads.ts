export type MacArch = "arm64" | "x64";
export type Platform = "macos" | "windows" | "linux";
export type DownloadRegion = "cn" | "global";
export type DownloadVariantId =
  | "macos-arm64"
  | "macos-x64"
  | "windows-x64"
  | "linux-x64";

import { GITHUB_REPO } from "./repo";

const MAC_DMG_NAMES: Record<MacArch, string> = {
  arm64: "Sheaf-macos-arm64.dmg",
  x64: "Sheaf-macos-x64.dmg",
};

export interface DownloadVariant {
  id: DownloadVariantId;
  platform: Platform;
  available: boolean;
}

export interface DownloadPlatformGroup {
  platform: Platform;
  available: boolean;
  variants: DownloadVariant[];
}

export const DOWNLOAD_PLATFORMS: DownloadPlatformGroup[] = [
  {
    platform: "macos",
    available: true,
    variants: [
      { id: "macos-arm64", platform: "macos", available: true },
      { id: "macos-x64", platform: "macos", available: true },
    ],
  },
  {
    platform: "windows",
    available: false,
    variants: [{ id: "windows-x64", platform: "windows", available: false }],
  },
  {
    platform: "linux",
    available: false,
    variants: [{ id: "linux-x64", platform: "linux", available: false }],
  },
];

// TODO: CDN 上线后取消注释，并填入 OSS/CDN 根地址（末尾不要加斜杠）
// const OSS_CDN_BASE = "https://sheaf-download.reaidea.com";
//
// function ossAssetUrl(arch: MacArch): string {
//   return `${OSS_CDN_BASE}/${MAC_DMG_NAMES[arch]}`;
// }

function githubMacAssetUrl(arch: MacArch): string {
  const file = MAC_DMG_NAMES[arch];
  return `https://github.com/${GITHUB_REPO}/releases/latest/download/${file}`;
}

export function getDownloadUrl(
  _region: DownloadRegion,
  variantId: DownloadVariantId,
): string {
  if (variantId === "macos-arm64") {
    // TODO: CDN 上线后改为：国内 IP 走 OSS，其余走 GitHub
    return githubMacAssetUrl("arm64");
  }
  if (variantId === "macos-x64") {
    return githubMacAssetUrl("x64");
  }
  return "";
}

export function getMacDownloadUrl(region: DownloadRegion, arch: MacArch): string {
  return getDownloadUrl(region, `macos-${arch}`);
}

export function detectMacArch(): MacArch {
  const ua = navigator.userAgent;
  if (/Intel Mac OS X/.test(ua) || navigator.platform === "MacIntel") {
    return "x64";
  }
  return "arm64";
}

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "macos";
}

export function recommendedVariantId(): DownloadVariantId | null {
  const platform = detectPlatform();
  if (platform === "macos") {
    return `macos-${detectMacArch()}`;
  }
  const group = DOWNLOAD_PLATFORMS.find((item) => item.platform === platform);
  const variant = group?.variants.find((item) => item.available);
  return variant?.id ?? null;
}
