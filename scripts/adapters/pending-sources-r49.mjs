import { createPendingSourceAdaptersR48 } from "./pending-sources-r48.mjs";
import { createMilkShakarikiSourceAdapter } from "./milk-shakariki-source.mjs";

export function createPendingSourceAdaptersR49(context) {
  return [
    ...createPendingSourceAdaptersR48(context),
    createMilkShakarikiSourceAdapter(context),
  ];
}
