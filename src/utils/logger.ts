export function logInfo(message: string, meta?: Record<string, unknown>) {
  console.log("[info]", message, meta || {});
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  console.warn("[warn]", message, meta || {});
}

export function logError(message: string, meta?: Record<string, unknown>) {
  console.error("[error]", message, meta || {});
}
