import type {
  CosImageHostingSettings,
  ImageHostingPreferences,
  OssImageHostingSettings,
  QiniuImageHostingRegion,
  QiniuImageHostingSettings,
  S3ImageHostingSettings,
} from "./appPreferences";

export type HostedImage = {
  alt: string;
  src: string;
};

export type ImageUploadSource = {
  bytes: Uint8Array;
  extension: string;
  mimeType: string;
  sourceName: string;
};

const QINIU_UPLOAD_HOSTS: Record<QiniuImageHostingRegion, string> = {
  auto: "https://upload.qiniup.com",
  z0: "https://upload.qiniup.com",
  z1: "https://upload-z1.qiniup.com",
  z2: "https://upload-z2.qiniup.com",
  na0: "https://upload-na0.qiniup.com",
  as0: "https://upload-as0.qiniup.com",
};

function sanitizeImageBaseName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._\s-]+|[._\s-]+$/g, "");

  return normalized.slice(0, 80) || "image";
}

function base64UrlEncode(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

function base64Encode(value: string): string {
  return base64UrlEncode(value).replace(/-/g, "+").replace(/_/g, "/");
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha1(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

async function hmacSha1Hex(secret: string | ArrayBuffer, message: string): Promise<string> {
  const rawKey = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

async function hmacSha256(secret: string | ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const rawKey = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

async function hmacSha256Hex(secret: string | ArrayBuffer, message: string): Promise<string> {
  return toHex(await hmacSha256(secret, message));
}

async function sha1Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)));
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/g, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function templateValues(source: ImageUploadSource) {
  const now = new Date();
  return {
    name: sanitizeImageBaseName(source.sourceName),
    ext: source.extension,
    timestamp: Date.now().toString(),
    random: crypto.getRandomValues(new Uint32Array(1))[0].toString(36),
    yyyy: now.getFullYear().toString(),
    MM: pad2(now.getMonth() + 1),
    dd: pad2(now.getDate()),
    hh: pad2(now.getHours()),
    mm: pad2(now.getMinutes()),
    ss: pad2(now.getSeconds()),
  };
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_match, key: string) => values[key] ?? "");
}

function sanitizeObjectPath(value: string) {
  return trimSlashes(value)
    .split("/")
    .map((segment) => sanitizeImageBaseName(segment))
    .filter(Boolean)
    .join("/");
}

function sanitizeObjectFileName(value: string, extension: string) {
  const sanitized = sanitizeImageBaseName(value);
  return /\.[a-z0-9]+$/i.test(sanitized) ? sanitized : `${sanitized}.${extension}`;
}

function buildObjectKey(
  prefixValue: string,
  fileNameTemplate: string,
  source: ImageUploadSource,
): string {
  const values = templateValues(source);
  const prefix = sanitizeObjectPath(renderTemplate(prefixValue.trim(), values));
  const fileName = sanitizeObjectFileName(
    renderTemplate(fileNameTemplate.trim(), values),
    source.extension,
  );
  return prefix ? `${prefix}/${fileName}` : fileName;
}

function publicImageUrl(domain: string, key: string) {
  return `${normalizeDomain(domain)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function utcDateParts() {
  const now = new Date();
  const compact = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    date: compact.slice(0, 8),
    dateTime: compact,
    expiration: new Date(now.getTime() + 3600_000).toISOString(),
    startSeconds: Math.floor(now.getTime() / 1000),
    endSeconds: Math.floor(now.getTime() / 1000) + 3600,
  };
}

async function createQiniuUploadToken(settings: QiniuImageHostingSettings, key: string) {
  const putPolicy = {
    scope: `${settings.bucket}:${key}`,
    deadline: Math.floor(Date.now() / 1000) + 3600,
  };
  const encodedPolicy = base64UrlEncode(JSON.stringify(putPolicy));
  const encodedSign = base64UrlEncode(await hmacSha1(settings.secretKey, encodedPolicy));
  return `${settings.accessKey}:${encodedSign}:${encodedPolicy}`;
}

function isQiniuConfigured(settings: QiniuImageHostingSettings) {
  return Boolean(
    settings.accessKey.trim() &&
      settings.secretKey.trim() &&
      settings.bucket.trim() &&
      settings.domain.trim(),
  );
}

function qiniuUploadUrl(region: QiniuImageHostingRegion) {
  return QINIU_UPLOAD_HOSTS[region] ?? QINIU_UPLOAD_HOSTS.auto;
}

async function uploadToQiniu(
  settings: QiniuImageHostingSettings,
  source: ImageUploadSource,
): Promise<HostedImage> {
  if (!isQiniuConfigured(settings)) {
    throw new Error("Qiniu image hosting is not configured.");
  }

  const key = buildObjectKey(settings.prefix, settings.fileNameTemplate, source);
  const token = await createQiniuUploadToken(settings, key);
  const body = new FormData();
  body.set("token", token);
  body.set("key", key);
  body.set("file", new Blob([source.bytes], { type: source.mimeType }), source.sourceName);

  const response = await fetch(qiniuUploadUrl(settings.region), {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(`Qiniu upload failed (${response.status}).`);
  }

  return {
    alt: sanitizeImageBaseName(source.sourceName),
    src: publicImageUrl(settings.domain, key),
  };
}

export function shouldUploadToDefaultImageHost(preferences: ImageHostingPreferences) {
  return preferences.uploadToDefault && ["qiniu", "oss", "cos", "s3"].includes(preferences.provider);
}

function ossEndpoint(settings: OssImageHostingSettings) {
  if (settings.endpoint.trim()) return normalizeDomain(settings.endpoint);
  return `https://${settings.bucket}.oss-${settings.region}.aliyuncs.com`;
}

