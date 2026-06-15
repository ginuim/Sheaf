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
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (renderer && /Apple/i.test(renderer)) {
          return "arm64";
        }
      }
    }
  } catch (e) {
    // 忽略异常，降级到默认架构推荐
  }

  // 降级推荐：在 2026 年，Apple Silicon 已在 macOS 用户中占据绝对主导地位，
  // 原先基于 UA/platform 的检测逻辑在所有 Apple Silicon 设备上都会因为浏览器兼容性伪装
  // （即包含 "Intel Mac OS X" 和 "MacIntel"）而将其误判为 x64。
  // 因此在检测失效时，默认推荐 arm64 是体验更优的方案。
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
