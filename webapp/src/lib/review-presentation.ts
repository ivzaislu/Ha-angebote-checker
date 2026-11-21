import { normalizedText } from "./product-net.ts";

export type ReviewPresentationSource = {
  country: string;
  offer_id: string;
  name: string;
  offer_name?: string | null;
  catalog_name?: string | null;
};
/** Display-only context: never change the archived classifier text or label key. */
export function reviewPresentation(source: ReviewPresentationSource) {
  const offerName = source.offer_name?.trim() || null;
  const catalogName = source.catalog_name?.trim() || source.name;
  const original = normalizedText(source.name);
  const alternative = normalizedText(offerName ?? "");
  // Use a genuinely longer source title containing the original product name.
  // Other differing names remain separately attributed, without invented joins.
  const displayName =
    offerName &&
    alternative.length > original.length &&
    ` ${alternative} `.includes(` ${original} `)
      ? offerName
      : source.name;
  const otherNames = [...new Set([offerName, catalogName, source.name])].filter(
    (name): name is string =>
      Boolean(name) && normalizedText(name!) !== normalizedText(displayName),
  );
  const imageUrl =
    ["de", "at"].includes(source.country) && source.offer_id?.trim()
      ? `https://cdn.marktguru.${source.country}/api/v1/offers/${encodeURIComponent(source.offer_id)}/images/default/0/medium.webp`
      : null;
  return {
    displayName,
    otherNames,
    imageUrl,
    shortName: displayName.trim().split(/\s+/).length === 1 && otherNames.length === 0,
  };
}
