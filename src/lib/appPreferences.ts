import {
  markdownFormatToolIds,
  type MarkdownFormatToolId,
} from "../types/markdown-format";

const STORAGE_KEY = "sheaf-app-preferences";
const LEGACY_DEFAULT_IMAGE_FILE_NAME_TEMPLATE = "{timestamp}-{random}-{name}.{ext}";
const DEFAULT_IMAGE_FILE_NAME_TEMPLATE = "{timestamp}-{random}.{ext}";

export type AppPreferences = {
  autoUpdateEnabled: boolean;
  markdownFormatBarEnabled: boolean;
  markdownFormatBarTools: Record<MarkdownFormatToolId, boolean>;
  markdownFormatBarToolOrder: MarkdownFormatToolId[];
  imageHosting: ImageHostingPreferences;
};

export type ImageHostingProvider = "qiniu" | "oss" | "cos" | "s3";

export type QiniuImageHostingRegion =
  | "auto"
  | "z0"
  | "z1"
  | "z2"
  | "na0"
  | "as0";

export type QiniuImageHostingSettings = {
  accessKey: string;
  secretKey: string;
  bucket: string;
  domain: string;
  region: QiniuImageHostingRegion;
  prefix: string;
  fileNameTemplate: string;
};

export type OssImageHostingSettings = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint: string;
  domain: string;
  prefix: string;
  fileNameTemplate: string;
};

export type CosImageHostingSettings = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  domain: string;
  prefix: string;
  fileNameTemplate: string;
};

export type S3ImageHostingSettings = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint: string;
  domain: string;
  prefix: string;
  fileNameTemplate: string;
};

export type ImageHostingPreferences = {
  uploadToDefault: boolean;
  provider: ImageHostingProvider;
  qiniu: QiniuImageHostingSettings;
  oss: OssImageHostingSettings;
  cos: CosImageHostingSettings;
  s3: S3ImageHostingSettings;
};

const disabledByDefaultTools: MarkdownFormatToolId[] = [
  "heading4",
  "inlineCode",
  "codeBlock",
  "table",
];

function createDefaultFormatBarTools(): Record<MarkdownFormatToolId, boolean> {
  return Object.fromEntries(
    markdownFormatToolIds.map((id) => [id, !disabledByDefaultTools.includes(id)]),
  ) as Record<MarkdownFormatToolId, boolean>;
}

const defaults: AppPreferences = {
  autoUpdateEnabled: true,
  markdownFormatBarEnabled: true,
  markdownFormatBarTools: createDefaultFormatBarTools(),
  markdownFormatBarToolOrder: [...markdownFormatToolIds],
  imageHosting: {
    uploadToDefault: false,
    provider: "qiniu",
    qiniu: {
      accessKey: "",
      secretKey: "",
      bucket: "",
      domain: "",
      region: "auto",
      prefix: "sheaf/",
      fileNameTemplate: DEFAULT_IMAGE_FILE_NAME_TEMPLATE,
    },
    oss: {
      accessKeyId: "",
      accessKeySecret: "",
      bucket: "",
      region: "",
      endpoint: "",
      domain: "",
      prefix: "sheaf/",
      fileNameTemplate: DEFAULT_IMAGE_FILE_NAME_TEMPLATE,
    },
    cos: {
      secretId: "",
      secretKey: "",
      bucket: "",
      region: "",
      domain: "",
      prefix: "sheaf/",
      fileNameTemplate: DEFAULT_IMAGE_FILE_NAME_TEMPLATE,
    },
    s3: {
      accessKeyId: "",
      secretAccessKey: "",
      bucket: "",
      region: "us-east-1",
      endpoint: "",
      domain: "",
      prefix: "sheaf/",
      fileNameTemplate: DEFAULT_IMAGE_FILE_NAME_TEMPLATE,
    },
  },
};

function defaultPreferences(): AppPreferences {
  return {
    autoUpdateEnabled: defaults.autoUpdateEnabled,
    markdownFormatBarEnabled: defaults.markdownFormatBarEnabled,
    markdownFormatBarTools: { ...defaults.markdownFormatBarTools },
    markdownFormatBarToolOrder: [...defaults.markdownFormatBarToolOrder],
    imageHosting: {
      ...defaults.imageHosting,
      qiniu: { ...defaults.imageHosting.qiniu },
      oss: { ...defaults.imageHosting.oss },
      cos: { ...defaults.imageHosting.cos },
      s3: { ...defaults.imageHosting.s3 },
    },
  };
}

function normalizeFormatBarTools(
  value: unknown,
): Record<MarkdownFormatToolId, boolean> {
  const source = value && typeof value === "object"
    ? value as Partial<Record<MarkdownFormatToolId, unknown>>
    : {};

  return Object.fromEntries(
    markdownFormatToolIds.map((id) => [
      id,
      typeof source[id] === "boolean" ? source[id] : defaults.markdownFormatBarTools[id],
    ]),
  ) as Record<MarkdownFormatToolId, boolean>;
}

