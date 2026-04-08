import type { NormalizedQueryInput } from "../query.types";
import type { QueryActor } from "./query-guardrails.types";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function sanitizeIp(ip: string): string {
  const normalized = ip.trim();
  return normalized.length > 0 ? normalized : "unknown";
}

export function resolveQueryActor(normalizedInput: NormalizedQueryInput, clientIp: string): QueryActor {
  if (normalizedInput.userId && isUuid(normalizedInput.userId)) {
    return {
      type: "user",
      id: normalizedInput.userId,
      key: `user:${normalizedInput.userId}`
    };
  }

  const resolvedIp = sanitizeIp(clientIp);
  return {
    type: "ip",
    id: resolvedIp,
    key: `ip:${resolvedIp}`
  };
}
