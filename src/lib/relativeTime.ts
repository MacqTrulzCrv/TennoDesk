import type { Translator } from "./i18n.js";

/** "Updated Xs/m/h/d ago" for a fetch timestamp. Shared so the order-book panel
 *  and the inventory cards phrase price freshness the same way. */
export function formatUpdatedLabel(
  t: Translator,
  timestamp: number | null | undefined,
  nowMs: number,
): string {
  if (!timestamp || timestamp <= 0) return t("common.updatedRecently");
  const ageSec = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (ageSec < 5) return t("common.updatedJustNow");
  if (ageSec < 60) return t("common.updatedSAgo", { sec: ageSec });
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return t("common.updatedMAgo", { min: ageMin });
  const ageHr = Math.floor(ageMin / 60);
  if (ageHr < 24) return t("common.updatedHAgo", { hr: ageHr });
  return t("common.updatedDAgo", { days: Math.floor(ageHr / 24) });
}
