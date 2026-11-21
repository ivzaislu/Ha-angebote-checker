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

export type ProductVariant = {
  family: string | null;
  kind: string | null;
  attributes: string[];
};

/** Explicit words only; absence of a label is not evidence of its opposite. */
export function recognizeVariant(name: string, description = ""): ProductVariant {
  const key = productKey(`${name} ${description}`);
  const fish = salmonVariant(name);
  let family: string | null = null;
  let kind: string | null = null;
  if (fish) {
    family = fish === "salmon-ham" ? "pork" : fish === "pollock" ? "pollock" : "salmon";
    kind = fish;
  } else if (/\b(?:hafer|soja|mandel)(?:drink|milch)\b/.test(key)) {
    family = "plant-drink";
    kind = /hafer/.test(key) ? "oat" : /soja/.test(key) ? "soy" : "almond";
  } else if (/\bbuttermilch\b/.test(key)) {
    family = "buttermilk";
    kind = "buttermilk";
  } else if (/\bmilch\b/.test(key)) {
    family = "milk";
    kind = /\bh milch\b|haltbare/.test(key) ? "uht" : /frisch/.test(key) ? "fresh" : null;
  }
  const attributes: string[] = [];
  for (const [label, pattern] of [
    ["organic", /\bbio\b/], ["lactose-free", /\blaktosefrei\b/],
    ["vegan", /\bvegan\b/], ["frozen", /\btiefgekuhlt\b|\btiefkuhl|\btk\b/],
    ["assorted", /\bverschiedene\b|\bversch\b|\bsorten\b/],
  ] as const) if (pattern.test(key)) attributes.push(label);
  const fat = `${name} ${description}`.match(/\b(\d+(?:[,.]\d+)?)\s*%\s*Fett\b/i);
  if (fat) attributes.push(`fat:${Number(fat[1].replace(",", "."))}%`);
  return { family, kind, attributes: attributes.sort() };
}
