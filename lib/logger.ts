/**
 * Minimal structured logger with secret redaction.
 *
 * Emits one JSON object per line (stdout/stderr) so logs are machine-parseable
 * in Vercel/any aggregator. Anything that looks like a secret (token, key,
 * secret, password, authorization, code) is redacted recursively before
 * serialization. Never pass raw tokens expecting them to print.
 */
type Level = "debug" | "info" | "warn" | "error";

const SECRET_KEY_PATTERN =
  /(secret|token|password|authorization|api[-_]?key|client[-_]?secret|refresh|access[-_]?token|code|encryption[-_]?key)/i;

const REDACTED = "[REDACTED]";

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return redactBearer(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY_PATTERN.test(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

/** Redact inline bearer tokens that may appear in free-text messages. */
function redactBearer(s: string): string {
  return s.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [REDACTED]");
}

function emit(level: Level, message: string, context?: unknown): void {
  const entry = {
    level,
    time: new Date().toISOString(),
    message: redactBearer(message),
    ...(context !== undefined
      ? { context: redact(context) as Record<string, unknown> }
      : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (m: string, c?: unknown) => emit("debug", m, c),
  info: (m: string, c?: unknown) => emit("info", m, c),
  warn: (m: string, c?: unknown) => emit("warn", m, c),
  error: (m: string, c?: unknown) => emit("error", m, c),
};

// Exported for unit testing of the redaction logic.
export const __test = { redact, redactBearer, SECRET_KEY_PATTERN };
