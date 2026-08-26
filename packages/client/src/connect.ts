/**
 * Connection layer: spawn the bundled server over stdio (default) or talk to a running
 * Streamable HTTP host with a bearer token. Both return the same SDK `Client`.
 */
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export const CLIENT_NAME = "kontor-agent" as const;
export const CLIENT_VERSION = "1.0.0";

export interface ConnectOptions {
  /** `[]` = spawn the bundled `@kontor-mcp/server` with the current Node; otherwise `[command, ...args]`. */
  stdio?: string[];
  /** Streamable HTTP endpoint, e.g. `http://127.0.0.1:3333/mcp`. Takes precedence over `stdio`. */
  url?: string;
  /** Bearer token for `url` (`KONTOR_AUTH_TOKEN`). */
  token?: string;
}

export interface Connection {
  client: Client;
  transport: "stdio" | "http";
  /** Human-readable target, for the banner. */
  target: string;
  close(): Promise<void>;
}

/** Path of the bundled server's `bin.js` (sibling of the package's resolved entry point). */
export function serverBinPath(): string {
  return fileURLToPath(new URL("bin.js", import.meta.resolve("@kontor-mcp/server")));
}

export async function connect(opts: ConnectOptions): Promise<Connection> {
  const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION });
  if (opts.url) {
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const transport = new StreamableHTTPClientTransport(new URL(opts.url), {
      requestInit: { headers },
    });
    // Cast: the class's optional-getter types trip exactOptionalPropertyTypes; it is a Transport.
    await client.connect(transport as Transport);
    return {
      client,
      transport: "http",
      target: opts.url,
      // Be a good citizen: DELETE the session so the server frees it immediately.
      close: async () => {
        await transport.terminateSession().catch(() => {});
        await client.close();
      },
    };
  }
  const argv = opts.stdio?.length ? opts.stdio : [process.execPath, serverBinPath()];
  const [command, ...args] = argv as [string, ...string[]];
  const transport = new StdioClientTransport({ command, args, stderr: "inherit" });
  await client.connect(transport);
  return {
    client,
    transport: "stdio",
    target: argv.join(" "),
    close: () => client.close(),
  };
}
