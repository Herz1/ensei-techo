import assert from "node:assert/strict";
import {
  createDeadlineTiming,
  deadlineInstant,
  isDeadlineOverdue,
  isValidLocalDateTime,
  formatManualTaskWallTime,
  isManualTaskOverdue,
  manualTaskTimeZoneLabel,
  manualDeadlineTimeZoneLabel,
} from "../src/lib/deadline-core.mjs";

assert.equal(isValidLocalDateTime("2026-08-30T10:05"), true);
assert.equal(isValidLocalDateTime("2026-02-30T10:05"), false);
assert.equal(isValidLocalDateTime("2026-08-30T24:00"), false);

const timing = createDeadlineTiming("2026-08-30T10:05", "Asia/Shanghai", "Asia/Tokyo");
assert.deepEqual(timing, {
  timeZone: "Asia/Shanghai",
  instantAt: "2026-08-30T02:05:00.000Z",
});
const deadline = { at: "2026-08-30T10:05", label: "个人截止", ...timing };
assert.equal(deadlineInstant(deadline).exact, true);
assert.equal(isDeadlineOverdue(deadline, Date.parse("2026-08-30T02:05:01.000Z")), true, "同一天过一分钟内也必须判定逾期");
assert.equal(isDeadlineOverdue(deadline, Date.parse("2026-08-30T02:04:59.000Z")), false);
assert.equal(manualDeadlineTimeZoneLabel(deadline), "中国标准时间（Asia/Shanghai）");

const legacy = { at: "2026-08-30T10:05", label: "旧截止" };
assert.equal(deadlineInstant(legacy).exact, false);
assert.match(manualDeadlineTimeZoneLabel(legacy), /时区未记录/u);

const task = { dueAt: timing.instantAt, timeZone: timing.timeZone };
assert.equal(isManualTaskOverdue(task, Date.parse("2026-08-30T02:05:01.000Z")), true);
assert.equal(manualTaskTimeZoneLabel(task), "中国标准时间（Asia/Shanghai）");
assert.match(formatManualTaskWallTime(task), /2026/u);

console.log("Deadline 测试通过：精确时刻按 Date.now 边界判断，v2 个人任务时区与旧记录迁移语义正常。");
