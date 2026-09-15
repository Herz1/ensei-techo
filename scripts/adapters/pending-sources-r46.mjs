import { createPendingSourceAdaptersR45 } from "./pending-sources-r45.mjs";
import { createKamiyamaInputOutputSourceAdapter } from "./kamiyama-input-output-source.mjs";

export function createPendingSourceAdaptersR46(context) {
  return [
    ...createPendingSourceAdaptersR45(context),
    createKamiyamaInputOutputSourceAdapter(context),
  ];
}
