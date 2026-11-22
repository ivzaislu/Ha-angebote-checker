/** German presentation of prices and archive dates. */
export function formatNumber(value: number | string | null, digits = 2): string {
  if (value === null || value === "") return "–";
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "–";
}
export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match) return value || "?";
  return `${match[3]}.${match[2]}.${match[1]}`;
}
/** Display known application errors; transport/database internals use a German fallback. */
export function displayError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const german = /^(?:Für (?:Deutschland|Österreich) |Ungültige Anfrage|Geben Sie einen Produktnamen|Marktguru (?:ist |meldet )|Marktguru-Schlüssel|Das Prospektarchiv )/;
  return german.test(message) ? message : fallback;
}
