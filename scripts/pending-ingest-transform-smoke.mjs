import assert from "node:assert/strict";
import { injectPendingRegistry } from "./pending-ingest-transform.mjs";

const source = `
import { createSomething } from "./something.mjs";
import { createRawEvidenceStore } from "./raw-evidence-store.mjs";

async function main() {
  const adapterContext = { generatedAt: "now" };
  const adapters = [
    createSomething(adapterContext),
  ];
  const rawStore = createRawEvidenceStore({
    rawRoot: "raw",
  });
  return { adapters, rawStore };
}
`;

const transformed = injectPendingRegistry(source);
assert.match(
  transformed,
  /import \{ createPendingSourceAdapters \} from "\.\/adapters\/pending-source-registry\.mjs";/u,
);
assert.match(
  transformed,
  /adapters\.push\(\.\.\.await createPendingSourceAdapters\(adapterContext\)\);/u,
);
assert.equal(
  transformed.indexOf("createPendingSourceAdapters") <
    transformed.indexOf('import { createRawEvidenceStore }'),
  true,
);
assert.equal(
  transformed.indexOf("adapters.push") <
    transformed.indexOf("const rawStore = createRawEvidenceStore"),
  true,
);
assert.equal(
  transformed.split("adapters.push(...await createPendingSourceAdapters(adapterContext));").length - 1,
  1,
);

assert.throws(
  () => injectPendingRegistry(source.replace('import { createRawEvidenceStore } from "./raw-evidence-store.mjs";\n', "")),
  /raw store import marker/u,
);
assert.throws(
  () => injectPendingRegistry(source.replace("  const adapters = [", "  const sources = [")),
  /adapters marker/u,
);
assert.throws(
  () => injectPendingRegistry(source.replace("  const rawStore = createRawEvidenceStore({", "  const store = createRawEvidenceStore({")),
  /raw store construction marker/u,
);
assert.throws(
  () => injectPendingRegistry(transformed),
  /拒绝重复注入/u,
);

console.log("Pending ingest transform smoke: ok");
