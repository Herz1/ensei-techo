import { createPendingSourceAdaptersR41 } from "./pending-sources-r41.mjs";
import { createNewsKmkSourceAdapter } from "./news-kmk-source.mjs";

export function createPendingSourceAdaptersR42(context) {
  return [
    ...createPendingSourceAdaptersR41(context),
    createNewsKmkSourceAdapter(context),
  ];
}
