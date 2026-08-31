import type { DisplayCurrency } from "@/lib/store";

// 汇率为写死的参考值(界面注明「参考汇率,非实时」)
export const JPY_TO_CNY = 0.048;
export const JPY_TO_USD = 0.0066;

export function formatJpy(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

/** "≈ 475 元" */
export function toCnyLabel(jpy: number): string {
  const cny = Math.round(jpy * JPY_TO_CNY);
  return `≈ ${cny.toLocaleString("zh-CN")} 元`;
}

export function referenceCurrencyLabel(
  jpy: number,
  currency: DisplayCurrency,
): string {
  if (currency === "JPY") return formatJpy(jpy);
  if (currency === "USD") {
    return `≈ $${(jpy * JPY_TO_USD).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return toCnyLabel(jpy);
}
