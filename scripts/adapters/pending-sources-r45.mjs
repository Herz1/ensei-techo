import { createPendingSourceAdaptersR44 } from "./pending-sources-r44.mjs";
import { createTakuyaCheckpointSourceAdapter } from "./takuya-checkpoint-source.mjs";

export function createPendingSourceAdaptersR45(context) {
  return [
    ...createPendingSourceAdaptersR44(context),
    createTakuyaCheckpointSourceAdapter(context),
  ];
}
