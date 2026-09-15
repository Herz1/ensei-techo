import assert from "node:assert/strict";
import { buildPendingRegistry } from "./pending-registry-scaffold-lib.mjs";

const content = buildPendingRegistry({
  previousRound: 25,
  round: 34,
  adapterFile: "example-tour-source.mjs",
  factory: "createExampleTourSourceAdapter",
});

assert.match(content, /pending-sources-r25\.mjs/u);
assert.match(content, /createPendingSourceAdaptersR25/u);
assert.match(content, /example-tour-source\.mjs/u);
assert.match(content, /createExampleTourSourceAdapter/u);
assert.match(content, /export function createPendingSourceAdaptersR34/u);
assert.match(content, /\.\.\.createPendingSourceAdaptersR25\(context\)/u);
assert.match(content, /createExampleTourSourceAdapter\(context\)/u);

assert.throws(
  () => buildPendingRegistry({
    previousRound: 25,
    round: 25,
    adapterFile: "example-tour-source.mjs",
    factory: "createExampleTourSourceAdapter",
  }),
  /必须大于/u,
);
assert.throws(
  () => buildPendingRegistry({
    previousRound: 25,
    round: 34,
    adapterFile: "../escape.mjs",
    factory: "createExampleTourSourceAdapter",
  }),
  /adapterFile/u,
);
assert.throws(
  () => buildPendingRegistry({
    previousRound: 25,
    round: 34,
    adapterFile: "example-tour-source.mjs",
    factory: "not-valid()",
  }),
  /identifier/u,
);

const first = buildPendingRegistry({
  previousRound: null,
  round: 1,
  adapterFile: "first-source.mjs",
  factory: "createFirstSourceAdapter",
});
assert.doesNotMatch(first, /pending-sources-r/u);
assert.match(first, /export function createPendingSourceAdaptersR1/u);

console.log("Pending registry scaffold smoke: ok");
