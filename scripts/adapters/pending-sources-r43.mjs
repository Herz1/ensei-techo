import { createPendingSourceAdaptersR42 } from "./pending-sources-r42.mjs";
import { createAbczLoveSourceAdapter } from "./abcz-love-source.mjs";

export function createPendingSourceAdaptersR43(context) {
  return [
    ...createPendingSourceAdaptersR42(context),
    createAbczLoveSourceAdapter(context),
  ];
}
