import { createPendingSourceAdaptersR46 } from "./pending-sources-r46.mjs";
import { createKismyft2FanisSeptemberSourceAdapter } from "./kismyft2-fanis-september-source.mjs";

export function createPendingSourceAdaptersR47(context) {
  return [
    ...createPendingSourceAdaptersR46(context),
    createKismyft2FanisSeptemberSourceAdapter(context),
  ];
}
