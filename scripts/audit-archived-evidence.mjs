import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const index = process.argv.indexOf("--source-dir");
assert(index >= 0 && process.argv[index + 1], "显式指定原始证据 ingest 目录 --source-dir；脚本只读");
const sourceDir = resolve(process.argv[index + 1]);
const manifest = JSON.parse(await readFile(resolve(sourceDir, "raw-manifest.json"), "utf8"));
const events = JSON.parse(await readFile(resolve(root, "src/data/events.json"), "utf8"));
assert(manifest.entries?.length > 0, "原始批次不能为空");
const verified = new Set();
let files = 0, bytes = 0;
for (const entry of manifest.entries) {
  if (!["success", "cache_reused"].includes(entry.fetchStatus)) continue;
  const filename = resolve(sourceDir, entry.rawFile);
  const within = relative(sourceDir, filename);
  assert(!within.startsWith("..") && !isAbsolute(within), "证据路径越界");
  const content = await readFile(filename);
  assert.equal(createHash("sha256").update(content).digest("hex"), entry.contentHash, filename);
  verified.add(entry.contentHash);
  files += 1; bytes += content.length;
}
const referenced = new Set(events.flatMap((event) => Object.values(event.fieldProvenance).flatMap((field) => field.evidence.flatMap((evidence) => evidence.rawContentHashes))));
const missing = [...referenced].filter((hash) => !verified.has(hash));
assert.deepEqual(missing, [], "正式演出字段引用的原始内容哈希必须存在于已验证归档");
console.log(JSON.stringify({ mode: "read-only archived evidence", batchId: manifest.batchId, generatedAt: manifest.generatedAt, events: events.length, files, bytes, verifiedHashes: verified.size, referencedHashes: referenced.size, missing: missing.length }, null, 2));
