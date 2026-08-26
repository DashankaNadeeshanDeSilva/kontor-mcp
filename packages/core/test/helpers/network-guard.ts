/**
 * In-process network guard for the sovereignty tests (PRD NFR-2).
 * Patches every outbound path Node offers — sockets, TLS, DNS, http/https clients, fetch — to
 * record the attempt and throw. Restore with the returned function.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

export interface NetworkGuard {
  attempts: string[];
  restore(): void;
}

export class NetworkAttemptError extends Error {
  override readonly name = "NetworkAttemptError";
}

export function installNetworkGuard(): NetworkGuard {
  const attempts: string[] = [];
  const undo: Array<() => void> = [];
  const block = <T extends object, K extends keyof T>(obj: T, key: K, label: string) => {
    const original = obj[key];
    if (typeof original !== "function") return;
    (obj as Record<K, unknown>)[key] = (...args: unknown[]) => {
      const what = `${label}(${args
        .filter((a) => typeof a === "string" || typeof a === "number")
        .slice(0, 2)
        .join(", ")})`;
      attempts.push(what);
      throw new NetworkAttemptError(`KONTOR-SOVEREIGNTY: network attempt blocked: ${what}`);
    };
    undo.push(() => {
      (obj as Record<K, unknown>)[key] = original;
    });
  };
  block(net.Socket.prototype, "connect", "net.Socket.connect");
  block(net, "connect", "net.connect");
  block(net, "createConnection", "net.createConnection");
  block(tls, "connect", "tls.connect");
  block(http, "request", "http.request");
  block(http, "get", "http.get");
  block(https, "request", "https.request");
  block(https, "get", "https.get");
  block(dns, "lookup", "dns.lookup");
  block(dns, "resolve", "dns.resolve");
  block(dns, "resolve4", "dns.resolve4");
  block(dns, "resolve6", "dns.resolve6");
  block(dns.promises, "lookup", "dns.promises.lookup");
  block(dns.promises, "resolve", "dns.promises.resolve");
  block(globalThis, "fetch", "fetch");
  return {
    attempts,
    restore: () => {
      for (const u of undo.reverse()) u();
    },
  };
}
