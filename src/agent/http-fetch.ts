import { errorMessage, isAbortError } from "./errors";

type FetchFn = typeof fetch;

export type HttpFetchOptions = {
  timeoutSecs?: number;
};

type StreamFetchStart = {
  type: "start";
  status: number;
  contentType?: string | null;
  finalUrl: string;
  headers?: Record<string, string>;
};

type StreamFetchChunk = {
  type: "chunk";
  data: number[] | Uint8Array | string;
};

type StreamFetchEnd = {
  type: "end";
};

type StreamFetchEvent = StreamFetchStart | StreamFetchChunk | StreamFetchEnd;

const FINAL_URL_HEADER = "x-sheaf-final-url";

function readRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function readRequestBody(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | undefined> {
  const source = input instanceof Request ? input : null;
  const rawBody = init?.body ?? (source ? await source.clone().text() : undefined);
  if (rawBody == null || rawBody === "") return undefined;
  if (typeof rawBody === "string") return rawBody;
  if (rawBody instanceof Blob) return rawBody.text();
  if (rawBody instanceof ArrayBuffer) return new TextDecoder().decode(rawBody);
  if (ArrayBuffer.isView(rawBody)) return new TextDecoder().decode(rawBody);
  if (rawBody instanceof URLSearchParams) return rawBody.toString();
  throw new Error("HTTP transport only supports text request bodies.");
}

const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "").trim();
}

function trySetHeader(target: Headers, key: string, value: string) {
  const name = key.trim();
  if (!HEADER_NAME_RE.test(name)) return;
  try {
    target.set(name, sanitizeHeaderValue(value));
  } catch {
    // WebKit throws TypeError: The string did not match the expected pattern.
  }
}

function appendHeaders(target: Headers, source: HeadersInit) {
  if (source instanceof Headers) {
    source.forEach((value, key) => {
      trySetHeader(target, key, value);
    });
    return;
  }
  if (Array.isArray(source)) {
    for (const [key, value] of source) {
      trySetHeader(target, key, value);
    }
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    if (value == null) continue;
    trySetHeader(target, key, String(value));
  }
}

function readRequestHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
): Record<string, string> {
  const headers = new Headers();
  if (input instanceof Request) {
    appendHeaders(headers, input.headers);
  }
  if (init?.headers) {
    appendHeaders(headers, init.headers);
  }
  return Object.fromEntries(headers.entries());
}

function toBytes(data: StreamFetchChunk["data"]): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Uint8Array.from(data);
  if (typeof data === "string") {
    const bytes = new Uint8Array(data.length);
    for (let index = 0; index < data.length; index++) {
      bytes[index] = data.charCodeAt(index) & 0xff;
    }
    return bytes;
  }
  throw new TypeError("无效的流式响应分片");
}

function enqueueEvent(
  event: StreamFetchEvent,
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  if (event.type === "chunk") {
    controller.enqueue(toBytes(event.data));
    return;
  }
  if (event.type === "end") {
    controller.close();
  }
}

function responseHeaders(start: StreamFetchStart): Headers {
  const headers = new Headers();
  if (start.headers) {
    for (const [key, value] of Object.entries(start.headers)) {
      trySetHeader(headers, key, value);
    }
  }
  const contentType = start.contentType?.trim();
  if (contentType && !headers.has("content-type")) {
    trySetHeader(headers, "content-type", contentType);
  }
  if (start.finalUrl) {
    trySetHeader(headers, FINAL_URL_HEADER, start.finalUrl);
  }
  return headers;
}

async function fetchViaTauri(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: HttpFetchOptions,
): Promise<Response> {
  const { Channel, invoke } = await import("@tauri-apps/api/core");
  const url = readRequestUrl(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = readRequestHeaders(input, init);
  const body = await readRequestBody(input, init);
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);

  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const pending: StreamFetchEvent[] = [];
  let startResolve: ((event: StreamFetchStart) => void) | undefined;
  let startReject: ((error: unknown) => void) | undefined;
  const started = new Promise<StreamFetchStart>((resolve, reject) => {
    startResolve = resolve;
    startReject = reject;
  });

  const onEvent = new Channel<StreamFetchEvent>((event) => {
    if (signal?.aborted) return;
    if (event.type === "start") {
      startResolve?.(event);
      return;
    }
    if (streamController) {
      enqueueEvent(event, streamController);
      return;
    }
    pending.push(event);
  });

  const invokePromise = invoke("http_fetch", {
    request: {
      url,
      method,
      headers,
      body,
      timeoutSecs: options.timeoutSecs,
    },
    onEvent,
  });

  invokePromise
    .then(() => {
      try {
        streamController?.close();
      } catch {
        // already closed by the end event
      }
    })
    .catch((error) => {
      const wrapped = isAbortError(error) || signal?.aborted
        ? error
        : new TypeError(errorMessage(error));
      startReject?.(wrapped);
      streamController?.error(wrapped);
    });

  const onAbort = () => {
    const abortError = signal?.reason instanceof Error
      ? signal.reason
      : new DOMException("Aborted", "AbortError");
    startReject?.(abortError);
    try {
      streamController?.error(abortError);
    } catch {
      // stream already closed
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  let start: StreamFetchStart;
  try {
    start = await started;
  } catch (error) {
    signal?.removeEventListener("abort", onAbort);
    throw error;
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      for (const event of pending) {
        enqueueEvent(event, controller);
      }
      pending.length = 0;
    },
    cancel() {
      onAbort();
    },
  });

  return new Response(stream, {
    status: start.status,
    headers: responseHeaders(start),
  });
}

export function readFinalUrl(response: Response, fallback: string): string {
  return response.headers.get(FINAL_URL_HEADER) || response.url || fallback;
}

export function createHttpFetch(options: HttpFetchOptions = {}): FetchFn {
  return async (input, init) => {
    try {
      const { isTauri } = await import("@tauri-apps/api/core");
      if (isTauri()) return await fetchViaTauri(input, init, options);
      return await globalThis.fetch(input, init);
    } catch (error) {
      if (error instanceof TypeError && /expected pattern/i.test(error.message)) {
        throw new Error("请求失败：API 地址、密钥或响应头包含无效字符，请检查设置。");
      }
      throw error;
    }
  };
}
