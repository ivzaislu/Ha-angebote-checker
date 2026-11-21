const PRODUCTS = [
  "Apfel",
  "Äpfel",
  "Apfelsaft",
  "Apfelschorle",
  "Aubergine",
  "Avocado",
  "Bacon",
  "Banane",
  "Bananen",
  "Basmatireis",
  "Bier",
  "Birne",
  "Blumenkohl",
  "Bohnen",
  "Brot",
  "Brötchen",
  "Brokkoli",
  "Bulgur",
  "Butter",
  "Buttermilch",
  "Champignons",
  "Cherrytomaten",
  "Chips",
  "Clementinen",
  "Cola",
  "Cornflakes",
  "Croissant",
  "Deodorant",
  "Dorade",
  "Duschgel",
  "Eier",
  "Eis",
  "Eisbergsalat",
  "Erdäpfel",
  "Erdbeeren",
  "Essig",
  "Essiggurken",
  "Feta",
  "Filterkaffee",
  "Fisch",
  "Fischstäbchen",
  "Forelle",
  "Frischhaltefolie",
  "Frischkäse",
  "Garnelen",
  "Geschirrspültabs",
  "Geschirrspültabs",
  "Gewürzgurken",
  "Gouda",
  "Gummibärchen",
  "Gurke",
  "Gurken",
  "Haferflocken",
  "Hafermilch",
  "Hackfleisch",
  "Hähnchen",
  "Hähnchenbrust",
  "Heidelbeeren",
  "Hering",
  "Honig",
  "Ingwer",
  "Joghurt",
  "Kabeljau",
  "Kaffee",
  "Kaffeebohnen",
  "Karotten",
  "Kartoffeln",
  "Käse",
  "Ketchup",
  "Kichererbsen",
  "Kiwi",
  "Knoblauch",
  "Knäckebrot",
  "Kohl",
  "Kräutertee",
  "Küchenrolle",
  "Lachs",
  "Lasagne",
  "Lasagne",
  "Lauch",
  "Leberwurst",
  "Linsen",
  "Mandeldrink",
  "Mango",
  "Margarine",
  "Marmeladen",
  "Matjes",
  "Mayonnaise",
  "Mehl",
  "Milch",
  "Mineralwasser",
  "Mozzarella",
  "Muscheln",
  "Müsli",
  "Müllbeutel",
  "Nudeln",
  "Nutella",
  "Olivenöl",
  "Orange",
  "Orangensaft",
  "Paprika",
  "Paradeiser",
  "Parmesan",
  "Penne",
  "Pfeffer",
  "Pizza",
  "Pommes",
  "Pute",
  "Quark",
  "Radler",
  "Räucherlachs",
  "Reis",
  "Rinderhack",
  "Rosenkohl",
  "Rotbarsch",
  "Rotwein",
  "Sahne",
  "Salami",
  "Salat",
  "Salatgurke",
  "Salz",
  "Schellfisch",
  "Schinken",
  "Schlagsahne",
  "Schokolade",
  "Schwarzbrot",
  "Schweinenacken",
  "Seelachs",
  "Seife",
  "Sekt",
  "Semmel",
  "Senf",
  "Shampoo",
  "Sojadrink",
  "Spaghetti",
  "Spinat",
  "Spülmittel",
  "Taschentücher",
  "Tee",
  "Thunfisch",
  "Toast",
  "Toilettenpapier",
  "Tomaten",
  "Tomatenmark",
  "Topfen",
  "Trauben",
  "Vollkornbrot",
  "Waschmittel",
  "Wasser",
  "Wein",
  "Weißwein",
  "Weizenbier",
  "Windeln",
  "Wurst",
  "Zahnpasta",
  "Zitrone",
  "Zucchini",
  "Zucker",
  "Zwiebeln",
];

