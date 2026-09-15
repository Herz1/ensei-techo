import { createPendingSourceAdaptersR47 } from "./pending-sources-r47.mjs";
import { createRockForYouSourceAdapter } from "./rock-for-you-source.mjs";

export function createPendingSourceAdaptersR48(context) {
  return [
    ...createPendingSourceAdaptersR47(context),
    createRockForYouSourceAdapter(context),
  ];
}
