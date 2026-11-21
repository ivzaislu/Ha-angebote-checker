/** Conservative category metadata, shared by training and deployed decisions. */
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
    label: "Уход и косметика",
    domain: "nonfood",
    pattern:
      /gesichtspflege|korperpflege|hautpflege|kosmetik|haarpflege|zahnpflege|deodorant|duschgel|shampoo/,
  },
  {
    id: "cleaning",
    label: "Бытовая химия",
    domain: "nonfood",
    pattern: /waschmittel|reinigungsmittel|putzmittel|geschirrspulmittel|waschepflege/,
  },
  {
    id: "electronics",
    label: "Техника",
    domain: "nonfood",
    pattern: /elektrogerate|unterhaltungselektronik|computer|smartphone|beleuchtung|leuchtmittel/,
  },
  {
    id: "paper",
    label: "Бумага и гигиена",
    domain: "nonfood",
    pattern: /toilettenpapier|kuchenrolle|taschentucher|hygienepapier/,
  },
  {
    id: "dairy",
    label: "Молочные продукты",
    domain: "food",
    pattern: /milch|joghurt|kase|quark|sahne|butter|margarine/,
  },
  {
    id: "produce",
    label: "Овощи и фрукты",
    domain: "food",
    pattern: /gemuse|obst|(?:^| )fruchte(?: |$)|salat|kartoffel|pilz|champignon/,
  },
  { id: "fish", label: "Рыба и морепродукты", domain: "food", pattern: /fisch|meeresfruchte/ },
  { id: "meat", label: "Мясо", domain: "food", pattern: /fleisch|geflugel|wurst|schinken/ },
  {
    id: "drinks",
    label: "Напитки",
    domain: "food",
    pattern: /getranke|saft|kaffee|tee|bier|wein|mineralwasser/,
  },
  { id: "bakery", label: "Хлеб и выпечка", domain: "food", pattern: /backwaren|brot|brotchen/ },
  {
    id: "pantry",
    label: "Бакалея и готовые блюда",
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
    return { id: "unknown", label: "Категория не определена", domain: "unknown" } as const;
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
/** Queue triage only: food families are not hard exclusions for composite dishes. */
const families = {
  dairy: [
    "Milch",
    "Buttermilch",
    "Hafermilch",
    "Butter",
    "Käse",
    "Milchreis",
    "Sahne",
    "Joghurt",
    "Eis",
    "Gouda",
    "Feta",
    "Mozzarella",
    "Parmesan",
    "Frischkäse",
    "Quark",
  ],
  produce: ["Gurke", "Essiggurken", "Apfel", "Tomaten", "Salat", "Kartoffeln"],
  drinks: [
    "Apfelsaft",
    "Wasser",
    "Bier",
    "Wein",
    "Weizenbier",
    "Rotwein",
    "Weißwein",
    "Kaffee",
    "Kaffeebohnen",
    "Filterkaffee",
    "Tee",
    "Kräutertee",
    "Cola",
  ],
  fish: [
    "Fisch",
    "Lachs",
    "Räucherlachs",
    "Seelachs",
    "Thunfisch",
    "Hering",
    "Garnelen",
    "Fischstäbchen",
    "Forelle",
    "Rotbarsch",
    "Schellfisch",
    "Kabeljau",
    "Dorade",
    "Muscheln",
  ],
  meat: [
    "Eier",
    "Hähnchen",
    "Hähnchenbrust",
    "Pute",
    "Hackfleisch",
    "Rinderhack",
    "Wurst",
    "Leberwurst",
    "Salami",
    "Schinken",
  ],
  bakery: ["Brot", "Brötchen", "Knäckebrot"],
  pantry: ["Reis", "Tomatenmark", "Zucker", "Nudeln", "Öl", "Olivenöl", "Pommes", "Pizza", "Müsli"],
};
const queryFamilies = new Map(
  Object.entries(families).flatMap(([family, queries]) =>
    queries.map((name) => [fold(name), family] as const),
  ),
);
const adjacent = [
  new Set(["dairy", "drinks"]),
  new Set(["produce", "pantry"]),
  new Set(["bakery", "pantry"]),
  new Set(["fish", "meat"]),
];
export function distantReviewCategory(intent: string, category: string) {
  const family = queryFamilies.get(fold(intent)),
    product = productCategory(category).id;
  if (!family || product === "unknown" || family === product) return false;
  return !adjacent.some((pair) => pair.has(family) && pair.has(product));
}
