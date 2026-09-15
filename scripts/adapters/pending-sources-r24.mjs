import { createAimyonTourSourceAdapter } from "./aimyon-tour-source.mjs";

export function createPendingSourceAdaptersR24(context) {
  return [
    createAimyonTourSourceAdapter(context),
  ];
}
