import { errorMessage } from "./errors";
import { createHttpFetch, readFinalUrl } from "./http-fetch";
import { assertPublicHttpUrl, isDuckDuckGoSearchUrl } from "./url-policy";

export type WebFetchMode = "tauri" | "browser";

export type WebResourceRequest = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
};

export type FetchUrlResult = {
  body: string;
  status: number;
  finalUrl: string;
  contentType?: string | null;
};

const defaultHeaders: Record<string, string> = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain;q=0.8,*/*;q=0.5",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export async function resolveWebFetchMode(): Promise<WebFetchMode> {
  const { isTauri } = await import("@tauri-apps/api/core");
  return isTauri() ? "tauri" : "browser";
}

function isLikelyCorsError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message.toLowerCase();
  return message.includes("failed to fetch") || message.includes("networkerror");
}

async function fetchViaTauri(request: WebResourceRequest): Promise<FetchUrlResult> {
  const method = request.method ?? "GET";
  const headers = { ...defaultHeaders, ...request.headers };
  let response: Response;
  try {
    response = await createHttpFetch({ timeoutSecs: 25 })(request.url, {
      method,
      headers,
      body: method === "POST" ? request.body : undefined,
    });
  } catch (error) {
    throw new Error(errorMessage(error));
  }

  if (response.status < 200 || response.status >= 400) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.text();
  if (body.length > 2 * 1024 * 1024) {
    throw new Error("响应过大");
  }

  return {
    body,
    status: response.status,
    finalUrl: readFinalUrl(response, request.url),
    contentType: response.headers.get("content-type"),
  };
}

async function fetchViaBrowser(request: WebResourceRequest): Promise<FetchUrlResult> {
  const url = assertPublicHttpUrl(request.url);
  const method = request.method ?? "GET";
  const headers = { ...defaultHeaders, ...request.headers };

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: method === "POST" ? request.body : undefined,
      signal: AbortSignal.timeout(25_000),
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
    });
  } catch (error) {
    if (isLikelyCorsError(error) && !isDuckDuckGoSearchUrl(url)) {
      throw new Error(
        "浏览器模式无法直接抓取该站点（跨域限制）。请使用桌面版 Sheaf，或改用 web_search 获取摘要。",
      );
    }
    if (isLikelyCorsError(error)) {
      throw new Error("浏览器模式搜索请求被拦截，将自动尝试备用搜索接口。");
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.text();
  if (body.length > 2 * 1024 * 1024) {
    throw new Error("响应过大");
  }

  return {
    body,
    status: response.status,
    finalUrl: response.url || url.toString(),
    contentType: response.headers.get("content-type"),
  };
}

export async function fetchWebResource(request: WebResourceRequest): Promise<FetchUrlResult> {
  assertPublicHttpUrl(request.url);
  const mode = await resolveWebFetchMode();
  if (mode === "tauri") {
    return fetchViaTauri(request);
  }
  return fetchViaBrowser(request);
}

/** @deprecated 使用 fetchWebResource */
export async function fetchUrlSafe(url: string): Promise<FetchUrlResult> {
  return fetchWebResource({ url });
}
