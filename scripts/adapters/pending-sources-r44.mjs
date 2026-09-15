import { createPendingSourceAdaptersR43 } from "./pending-sources-r43.mjs";
import { createNaniwaNd5SourceAdapter } from "./naniwa-nd5-source.mjs";

export function createPendingSourceAdaptersR44(context) {
  return [
    ...createPendingSourceAdaptersR43(context),
    createNaniwaNd5SourceAdapter(context),
  ];
}
