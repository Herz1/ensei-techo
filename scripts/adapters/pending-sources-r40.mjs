import { createPendingSourceAdaptersR39 } from "./pending-sources-r39.mjs";
import { createSixTonesMileSourceAdapter } from "./sixtones-mile-source.mjs";

export function createPendingSourceAdaptersR40(context) {
  return [
    ...createPendingSourceAdaptersR39(context),
    createSixTonesMileSourceAdapter(context),
  ];
}
