import { exampleKey } from "./product-training.ts";
import { exactQueryFor } from "./exact.ts";
import type { ProductExample } from "./product-net.ts";
/** Explicit reviewed=true is required; unreviewed exported suggestions are skipped. */
export function parseReviewedExamples(content: string): ProductExample[] {
  if (Buffer.byteLength(content, "utf8") > 10_000_000) throw new Error("Review file exceeds 10 MB");
  const rows: ProductExample[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const value = JSON.parse(line) as Record<string, unknown>;
    if (value.reviewed !== true) continue;
    if (
      typeof value.positive !== "boolean" ||
      typeof value.intent !== "string" ||
      typeof value.name !== "string" ||
      !value.intent.trim() ||
      value.intent.length > 80 ||
      value.name.trim().length < 3 ||
      value.name.length > 180
    )
      throw new Error(`Invalid reviewed label on line ${index + 1}`);
    for (const [field, max] of [
      ["category", 180],
      ["description", 600],
    ] as const)
      if (
        value[field] !== undefined &&
        (typeof value[field] !== "string" || (value[field] as string).length > max)
      )
        throw new Error(`Invalid ${field} on line ${index + 1}`);
    rows.push({
      intent: exactQueryFor(value.intent)?.query ?? value.intent.trim(),
      name: value.name.trim(),
      category: (value.category ?? "") as string,
      description: (value.description ?? "") as string,
      positive: value.positive,
      source: "human",
    });
    if (rows.length > 10000) throw new Error("At most 10000 reviewed labels per file");
  }
  if (!rows.length) throw new Error("No explicitly reviewed labels found");
  const unique = new Map<string, ProductExample>();
  for (const row of rows) {
    const key = exampleKey(row),
      previous = unique.get(key);
    if (previous && previous.positive !== row.positive)
      throw new Error("Conflicting reviewed labels in the same file");
    unique.set(key, row);
  }
  return [...unique.values()];
}