function isOssConfigured(settings: OssImageHostingSettings) {
  return Boolean(
    settings.accessKeyId.trim() &&
      settings.accessKeySecret.trim() &&
      settings.bucket.trim() &&
      settings.region.trim() &&
      settings.domain.trim(),
  );
}

async function uploadToOss(
  settings: OssImageHostingSettings,
  source: ImageUploadSource,
): Promise<HostedImage> {
  if (!isOssConfigured(settings)) {
    throw new Error("OSS image hosting is not configured.");
  }

  const key = buildObjectKey(settings.prefix, settings.fileNameTemplate, source);
  const { date, dateTime, expiration } = utcDateParts();
  const credential = `${settings.accessKeyId}/${date}/${settings.region}/oss/aliyun_v4_request`;
  const policy = base64Encode(JSON.stringify({
    expiration,
    conditions: [
      ["eq", "$success_action_status", "200"],
      { "x-oss-signature-version": "OSS4-HMAC-SHA256" },
      { "x-oss-credential": credential },
      { "x-oss-date": dateTime },
    ],
  }));
  const dateKey = await hmacSha256(`aliyun_v4${settings.accessKeySecret}`, date);
  const dateRegionKey = await hmacSha256(dateKey, settings.region);
  const dateRegionServiceKey = await hmacSha256(dateRegionKey, "oss");
  const signingKey = await hmacSha256(dateRegionServiceKey, "aliyun_v4_request");
  const signature = await hmacSha256Hex(signingKey, policy);

  const body = new FormData();
  body.set("key", key);
  body.set("policy", policy);
  body.set("x-oss-signature-version", "OSS4-HMAC-SHA256");
  body.set("x-oss-credential", credential);
  body.set("x-oss-date", dateTime);
  body.set("signature", signature);
  body.set("success_action_status", "200");
  body.set("file", new Blob([source.bytes], { type: source.mimeType }), source.sourceName);

  const response = await fetch(ossEndpoint(settings), {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(`OSS upload failed (${response.status}).`);
  }

  return {
    alt: sanitizeImageBaseName(source.sourceName),
    src: publicImageUrl(settings.domain, key),
  };
}

function cosEndpoint(settings: CosImageHostingSettings) {
  return `https://${settings.bucket}.cos.${settings.region}.myqcloud.com`;
}

function isCosConfigured(settings: CosImageHostingSettings) {
  return Boolean(
    settings.secretId.trim() &&
      settings.secretKey.trim() &&
      settings.bucket.trim() &&
      settings.region.trim() &&
      settings.domain.trim(),
  );
}

async function uploadToCos(
  settings: CosImageHostingSettings,
  source: ImageUploadSource,
): Promise<HostedImage> {
  if (!isCosConfigured(settings)) {
    throw new Error("COS image hosting is not configured.");
  }

  const key = buildObjectKey(settings.prefix, settings.fileNameTemplate, source);
  const { endSeconds, startSeconds } = utcDateParts();
  const keyTime = `${startSeconds};${endSeconds}`;
  const policyText = JSON.stringify({
    expiration: new Date(endSeconds * 1000).toISOString(),
    conditions: [
      { bucket: settings.bucket },
      ["eq", "$key", key],
      ["starts-with", "$Content-Type", "image/"],
      { "q-sign-algorithm": "sha1" },
      { "q-ak": settings.secretId },
      { "q-sign-time": keyTime },
    ],
  });
  const signKey = await hmacSha1Hex(settings.secretKey, keyTime);
  const stringToSign = await sha1Hex(policyText);
  const signature = await hmacSha1Hex(signKey, stringToSign);

  const body = new FormData();
  body.set("key", key);
  body.set("Content-Type", source.mimeType);
  body.set("policy", base64Encode(policyText));
  body.set("q-sign-algorithm", "sha1");
  body.set("q-ak", settings.secretId);
  body.set("q-key-time", keyTime);
  body.set("q-signature", signature);
  body.set("file", new Blob([source.bytes], { type: source.mimeType }), source.sourceName);

  const response = await fetch(cosEndpoint(settings), {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(`COS upload failed (${response.status}).`);
  }

  return {
    alt: sanitizeImageBaseName(source.sourceName),
    src: publicImageUrl(settings.domain, key),
  };
}

function s3Endpoint(settings: S3ImageHostingSettings) {
  if (settings.endpoint.trim()) return normalizeDomain(settings.endpoint);
  return `https://${settings.bucket}.s3.${settings.region}.amazonaws.com`;
}

function isS3Configured(settings: S3ImageHostingSettings) {
  return Boolean(
    settings.accessKeyId.trim() &&
      settings.secretAccessKey.trim() &&
      settings.bucket.trim() &&
      settings.region.trim() &&
      settings.domain.trim(),
  );
}

async function uploadToS3(
  settings: S3ImageHostingSettings,
  source: ImageUploadSource,
): Promise<HostedImage> {
  if (!isS3Configured(settings)) {
    throw new Error("S3 image hosting is not configured.");
  }

  const key = buildObjectKey(settings.prefix, settings.fileNameTemplate, source);
  const { date, dateTime, expiration } = utcDateParts();
  const credential = `${settings.accessKeyId}/${date}/${settings.region}/s3/aws4_request`;
  const policy = base64Encode(JSON.stringify({
    expiration,
    conditions: [
      { bucket: settings.bucket },
      ["eq", "$key", key],
      ["starts-with", "$Content-Type", "image/"],
      { "success_action_status": "201" },
      { "x-amz-algorithm": "AWS4-HMAC-SHA256" },
      { "x-amz-credential": credential },
      { "x-amz-date": dateTime },
    ],
  }));
  const dateKey = await hmacSha256(`AWS4${settings.secretAccessKey}`, date);
  const dateRegionKey = await hmacSha256(dateKey, settings.region);
  const dateRegionServiceKey = await hmacSha256(dateRegionKey, "s3");
  const signingKey = await hmacSha256(dateRegionServiceKey, "aws4_request");
  const signature = await hmacSha256Hex(signingKey, policy);

  const body = new FormData();
  body.set("key", key);
  body.set("Content-Type", source.mimeType);
  body.set("success_action_status", "201");
  body.set("policy", policy);
  body.set("x-amz-algorithm", "AWS4-HMAC-SHA256");
  body.set("x-amz-credential", credential);
  body.set("x-amz-date", dateTime);
  body.set("x-amz-signature", signature);
  body.set("file", new Blob([source.bytes], { type: source.mimeType }), source.sourceName);

  const response = await fetch(s3Endpoint(settings), {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed (${response.status}).`);
  }

  return {
    alt: sanitizeImageBaseName(source.sourceName),
    src: publicImageUrl(settings.domain, key),
  };
}

export async function uploadToConfiguredImageHost(
  preferences: ImageHostingPreferences,
  source: ImageUploadSource,
): Promise<HostedImage> {
  if (preferences.provider === "qiniu") {
    return uploadToQiniu(preferences.qiniu, source);
  }
  if (preferences.provider === "oss") {
    return uploadToOss(preferences.oss, source);
  }
  if (preferences.provider === "cos") {
    return uploadToCos(preferences.cos, source);
  }
  if (preferences.provider === "s3") {
    return uploadToS3(preferences.s3, source);
  }
  throw new Error("Unsupported image hosting provider.");
}

export function isImageHostingProviderConfigured(preferences: ImageHostingPreferences) {
  if (preferences.provider === "qiniu") return isQiniuConfigured(preferences.qiniu);
  if (preferences.provider === "oss") return isOssConfigured(preferences.oss);
  if (preferences.provider === "cos") return isCosConfigured(preferences.cos);
  if (preferences.provider === "s3") return isS3Configured(preferences.s3);
  return false;
}

export async function uploadToDefaultImageHost(
  preferences: ImageHostingPreferences,
  source: ImageUploadSource,
): Promise<HostedImage> {
  return uploadToConfiguredImageHost(preferences, source);
}
