const genericMessages = new Set([
  "No output generated. Check the stream for errors.",
  "No output generated.",
  "unknown error",
  "Unknown error",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ["message", "error_message", "msg", "error"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    const nested = asRecord(value);
    if (nested) {
      const inner = textFromRecord(nested);
      if (inner) return inner;
    }
  }
  return null;
}

function collectMessages(error: unknown, seen: Set<unknown>, depth: number): string[] {
  if (error == null || depth > 6) return [];
  if (typeof error === "object") {
    if (seen.has(error)) return [];
    seen.add(error);
  }

  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed ? [trimmed] : [];
  }

  if (error instanceof Error) {
    const out: string[] = [];
    const message = error.message.trim();
    if (message && !genericMessages.has(message)) out.push(message);

    const extra = error as Error & {
      data?: unknown;
      responseBody?: string;
      cause?: unknown;
    };
    if (extra.data) out.push(...collectMessages(extra.data, seen, depth + 1));
    if (typeof extra.responseBody === "string" && extra.responseBody.trim()) {
      try {
        out.push(...collectMessages(JSON.parse(extra.responseBody), seen, depth + 1));
      } catch {
        const body = extra.responseBody.trim();
        if (body.length > 0 && body.length <= 400) out.push(body);
      }
    }
    if ("cause" in error) out.push(...collectMessages(error.cause, seen, depth + 1));
    return out;
  }

  const record = asRecord(error);
  if (!record) return [];

  const out: string[] = [];
  const text = textFromRecord(record);
  if (text) out.push(text);
  if ("cause" in record) out.push(...collectMessages(record.cause, seen, depth + 1));
  return out;
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return name === "AbortError" || name === "TimeoutError";
}

export function throwIfAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) return;
  throw new DOMException("Aborted", "AbortError");
}

export function errorMessage(error: unknown): string {
  const unique = [...new Set(
    collectMessages(error, new Set(), 0).filter((part) => !genericMessages.has(part)),
  )];
  const raw = unique[0]
    ?? (error instanceof Error && error.message.trim() ? error.message.trim() : "");
  if (!raw) return "未知错误";
  if (/timed out|timeout/i.test(raw) && /读取响应失败|decoding response body/i.test(raw)) {
    return "模型响应超时。思考时间过长时，旧的整包读取会中断；请重试。";
  }
  if (/close_notify|unexpected eof|peer closed connection/i.test(raw)) {
    return "连接被对端关闭，请重试。";
  }
  if (/did not match the expected pattern/i.test(raw)) {
    return "请求失败：API 地址、密钥或响应头包含无效字符，请检查设置。";
  }
  return raw;
}

export function throwUserFacingError(error: unknown): never {
  if (isAbortError(error)) {
    if (error instanceof Error) throw error;
    throw new DOMException("Aborted", "AbortError");
  }
  throw new Error(errorMessage(error));
}
