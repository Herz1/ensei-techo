const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const ADAPTER_FILE_RE = /^[a-z0-9][a-z0-9-]*-source\.mjs$/u;

export function buildPendingRegistry({
  previousRound = null,
  round,
  adapterFile,
  factory,
}) {
  if (!Number.isInteger(round) || round <= 0) {
    throw new Error("round 必须是正整数");
  }
  if (previousRound !== null) {
    if (!Number.isInteger(previousRound) || previousRound <= 0) {
      throw new Error("previousRound 必须是正整数或 null");
    }
    if (round <= previousRound) {
      throw new Error(`新 round R${round} 必须大于当前最新 R${previousRound}`);
    }
  }
  if (!ADAPTER_FILE_RE.test(adapterFile)) {
    throw new Error(`adapterFile 不符合 *-source.mjs 规则: ${adapterFile}`);
  }
  if (!IDENTIFIER_RE.test(factory)) {
    throw new Error(`factory 不是合法 JavaScript identifier: ${factory}`);
  }

  const lines = [];
  if (previousRound !== null) {
    lines.push(
      `import { createPendingSourceAdaptersR${previousRound} } from "./pending-sources-r${previousRound}.mjs";`,
    );
  }
  lines.push(`import { ${factory} } from "./${adapterFile}";`);
  lines.push("");
  lines.push(`export function createPendingSourceAdaptersR${round}(context) {`);
  lines.push("  return [");
  if (previousRound !== null) {
    lines.push(`    ...createPendingSourceAdaptersR${previousRound}(context),`);
  }
  lines.push(`    ${factory}(context),`);
  lines.push("  ];");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}
