import { createPendingSourceAdaptersR40 } from "./pending-sources-r40.mjs";
import { createSnowManAllSuiteSourceAdapter } from "./snowman-all-suite-source.mjs";

export function createPendingSourceAdaptersR41(context) {
  return [
    ...createPendingSourceAdaptersR40(context),
    createSnowManAllSuiteSourceAdapter(context),
  ];
}
