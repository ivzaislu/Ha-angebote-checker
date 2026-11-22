/** Conservative category metadata, used by deterministic product rules. */
const fold = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const groups = [
  {
    id: "cosmetics",
    label: "Pflege und Kosmetik",
    domain: "nonfood",
    pattern:
      /gesichtspflege|korperpflege|hautpflege|kosmetik|haarpflege|zahnpflege|deodorant|duschgel|shampoo/,
  },
  {
    id: "cleaning",
    label: "Reinigungs- und Waschmittel",
    domain: "nonfood",
    pattern: /waschmittel|reinigungsmittel|putzmittel|geschirrspulmittel|waschepflege/,
  },
  {
    id: "electronics",
    label: "Technik",
    domain: "nonfood",
    pattern: /elektrogerate|unterhaltungselektronik|computer|smartphone|beleuchtung|leuchtmittel/,
  },
  {
    id: "paper",
    label: "Papier und Hygiene",
    domain: "nonfood",
    pattern: /toilettenpapier|kuchenrolle|taschentucher|hygienepapier/,
  },
  {
    id: "dairy",
    label: "Milchprodukte",
    domain: "food",
    pattern: /milch|joghurt|kase|quark|sahne|butter|margarine/,
  },
  {
    id: "produce",
    label: "Obst und Gemüse",
    domain: "food",
    pattern: /gemuse|obst|(?:^| )fruchte(?: |$)|salat|kartoffel|pilz|champignon/,
  },
  { id: "fish", label: "Fisch und Meeresfrüchte", domain: "food", pattern: /fisch|meeresfruchte/ },
  { id: "meat", label: "Fleisch", domain: "food", pattern: /fleisch|geflugel|wurst|schinken/ },
  {
    id: "drinks",
    label: "Getränke",
    domain: "food",
    pattern: /getranke|saft|kaffee|tee|bier|wein|mineralwasser/,
  },
  { id: "bakery", label: "Brot und Backwaren", domain: "food", pattern: /backwaren|brot|brotchen/ },
  {
    id: "pantry",
    label: "Vorräte und Fertiggerichte",
    domain: "food",
    pattern:
      /lebensmittel|nahrungsmittel|reis|nudeln|konserven|fertiggerichte|tiefkuhlgerichte|cerealien/,
  },
] as const;
export function productCategory(text: string) {
  const normalized = fold(text);
  const matches = groups.filter((group) => group.pattern.test(normalized));
  // Mixed departments are not reliable enough for an exclusion.
  if (!matches.length || new Set(matches.map((group) => group.domain)).size > 1)
    return { id: "unknown", label: "Kategorie unbekannt", domain: "unknown" } as const;
  return { id: matches[0].id, label: matches[0].label, domain: matches[0].domain };
}
const foodQueries = new Set(
  fold(
    "Milch|Buttermilch|Hafermilch|Gurke|Essiggurken|Butter|Käse|Brot|Brötchen|Knäckebrot|Apfel|Apfelsaft|Reis|Milchreis|Eier|Wasser|Sahne|Tomaten|Tomatenmark|Zucker|Nudeln|Öl|Olivenöl|Salat|Kartoffeln|Pommes|Joghurt|Bier|Wein|Weizenbier|Rotwein|Weißwein|Eis|Fisch|Lachs|Räucherlachs|Seelachs|Thunfisch|Hering|Garnelen|Fischstäbchen|Forelle|Rotbarsch|Schellfisch|Kabeljau|Dorade|Muscheln|Hähnchen|Hähnchenbrust|Pute|Hackfleisch|Rinderhack|Wurst|Leberwurst|Salami|Schinken|Gouda|Feta|Mozzarella|Parmesan|Frischkäse|Quark|Kaffee|Kaffeebohnen|Filterkaffee|Tee|Kräutertee|Pizza|Müsli|Cola",
  ).split(" "),
);
export function queryDomain(intent: string): "food" | "nonfood" | "unknown" {
  const normalized = fold(intent);
  if (foodQueries.has(normalized)) return "food";
  if (["toilettenpapier", "feuchtes toilettenpapier"].includes(normalized)) return "nonfood";
  return "unknown";
}
export function incompatibleCategory(intent: string, category: string) {
  const query = queryDomain(intent),
    product = productCategory(category);
  if (query === "unknown" || product.domain === "unknown") return false;
  if (query !== product.domain) return true;
  return query === "nonfood" && product.id !== "paper";
}
