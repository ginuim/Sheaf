export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim() || error.name || "未知错误";
  }
  if (typeof error === "string") {
    return error.trim() || "未知错误";
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error.trim();
    }
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // ignore
  }
  return "未知错误";
}
