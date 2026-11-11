import { parseTradedItemName } from "../config/shared/tradeItemName";
import * as wfmCatalog from "./wfmCatalog";
import { localizedToEnglishItemName } from "./gameLocale";

export function lookupTradedCatalogItem(
  displayName: string,
): ReturnType<typeof wfmCatalog.lookupByName> {
  const { baseName } = parseTradedItemName(displayName);
  if (!baseName) return null;
  // EE.log gives the name in the game's language; the catalog joins on English.
  // Resolve back to English first, then fall back to the raw name (already
  // English, or a locale with no table) so nothing regresses.
  const english = localizedToEnglishItemName(baseName) ?? baseName;
  return (
    wfmCatalog.lookupByName(english) ||
    wfmCatalog.lookupByName(english.replace(/ Blueprint$/i, ""))
  );
}
