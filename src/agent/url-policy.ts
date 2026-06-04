const blockedHostSuffixes = [".localhost", ".local"];

export function assertPublicHttpUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("URL 不能为空");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("无效 URL");
  }

  const scheme = url.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") {
    throw new Error("仅允许 http 或 https");
  }
  if (url.username || url.password) {
    throw new Error("URL 不能包含用户名或密码");
  }

  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    blockedHostSuffixes.some((suffix) => host.endsWith(suffix))
  ) {
    throw new Error("不允许访问本地地址");
  }

  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    throw new Error("不允许访问内网地址");
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("不允许访问内网地址");
  }
  if (host.startsWith("fe80:") || host === "::1" || host.startsWith("fc") || host.startsWith("fd")) {
    throw new Error("不允许访问内网地址");
  }

  return url;
}

export function isDuckDuckGoSearchUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === "duckduckgo.com" ||
    host.endsWith(".duckduckgo.com") ||
    host === "api.duckduckgo.com"
  );
}
