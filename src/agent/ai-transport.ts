import { errorMessage } from "./errors";

type FetchFn = typeof fetch;

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
  throw new Error("AI transport only supports text request bodies.");
}

function readRequestHeaders(
  input: RequestInfo | URL,
  init?: RequestInit,
): Record<string, string> {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return Object.fromEntries(headers.entries());
}

function guessContentType(body: string | undefined, reported?: string | null) {
  if (reported?.trim()) return reported;
  if (!body) return "application/json";
  try {
    const parsed = JSON.parse(body) as { stream?: boolean };
    if (parsed.stream === true) return "text/event-stream";
  } catch {
    // ignore
  }
  return "application/json";
}

async function fetchViaTauri(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { invoke } = await import("@tauri-apps/api/core");
  const url = readRequestUrl(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = readRequestHeaders(input, init);
  const body = await readRequestBody(input, init);

  let result: {
    body: string;
    status: number;
    contentType?: string | null;
  };

  try {
    result = await invoke("fetch_url", {
      request: { url, method, headers, body },
    });
  } catch (error) {
    throw new TypeError(errorMessage(error));
  }

  const contentType = guessContentType(body, result.contentType ?? null);
  return new Response(result.body, {
    status: result.status,
    headers: { "content-type": contentType },
  });
}

async function aiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { isTauri } = await import("@tauri-apps/api/core");
  if (isTauri()) return fetchViaTauri(input, init);
  return globalThis.fetch(input, init);
}

export function createAiFetch(): FetchFn {
  return (input, init) => aiFetch(input, init);
}
