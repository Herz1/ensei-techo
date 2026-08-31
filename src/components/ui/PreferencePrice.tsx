"use client";

import { formatJpy, referenceCurrencyLabel } from "@/lib/currency";
import { usePreferences } from "@/lib/store";

export default function PreferencePrice({
  amountJpy,
  suffix = "",
  className = "",
  referenceClassName = "",
}: {
  amountJpy: number;
  suffix?: string;
  className?: string;
  referenceClassName?: string;
}) {
  const { preferences } = usePreferences();
  const reference = preferences.currency === "JPY"
    ? null
    : referenceCurrencyLabel(amountJpy, preferences.currency);

  return (
    <span className="inline-flex flex-col leading-tight">
      <span className={className}>{formatJpy(amountJpy)}{suffix}</span>
      {reference && (
        <span className={referenceClassName || "mt-1 text-xs font-normal text-zinc-400"}>
          {reference}
        </span>
      )}
    </span>
  );
}
