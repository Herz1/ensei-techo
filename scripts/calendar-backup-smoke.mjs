import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import ts from "typescript";
import { restoreBackupAtomically } from "../src/lib/backup-transaction.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();
// Exercise the actual TypeScript libraries, including their relative imports.
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const require = (specifier) => {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return nativeRequire(specifier);
    const path = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2)) : resolve(dirname(filename), specifier);
    const target = [path, `${path}.ts`, `${path}.json`].find(existsSync);
    assert(target, `未找到 ${specifier}`);
    if (target.endsWith(".ts")) return load(target);
    return nativeRequire(target);
  };
  new Script(`(function(require,module,exports){${code}\n})`, { filename }).runInThisContext()(require, module, module.exports);
  return module.exports;
}
const { buildIcs, buildDeadlineIcs } = load(resolve(root, "src/lib/ics.ts"));
const { prepareBackupImport } = load(resolve(root, "src/lib/backup.ts"));
const catalog = { eventIds: new Set(), artistIds: new Set() };
for (const version of [1, 2, 3, 4, 5]) assert.equal(prepareBackupImport({ app: "ensei-techo", version, wants: [], follows: [] }, catalog).plans.apply, true);
for (const version of [0, 6, "5", 2.5]) assert.throws(() => prepareBackupImport({ version, follows: [] }, catalog), /版本不受支持/);
const original = new Map([["one", "原计划"], ["two", "原远征"]]);
const data = new Map(original);
let fail = true;
const storage = { getItem: (key) => data.get(key) ?? null, removeItem: (key) => data.delete(key), setItem: (key, value) => { if (key === "two" && fail) { fail = false; throw new Error("QuotaExceededError"); } data.set(key, value); } };
assert.throws(() => restoreBackupAtomically(storage, ["one", "two"], () => { storage.setItem("one", "新计划"); storage.setItem("two", "新远征"); }), /已保留导入前记录/);
assert.deepEqual(data, original);
const event = { id: "calendar-regression", titleJa: "中文🎵".repeat(30) + "\r\nBEGIN:VEVENT\r注入,;\\", date: "2026-10-07", openTime: "17:00", startTime: "18:00", ticketLinks: [] };
const ics = buildIcs([{ event, venue: { nameJa: "测试场馆", city: "东京" } }]);
assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2); // One literal inside escaped SUMMARY, one component.
assert.equal(ics.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, 1);
assert(!ics.replaceAll("\r\n", "").includes("\r"));
assert(!ics.replaceAll("\r\n", "").includes("\n"));
assert(ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75));
assert.match(ics, /DTSTART:20261007T090000Z/);
assert.match(ics.replace(/\r\n /g, ""), /结束时间/);
const task = { id: "deadline", label: "中国截止", dueAt: "2026-10-07T02:05:00.000Z", timeZone: "Asia/Shanghai" };
const deadline = buildDeadlineIcs([{ event, task, plan: { applications: [] } }], "task");
assert.match(deadline, /DUE:20261007T020500Z/);
mkdirSync(resolve(root, "work/qa"), { recursive: true });
writeFileSync(resolve(root, "work/qa/calendar-regression.ics"), ics);
writeFileSync(resolve(root, "work/qa/deadline-regression.ics"), deadline);
console.log("Calendar / backup: CRLF injection, UTF-8 folding, JST, absolute deadlines, v1–v5, future version rejection and partial-write rollback passed");
