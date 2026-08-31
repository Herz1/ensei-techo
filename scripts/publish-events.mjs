import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPublishedEvents } from "./event-ingest-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const dataDir = path.join(projectDir, "src", "data");
const approvedPath = path.join(dataDir, "ingest", "approved.json");
const eventsPath = path.join(dataDir, "events.json");

function todayJst() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

async function main() {
  const approved = JSON.parse(await readFile(approvedPath, "utf8"));
  if (!Array.isArray(approved) || approved.length === 0) {
    throw new Error("没有已批准记录；拒绝用空候选覆盖正式演出库");
  }

  const generatedAt = new Date().toISOString();
  const events = buildPublishedEvents(approved, generatedAt, todayJst());
  await writeFile(eventsPath, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  console.log(`正式演出库已发布：${events.length} 条，全部带官方来源与证据哈希`);
}

main().catch((error) => {
  console.error(`发布失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
