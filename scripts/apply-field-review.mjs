import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./event-ingest-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const ingestDir = path.join(projectDir, "src", "data", "ingest");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const expectedHash = arg("--batch");
  const reviewer = arg("--reviewer");
  if (!expectedHash || !reviewer) {
    throw new Error("必须显式提供 --batch <hash> 和 --reviewer <name>");
  }
  const [batch, reviews] = await Promise.all([
    readJson(path.join(ingestDir, "field-review-batch.json")),
    readJson(path.join(ingestDir, "reviews.json")),
  ]);
  const actualHash = sha256(JSON.stringify(batch.events));
  if (batch.batchHash !== actualHash || expectedHash !== actualHash) {
    throw new Error("审核批次哈希不匹配，候选内容可能已变化");
  }

  const verifiedAt = new Date().toISOString();
  const byId = new Map((reviews.events ?? []).map((event) => [event.id, event]));
  for (const event of batch.events) {
    const existing = byId.get(event.id) ?? {
      id: event.id,
      fields: {},
    };
    existing.fields = {
      ...existing.fields,
      ...Object.fromEntries(
        Object.entries(event.fields).map(([name, field]) => [
          name,
          field.approvalHash,
        ]),
      ),
    };
    existing.verifiedAt = verifiedAt;
    existing.reviewer = reviewer;
    existing.batchHash = actualHash;
    byId.set(event.id, existing);
  }
  const next = {
    schemaVersion: 2,
    verifiedAt,
    events: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    rejected: reviews.rejected ?? [],
  };
  await writeFile(
    path.join(ingestDir, "reviews.json"),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `已应用字段审核批次：${batch.events.length} 场，reviewer=${reviewer}`,
  );
}

main().catch((error) => {
  console.error(`应用审核失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
