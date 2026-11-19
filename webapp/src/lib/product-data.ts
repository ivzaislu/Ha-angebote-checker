import type { ProductExample } from "./product-net.ts";
/** Author-written product descriptions and their explicitly accepted intents. */
export type AuthoredProduct = {
  name: string;
  category: string;
  description: string;
  intents: string[];
};
export function authoredDataset(curriculum: AuthoredProduct[], control: AuthoredProduct[]) {
  const intents = [...new Set([...curriculum, ...control].flatMap((row) => row.intents))].sort();
  const expand = (products: AuthoredProduct[]): ProductExample[] =>
    products.flatMap((row) =>
      intents.map((intent) => ({
        intent,
        name: row.name,
        category: row.category,
        description: row.description,
        positive: row.intents.includes(intent),
        source: "curated" as const,
      })),
    );
  return { curriculum: expand(curriculum), control: expand(control) };
}