export const CATEGORIES = [
  { id: "veg", label: "Gemüse" },
  { id: "fruit", label: "Obst" },
  { id: "dairy", label: "Milchprodukte" },
  { id: "meat", label: "Fleisch und Fisch" },
  { id: "bakery", label: "Brot" },
  { id: "drinks", label: "Getränke" },
  { id: "pantry", label: "Vorräte" },
  { id: "sweet", label: "Süßigkeiten" },
  { id: "home", label: "Haushalt" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

const STEMS: { id: CategoryId; words: string[] }[] = [
  {
    id: "home",
    words: [
      "toiletten",
      "kuchenrolle",
      "taschent",
      "spulmittel",
      "waschmittel",
      "shampoo",
      "dusch",
      "zahnpasta",
      "deodorant",
      "seife",
      "windel",
      "mullbeutel",
      "frischhalte",
      "folie",
      "geschirr",
    ],
  },
  {
    id: "drinks",
    words: [
      "saft",
      "schorle",
      "bier",
      "wein",
      "cola",
      "wasser",
      "tee",
      "krauter",
      "kaffee",
      "radler",
      "sekt",
      "mineral",
      "drink",
      "likor",
    ],
  },
  {
    id: "dairy",
    words: [
      "milch",
      "joghurt",
      "kase",
      "butter",
      "quark",
      "sahne",
      "topfen",
      "mozzarella",
      "gouda",
      "feta",
      "parmesan",
      "margarine",
    ],
  },
  {
    id: "meat",
    words: [
      "hack",
      "hahnchen",
      "pute",
      "schwein",
      "rind",
      "wurst",
      "schinken",
      "salami",
      "bacon",
      "lachs",
      "thunfisch",
      "garnele",
      "fisch",
      "hering",
      "forelle",
      "rotbarsch",
      "kabeljau",
      "schellfisch",
      "dorade",
      "matjes",
      "muschel",
    ],
  },
  {
    id: "bakery",
    words: ["brot", "brotchen", "toast", "croissant", "semmel", "knacke"],
  },
  {
    id: "sweet",
    words: ["schoko", "chips", "gummib", "eis", "nutella", "marmelad"],
  },
  {
    id: "fruit",
    words: [
      "apfel",
      "banane",
      "birne",
      "orange",
      "erdbeer",
      "heidelbeer",
      "traube",
      "zitrone",
      "kiwi",
      "mango",
      "clementine",
    ],
  },
  {
    id: "veg",
    words: [
      "gurke",
      "tomate",
      "paprika",
      "zwiebel",
      "kartoffel",
      "karotte",
      "salat",
      "spinat",
      "brokkoli",
      "blumenkohl",
      "zucchini",
      "aubergine",
      "champignon",
      "knoblauch",
      "ingwer",
      "lauch",
      "kohl",
      "avocado",
      "paradeiser",
      "erdapfel",
      "gemuse",
    ],
  },
  {
    id: "pantry",
    words: [
      "reis",
      "nudel",
      "spaghetti",
      "penne",
      "mehl",
      "zucker",
      "salz",
      "pfeffer",
      "oliven",
      "ol",
      "essig",
      "ketchup",
      "senf",
      "mayonnaise",
      "hafer",
      "musli",
      "cornflake",
      "linse",
      "kicher",
      "bulgur",
      "honig",
      "bohnen",
      "pizza",
      "pommes",
      "lasagne",
      "ei",
      "eier",
    ],
  },
];

function fold(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ß", "ss");
}

function hit(folded: string, stem: string): boolean {
  const parts = folded.split(/[^a-z0-9]+/).filter(Boolean);
  return parts.some(
    (part) => part === stem || (stem.length >= 4 && (part.startsWith(stem) || part.includes(stem))),
  );
}

export function categoryOf(name: string): CategoryId | null {
  if (!name) return null;
  const folded = fold(name);
  if (!folded) return null;
  for (const group of STEMS) {
    if (group.words.some((word) => hit(folded, word))) return group.id;
  }
  return null;
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

export function inCategories(name: string, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const id = categoryOf(name);
  return id != null && selected.includes(id);
}

export function dealInCategory(
  item: string,
  category: string,
  productName: string,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const id = categoryOf(category) ?? categoryOf(productName) ?? categoryOf(item);
  return id != null && selected.includes(id);
}

export function suggestProducts(query: string, categories: string[] = [], limit = 8): string[] {
  const needle = fold(query.trim());
  if (needle.length < 2) return [];
  const pool = PRODUCTS.filter((name) => inCategories(name, categories));
  const prefix: string[] = [];
  const inside: string[] = [];
  for (const name of pool) {
    const folded = fold(name);
    if (folded.startsWith(needle)) prefix.push(name);
    else if (folded.includes(needle)) inside.push(name);
  }
  return [...prefix, ...inside].slice(0, limit);
}

export function productsIn(categories: string[], limit = 8): string[] {
  return PRODUCTS.filter((name) => inCategories(name, categories)).slice(0, limit);
}
