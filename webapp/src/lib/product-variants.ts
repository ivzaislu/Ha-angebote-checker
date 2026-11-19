import { productKey } from "./product-knowledge.ts";

export type SalmonVariant = "salmon" | "smoked-salmon" | "pollock" | "salmon-ham" | null;

/** Conservative labels: unknown fish are not silently treated as salmon. */
export function salmonVariant(name: string): SalmonVariant {
  const key = productKey(name).replace(/\s+/g, "");
  if (/lachsforelle/.test(key)) return null;
  if (/lachsschinken/.test(key)) return "salmon-ham";
  if (/seelachs/.test(key)) return "pollock";
  if (/(raucherlachs|stremellachs|raucherlachsfilet)/.test(key)) return "smoked-salmon";
  if (/lachs/.test(key)) return "salmon";
  return null;
}

/** An ordinary salmon query may include smoked salmon, but never pollock or ham. */
export function compatibleSalmon(query: string, name: string): boolean {
  const q = salmonVariant(query);
  if (!q) return true;
  const actual = salmonVariant(name);
  if (q === "salmon") return actual === "salmon" || actual === "smoked-salmon";
  return actual === q;
}
