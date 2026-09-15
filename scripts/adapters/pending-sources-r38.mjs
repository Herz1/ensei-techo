import { createPendingSourceAdaptersR37 } from "./pending-sources-r37.mjs";
import { createIniCityOfLightsSourceAdapter } from "./ini-city-of-lights-source.mjs";

export function createPendingSourceAdaptersR38(context) {
  return [
    ...createPendingSourceAdaptersR37(context),
    createIniCityOfLightsSourceAdapter(context),
  ];
}
