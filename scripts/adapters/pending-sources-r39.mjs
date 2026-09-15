import { createPendingSourceAdaptersR38 } from "./pending-sources-r38.mjs";
import { createVaundyHoroSourceAdapter } from "./vaundy-horo-source.mjs";

export function createPendingSourceAdaptersR39(context) {
  return [
    ...createPendingSourceAdaptersR38(context),
    createVaundyHoroSourceAdapter(context),
  ];
}
