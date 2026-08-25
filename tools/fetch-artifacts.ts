/**
 * Fetches pinned third-party standards artifacts (Task 0.2) into the gitignored cache dir,
 * verifies sha256, and extracts zips. Build/CI-time only — never part of the runtime.
 *
 *   pnpm artifacts            # fetch everything
 *   pnpm artifacts --only id  # fetch a subset (repeatable)
 *   pnpm artifacts --verify   # only verify what is cached, download nothing
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

interface Artifact {
  id: string;
  url: string;
  sha256: string;
  extract: boolean;
  scope: "runtime-source" | "fixtures" | "ci-oracle" | "build-tool";
}
interface Manifest {
  cacheDir: string;
  artifacts: Artifact[];
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(repoRoot, "tools", "artifacts.manifest.json");

function sha256(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function extractZip(zip: Uint8Array, dest: string): Promise<number> {
  await rm(dest, { recursive: true, force: true });
  const files = unzipSync(zip);
  let n = 0;
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    const target = resolve(dest, name);
    if (!target.startsWith(resolve(dest))) throw new Error(`zip-slip blocked: ${name}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    n++;
  }
  return n;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify");
  const only = new Set<string>();
  for (let i = 0; i < args.length; i++)
    if (args[i] === "--only" && args[i + 1]) only.add(args[++i]);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const cache = join(repoRoot, manifest.cacheDir);
  await mkdir(cache, { recursive: true });

  let failures = 0;
  for (const a of manifest.artifacts) {
    if (only.size && !only.has(a.id)) continue;
    const file = join(cache, basename(new URL(a.url).pathname));
    let bytes: Uint8Array | undefined;
    if (existsSync(file)) {
      bytes = await readFile(file);
      if (sha256(bytes) !== a.sha256) {
        console.warn(`! ${a.id}: cached file checksum mismatch, re-downloading`);
        bytes = undefined;
      }
    }
    if (!bytes) {
      if (verifyOnly) {
        console.error(`✗ ${a.id}: missing from cache`);
        failures++;
        continue;
      }
      process.stdout.write(`↓ ${a.id} … `);
      bytes = await download(a.url);
      const got = sha256(bytes);
      if (got !== a.sha256) {
        console.error(`\n✗ ${a.id}: sha256 mismatch\n  expected ${a.sha256}\n  got      ${got}`);
        failures++;
        continue;
      }
      await writeFile(file, bytes);
      console.log(`${(bytes.byteLength / 1024).toFixed(0)} KiB`);
    }
    if (a.extract) {
      const dest = join(cache, a.id);
      const n = await extractZip(bytes, dest);
      console.log(`✓ ${a.id}: verified, ${n} files → ${manifest.cacheDir}/${a.id}/`);
    } else {
      console.log(`✓ ${a.id}: verified → ${manifest.cacheDir}/${basename(file)}`);
    }
  }
  if (failures) {
    console.error(`${failures} artifact(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
