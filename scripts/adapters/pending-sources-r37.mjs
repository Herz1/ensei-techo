import { createPendingSourceAdaptersR25 } from "./pending-sources-r25.mjs";
import { createFantasticsSunflowerSourceAdapter } from "./fantastics-sunflower-source.mjs";

export function createPendingSourceAdaptersR37(context) {
  return [
    ...createPendingSourceAdaptersR25(context),
    createFantasticsSunflowerSourceAdapter(context),
  ];
}