function normalizeFormatBarToolOrder(value: unknown): MarkdownFormatToolId[] {
  if (!Array.isArray(value)) {
    return [...markdownFormatToolIds];
  }

  const validIds = value.filter((id): id is MarkdownFormatToolId =>
    markdownFormatToolIds.includes(id as any)
  );

  const missingIds = markdownFormatToolIds.filter(id => !validIds.includes(id));

  return [...validIds, ...missingIds];
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeFileNameTemplate(value: unknown, fallback: string): string {
  const template = normalizeString(value, fallback);
  return template === LEGACY_DEFAULT_IMAGE_FILE_NAME_TEMPLATE ? fallback : template;
}

function normalizeQiniuRegion(value: unknown): QiniuImageHostingRegion {
  return ["auto", "z0", "z1", "z2", "na0", "as0"].includes(value as string)
    ? value as QiniuImageHostingRegion
    : defaults.imageHosting.qiniu.region;
}

function normalizeImageHosting(value: unknown): ImageHostingPreferences {
  const source = value && typeof value === "object"
    ? value as Partial<ImageHostingPreferences>
    : {};
  const qiniu = source.qiniu && typeof source.qiniu === "object"
    ? source.qiniu as Partial<QiniuImageHostingSettings>
    : {};
  const oss = source.oss && typeof source.oss === "object"
    ? source.oss as Partial<OssImageHostingSettings>
    : {};
  const cos = source.cos && typeof source.cos === "object"
    ? source.cos as Partial<CosImageHostingSettings>
    : {};
  const s3 = source.s3 && typeof source.s3 === "object"
    ? source.s3 as Partial<S3ImageHostingSettings>
    : {};
  const provider = ["qiniu", "oss", "cos", "s3"].includes(source.provider as string)
    ? source.provider as ImageHostingProvider
    : defaults.imageHosting.provider;

  return {
    uploadToDefault:
      typeof source.uploadToDefault === "boolean"
        ? source.uploadToDefault
        : defaults.imageHosting.uploadToDefault,
    provider,
    qiniu: {
      accessKey: normalizeString(qiniu.accessKey),
      secretKey: normalizeString(qiniu.secretKey),
      bucket: normalizeString(qiniu.bucket),
      domain: normalizeString(qiniu.domain),
      region: normalizeQiniuRegion(qiniu.region),
      prefix: normalizeString(qiniu.prefix, defaults.imageHosting.qiniu.prefix),
      fileNameTemplate: normalizeFileNameTemplate(
        qiniu.fileNameTemplate,
        defaults.imageHosting.qiniu.fileNameTemplate,
      ),
    },
    oss: {
      accessKeyId: normalizeString(oss.accessKeyId),
      accessKeySecret: normalizeString(oss.accessKeySecret),
      bucket: normalizeString(oss.bucket),
      region: normalizeString(oss.region),
      endpoint: normalizeString(oss.endpoint),
      domain: normalizeString(oss.domain),
      prefix: normalizeString(oss.prefix, defaults.imageHosting.oss.prefix),
      fileNameTemplate: normalizeFileNameTemplate(
        oss.fileNameTemplate,
        defaults.imageHosting.oss.fileNameTemplate,
      ),
    },
    cos: {
      secretId: normalizeString(cos.secretId),
      secretKey: normalizeString(cos.secretKey),
      bucket: normalizeString(cos.bucket),
      region: normalizeString(cos.region),
      domain: normalizeString(cos.domain),
      prefix: normalizeString(cos.prefix, defaults.imageHosting.cos.prefix),
      fileNameTemplate: normalizeFileNameTemplate(
        cos.fileNameTemplate,
        defaults.imageHosting.cos.fileNameTemplate,
      ),
    },
    s3: {
      accessKeyId: normalizeString(s3.accessKeyId),
      secretAccessKey: normalizeString(s3.secretAccessKey),
      bucket: normalizeString(s3.bucket),
      region: normalizeString(s3.region, defaults.imageHosting.s3.region),
      endpoint: normalizeString(s3.endpoint),
      domain: normalizeString(s3.domain),
      prefix: normalizeString(s3.prefix, defaults.imageHosting.s3.prefix),
      fileNameTemplate: normalizeFileNameTemplate(
        s3.fileNameTemplate,
        defaults.imageHosting.s3.fileNameTemplate,
      ),
    },
  };
}

export function loadAppPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreferences();
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      autoUpdateEnabled:
        typeof parsed.autoUpdateEnabled === "boolean"
          ? parsed.autoUpdateEnabled
          : defaults.autoUpdateEnabled,
      markdownFormatBarEnabled:
        typeof parsed.markdownFormatBarEnabled === "boolean"
          ? parsed.markdownFormatBarEnabled
          : defaults.markdownFormatBarEnabled,
      markdownFormatBarTools: normalizeFormatBarTools(parsed.markdownFormatBarTools),
      markdownFormatBarToolOrder: normalizeFormatBarToolOrder(parsed.markdownFormatBarToolOrder),
      imageHosting: normalizeImageHosting(parsed.imageHosting),
    };
  } catch {
    return defaultPreferences();
  }
}

export function saveAppPreferences(preferences: AppPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
