import { createPendingSourceAdaptersR24 } from "./pending-sources-r24.mjs";
import { createGenerationsParallelQuestSourceAdapter } from "./generations-parallel-quest-source.mjs";

export function createPendingSourceAdaptersR25(context) {
  return [
    ...createPendingSourceAdaptersR24(context),
    createGenerationsParallelQuestSourceAdapter(context),
  ];
}
