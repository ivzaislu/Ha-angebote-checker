import type { Deal } from "@/lib/deals";

/** German leaflet week runs Wednesday to Tuesday. */
export function flyerWeekStart(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const sinceWednesday = (start.getDay() + 4) % 7;
  start.setDate(start.getDate() - sinceWednesday);
  return start;
}

export function isCurrentFlyer(iso: string, now = new Date()): boolean {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  return at >= flyerWeekStart(now);
}

export function flyerLabel(now = new Date()): string {
  const start = flyerWeekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (date: Date) => date.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function dealStillOn(deal: Deal, now = new Date()): boolean {
  if (!deal.validTo) return true;
  const [day, month, year] = deal.validTo.split(".");
  if (!day || !month || !year) return true;
  const end = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59);
  if (Number.isNaN(end.getTime())) return true;
  return end >= now;
}

export function assortmentNames(deals: Deal[], limit = 4): string[] {
  const names: string[] = [];
  for (const deal of deals) {
    const name = deal.productName.trim();
    if (!name || names.some((entry) => entry.toLowerCase() === name.toLowerCase())) continue;
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
}
