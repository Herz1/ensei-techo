import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { latestPendingRegistry } from "./adapters/pending-source-registry.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const latest = await latestPendingRegistry();
assert.ok(latest);
assert.equal(latest.round, 25);
assert.equal(latest.filename, "pending-sources-r25.mjs");

const latestText = await readFile(
  path.join(scriptDir, "adapters", latest.filename),
  "utf8",
);
assert.match(latestText, /pending-sources-r24\.mjs/u);
assert.match(latestText, /createGenerationsParallelQuestSourceAdapter/u);
assert.match(latestText, /export function createPendingSourceAdaptersR25/u);

const previousText = await readFile(
  path.join(scriptDir, "adapters", "pending-sources-r24.mjs"),
  "utf8",
);
assert.match(previousText, /createAimyonTourSourceAdapter/u);
assert.match(previousText, /export function createPendingSourceAdaptersR24/u);

console.log("Pending source registry discovery smoke: ok");
