/**
 * Process configuration (PRD §5.9 env surface). Pure: takes an env map, returns a typed config
 * or throws a plain Error whose message names the offending variable.
 */
import { z } from "zod";

export const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"] as const;
export const DEFAULT_PORT = 3333;
export const DEFAULT_BIND = "127.0.0.1";
/** Below this a token is a guess, not a secret. */
export const MIN_TOKEN_LENGTH = 16;

export interface HttpConfig {
  transport: "http";
  port: number;
  bind: string;
  /** Undefined only with the explicit loopback opt-in (`KONTOR_ALLOW_NO_AUTH=1`). */
  authToken: string | undefined;
  allowedOrigins: string[];
}
export type ServerConfig = { transport: "stdio" } | HttpConfig;

export function isLoopback(host: string): boolean {
  return (LOOPBACK_HOSTS as readonly string[]).includes(host);
}

const EnvSchema = z.object({
  KONTOR_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  KONTOR_PORT: z.coerce.number().int().min(0).max(65535).default(DEFAULT_PORT),
  KONTOR_BIND: z.string().trim().min(1).default(DEFAULT_BIND),
  KONTOR_AUTH_TOKEN: z.string().min(MIN_TOKEN_LENGTH).optional(),
  KONTOR_ALLOWED_ORIGINS: z.string().optional(),
  KONTOR_ALLOW_NO_AUTH: z.string().optional(),
});

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  // Empty strings behave like unset (Docker `-e KONTOR_AUTH_TOKEN=` etc.).
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([k, v]) => k.startsWith("KONTOR_") && v !== undefined && v !== ""),
  );
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const name = String(issue?.path[0] ?? "KONTOR_*");
    const detail =
      name === "KONTOR_AUTH_TOKEN"
        ? `must be at least ${MIN_TOKEN_LENGTH} characters`
        : (issue?.message ?? "invalid");
    throw new Error(`${name}: ${detail}`);
  }
  const e = parsed.data;
  if (e.KONTOR_TRANSPORT === "stdio") return { transport: "stdio" };

  if (!e.KONTOR_AUTH_TOKEN) {
    if (e.KONTOR_ALLOW_NO_AUTH !== "1") {
      throw new Error(
        "KONTOR_AUTH_TOKEN is required in HTTP mode (set KONTOR_ALLOW_NO_AUTH=1 to run without a token on a loopback bind only).",
      );
    }
    if (!isLoopback(e.KONTOR_BIND)) {
      throw new Error(
        `KONTOR_ALLOW_NO_AUTH=1 is only honoured for a loopback bind (${LOOPBACK_HOSTS.join(", ")}); KONTOR_BIND is "${e.KONTOR_BIND}".`,
      );
    }
  }
  const allowedOrigins = (e.KONTOR_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    transport: "http",
    port: e.KONTOR_PORT,
    bind: e.KONTOR_BIND,
    authToken: e.KONTOR_AUTH_TOKEN,
    allowedOrigins,
  };
}
