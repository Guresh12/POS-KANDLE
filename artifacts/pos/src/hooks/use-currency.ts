import { useGetSettings } from "@workspace/api-client-react";

export function useCurrency() {
  const { data: settings } = useGetSettings();
  const currency = settings?.currency ?? "USD";

  const fmt = (amount: number, decimals = 2) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);

  // Just the symbol/code prefix, e.g. "$" or "KES"
  const symbol =
    new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 })
      .formatToParts(0)
      .find(p => p.type === "currency")?.value ?? currency;

  return { fmt, currency, symbol };
}
