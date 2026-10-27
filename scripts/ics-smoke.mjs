import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Resolve the same @/ source alias used by Next, so tests run real production modules.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      for (const suffix of ["", ".ts", ".tsx", ".mjs", ".js"]) {
        const url = new URL("../src/" + specifier.slice(2) + suffix, import.meta.url);
        if (existsSync(url)) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
const { buildIcs, buildTripIcs, buildDeadlineIcs } = await import("../src/lib/ics.ts");
const { normalizeCalendarReminder } = await import("../src/lib/ics-reminder.ts");
hooks.deregister();
const event = { id: "live-1", date: "2026-10-28", startTime: "00:30", openTime: "00:00", titleJa: "夜の公演", status: "confirmed", venueId: "hall-1", artistIds: [] };
const venue = { id: "hall-1", nameJa: "東京ホール", city: "東京" };
const unfold = (value) => value.replace(/\r\n[ \t]/g, "");

test("default export has no alarms and JST midnight maps to the previous UTC day", () => {
  const value = buildIcs([{ event, venue }]);
  assert.equal(value.includes("VALARM"), false);
  assert.ok(value.includes("DTSTART:20261027T153000Z\r\n"));
  assert.ok(value.includes("DTEND:20261027T180000Z\r\n"));
  assert.ok(value.endsWith("END:VCALENDAR\r\n"));
});
test("each supported choice adds exactly one DISPLAY alarm per performance", () => {
  for (const [minutes, trigger] of [[30, "-PT30M"], [60, "-PT60M"], [1440, "-P1D"]]) {
    const value = buildIcs([{ event, venue }, { event: { ...event, id: "live-2" } }], minutes);
    assert.equal(value.match(/BEGIN:VALARM/g)?.length, 2);
    assert.equal(value.match(/ACTION:DISPLAY/g)?.length, 2);
    assert.ok(value.includes("TRIGGER:" + trigger + "\r\n"));
    assert.equal(value.includes("ACTION:EMAIL"), false);
  }
});
test("unsupported runtime values cannot create malformed triggers", () => {
  for (const minutes of [-1, 5, Infinity, NaN, "30", "30\r\nACTION:EMAIL", null]) {
    assert.equal(normalizeCalendarReminder(minutes), 0);
    assert.equal(buildIcs([{ event }], minutes).includes("VALARM"), false);
  }
});
test("CR, LF and separators in titles or UIDs cannot inject calendar properties", () => {
  const value = unfold(buildIcs([{ event: { ...event, id: "live\r\nBEGIN:VEVENT", titleJa: "題\r\nBEGIN:VEVENT\rEND:VEVENT\ncomma,semi;slash\\" } }], 30));
  assert.equal(value.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, 1);
  assert.ok(value.includes("SUMMARY:題\\nBEGIN:VEVENT\\nEND:VEVENT\\ncomma\\,semi\\;slash\\\\"));
  assert.equal(value.replaceAll("\r\n", "").includes("\r"), false);
});
test("Japanese and emoji lines fold at 75 UTF-8 bytes without losing characters", () => {
  const title = "音楽🌸".repeat(60);
  const value = buildIcs([{ event: { ...event, titleJa: title } }], 30);
  for (const line of value.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.ok(unfold(value).includes("SUMMARY:" + title + "\r\n"));
});
function tripFixture() {
  return { id: "trip-1", name: "夜の遠征", startDate: "2026-10-27", endDate: "2026-10-28", eventIds: ["live-1"], budgetItems: [], checklist: [], customItems: [
    { id: "all-day", date: "2026-10-28", label: "散歩", kind: "todo" },
    { id: "timed", date: "2026-10-28", time: "10:00", label: "駅へ", kind: "transport" },
  ], travelLegs: [], eventEndOverrides: { "live-1": "01:30" }, bufferMinutes: 30, ignoredConflictKeys: [], createdAt: "2026-10-27T00:00:00Z", updatedAt: "2026-10-27T00:00:00Z" };
}
test("trip export alarms only performances and keeps all-day/timed personal items", () => {
  const late = { ...event, date: "2026-10-27", startTime: "23:30" };
  const value = buildTripIcs(tripFixture(), [{ event: late, venue }], 60);
  assert.equal(value.match(/BEGIN:VEVENT/g)?.length, 3);
  assert.equal(value.match(/BEGIN:VALARM/g)?.length, 1);
  assert.ok(value.includes("DTSTART;VALUE=DATE:20261028"));
  assert.ok(value.includes("DTSTART:20261028T010000Z"));
  assert.ok(value.includes("DTEND:20261027T163000Z"));
});
test("trip export also remains alarm-free unless explicitly selected", () => {
  assert.equal(buildTripIcs(tripFixture(), [{ event, venue }]).includes("VALARM"), false);
});
test("personal deadlines retain their saved absolute instant and task/event semantics", () => {
  const item = { plan: { applications: [] }, task: { id: "due-1", label: "受取", dueAt: "2026-10-28T01:00:00.000Z", timeZone: "Asia/Shanghai" }, event };
  const task = buildDeadlineIcs([item], "task");
  const calendar = buildDeadlineIcs([item], "event");
  assert.ok(task.includes("BEGIN:VTODO")); assert.ok(task.includes("DUE:20261028T010000Z"));
  assert.ok(calendar.includes("DTSTART:20261028T010000Z")); assert.ok(calendar.includes("DTEND:20261028T013000Z"));
  assert.equal(task.includes("VALARM"), false); assert.equal(calendar.includes("VALARM"), false);
});
