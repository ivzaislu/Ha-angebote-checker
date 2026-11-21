import { incompatibleCategory } from "./product-category.ts";
export type ExactQuery = {
  query: string;
  means: string;
  not: string[];
  acceptCategories: string[];
  aliases: string[];
  reject: string[];
  /** Category alone is too broad, the name has to be this product too. */
  requireName: boolean;
  /** Match Lachs inside Lachsfilet, but not as a loose substring of another food. */
  stem?: boolean;
  /** At least one of these must show up in the name or description. */
  need?: string[];
};

/**
 * Checked against live Marktguru offers (PLZ 10115).
 * Each row is the product you meant, and the lookalikes the search must not return.
 */
export const EXACT_QUERIES: ExactQuery[] = [
  {
    query: "Milch",
    means: "Milch",
    not: ["Buttermilch", "Hafermilch", "Milchreis", "Käse", "Joghurt", "Schokolade"],
    acceptCategories: ["milch"],
    aliases: ["vollmilch", "h-milch", "frische milch"],
    reject: ["buttermilch", "hafermilch", "mandelmilch", "kokosmilch", "sojamilch", "kondensmilch", "milchreis", "schoko", "joghurt", "miniatur"],
    requireName: false,
  },
  {
    query: "Buttermilch",
    means: "Buttermilch",
    not: ["normale Milch", "Butter"],
    acceptCategories: ["milch"],
    aliases: [],
    reject: ["hafer"],
    requireName: true,
  },
  {
    query: "Hafermilch",
    means: "Haferdrink",
    not: ["Kuhmilch"],
    acceptCategories: ["milch", "drink", "pflanz"],
    aliases: ["haferdrink"],
    reject: ["buttermilch"],
    requireName: true,
  },
  {
    query: "Gurke",
    means: "frische Gurke",
    not: ["Gewürzgurken", "Essiggurken", "Gurktaler-Likör"],
    acceptCategories: ["gurke"],
    aliases: ["gurken", "salatgurke"],
    reject: ["gewurz", "essig", "senf", "gurktal", "likor", "knax"],
    requireName: false,
  },
  {
    query: "Essiggurken",
    means: "eingelegte Gurken",
    not: ["frische Gurken", "Gurktaler"],
    acceptCategories: ["gemusekonserven", "gurke", "feinkost"],
    aliases: ["gewurzgurken", "senfgurken"],
    reject: ["gurktal", "likor"],
    requireName: true,
  },
  {
    query: "Toilettenpapier",
    means: "trockenes Toilettenpapier",
    not: ["Feuchtes Toilettenpapier"],
    acceptCategories: ["toilettenpapier"],
    aliases: [],
    reject: ["feucht"],
    requireName: false,
  },
  {
    query: "Feuchtes Toilettenpapier",
    means: "feuchtes Toilettenpapier",
    not: ["trockene Rollen"],
    acceptCategories: ["toilettenpapier"],
    aliases: ["feuchtetucher", "feuchtes"],
    reject: [],
    requireName: true,
  },
  {
    query: "Butter",
    means: "Butter",
    not: ["Margarine", "Butterschmalz", "Kekse", "Buttermilch", "Butterkäse"],
    acceptCategories: ["butter"],
    aliases: [],
    reject: ["schmalz", "margarine", "streich", "keks", "cookie", "croissant", "zopf", "stollen", "cracker", "spritz", "buttermilch", "butterkase"],
    requireName: false,
  },
  {
    query: "Käse",
    means: "Käse",
    not: ["Crème fraîche", "Käsekuchen", "Sauce"],
    acceptCategories: ["kase"],
    aliases: [],
    reject: ["fraiche", "kuchen", "sauce", "aufstrich", "quark"],
    requireName: false,
  },
  {
    query: "Brot",
    means: "Brot",
    not: ["Knäckebrot", "Brötchen", "Toast", "Croissants", "Kuchen"],
    acceptCategories: ["brot"],
    aliases: ["schwarzbrot", "vollkornbrot", "landbrot"],
    reject: ["knacke", "toast", "brotchen", "croissant", "kuchen", "aufstrich"],
    requireName: false,
  },
  {
    query: "Brötchen",
    means: "Brötchen",
    not: ["Brot", "Croissants"],
    acceptCategories: ["brotchen"],
    aliases: ["semmel", "semmeln"],
    reject: ["croissant", "kuchen"],
    requireName: false,
  },
  {
    query: "Knäckebrot",
    means: "Knäckebrot",
    not: ["normales Brot"],
    acceptCategories: ["brot"],
    aliases: [],
    reject: [],
    requireName: true,
  },
  {
    query: "Apfel",
    means: "Äpfel",
    not: ["Saft", "Nektar", "Strudel"],
    acceptCategories: ["apfel"],
    aliases: ["apfel"],
    reject: ["saft", "nektar", "schorle", "smoothie", "spritz", "kuchen", "tasche", "mus"],
    requireName: false,
  },
  {
    query: "Apfelsaft",
    means: "Apfelsaft",
    not: ["frische Äpfel"],
    acceptCategories: ["saft", "softdrinks", "getrank"],
    aliases: ["apfelschorle"],
    reject: ["schnaps", "likor"],
    requireName: true,
  },
  {
    query: "Reis",
    means: "Reis",
    not: ["Milchreis", "Koffer", "Reiskocher", "Reiswaffeln"],
    acceptCategories: ["reis"],
    aliases: ["basmatireis", "langkornreis"],
    reject: ["milch", "reise", "koffer", "kocher", "waffel", "schoko", "sitzer"],
    requireName: true,
  },
  {
    query: "Milchreis",
    means: "Milchreis",
    not: ["trockener Reis"],
    acceptCategories: ["dessert", "reis", "milch"],
    aliases: [],
    reject: ["basmati", "langkorn", "kocher"],
    requireName: true,
  },
  {
    query: "Eier",
    means: "Eier",
    not: ["Nudeln", "Eierlikör", "Schokoladeneier"],
    acceptCategories: ["eier"],
    aliases: ["ei"],
    reject: ["teigwaren", "spatzle", "gnocchi", "maultasche", "girasoli", "likor", "schoko", "nudel"],
    requireName: true,
  },
  {
    query: "Wasser",
    means: "Trinkwasser",
    not: ["Wasserkocher", "Filter", "Deodorant", "Sportgetränk"],
    acceptCategories: ["wasser"],
    aliases: ["mineralwasser", "naturelle"],
    reject: ["kocher", "filter", "deo", "karaffe", "sprudler", "waage", "ruder", "spray", "kartusche", "kanne", "sport", "active", "flavou"],
    requireName: false,
  },
  {
    query: "Sahne",
    means: "Sahne",
    not: ["Sahnehering", "Joghurt", "Sauce"],
    acceptCategories: ["sahne"],
    aliases: ["schlagsahne", "kochsahne"],
    reject: ["hering", "joghurt", "wurst", "sauce", "kase", "steif"],
    requireName: false,
  },
  {
    query: "Tomaten",
    means: "frische Tomaten",
    not: ["Tomatenmark", "Sauce", "Ketchup", "passierte Tomaten"],
    acceptCategories: ["tomaten"],
    aliases: ["tomate", "paradeiser", "cherrytomaten", "rispentomaten"],
    reject: ["mark", "ketchup", "sauce", "passier", "konserve", "pizza"],
    requireName: false,
  },
  {
    query: "Tomatenmark",
    means: "Tomatenmark",
    not: ["frische Tomaten"],
    acceptCategories: ["tomaten", "dips", "backzutaten"],
    aliases: [],
    reject: ["sauce", "ketchup"],
    requireName: true,
  },
  {
    query: "Zucker",
    means: "Zucker",
    not: ["zuckerfreie Limonade", "Dekoration", "Sirup"],
    acceptCategories: ["zucker"],
    aliases: ["puderzucker"],
    reject: ["frei", "zero", "limonade", "sirup", "stange", "dekor", "glasur", "hut", "fichte", "vanillin"],
    requireName: false,
  },
  {
    query: "Nudeln",
    means: "Nudeln",
    not: ["Tütensuppe"],
    acceptCategories: ["nudeln", "pasta", "teigwaren"],
    aliases: ["spaghetti", "penne", "pasta"],
    reject: ["tasse", "instant", "suppe"],
    requireName: false,
  },
  {
    query: "Öl",
    means: "Pflanzenöl",
    not: ["Käse in Öl", "Sprühflasche"],
    acceptCategories: ["ole"],
    aliases: ["olivenol", "sonnenblumenol", "rapsol"],
    reject: ["kase", "wurfel", "zerstauber", "karaffe"],
    requireName: false,
  },
  {
    query: "Olivenöl",
    means: "Olivenöl",
    not: ["Sonnenblumenöl", "Rapsöl", "Käse in Öl"],
    acceptCategories: ["ole"],
    aliases: [],
    reject: ["sonnenblume", "raps", "kurbis", "nuss", "kase", "wurfel"],
    requireName: true,
  },
  {
    query: "Salat",
    means: "Blattsalat",
    not: ["Hering", "Kartoffelsalat", "Sauce", "Thunfisch"],
    acceptCategories: ["salate"],
    aliases: ["eisbergsalat", "kopfsalat"],
    reject: ["thunfisch", "hering", "kartoffel", "dressing", "creme", "hummus", "fisch"],
    requireName: true,
  },
  {
    query: "Kartoffeln",
    means: "Kartoffeln",
    not: ["Pommes frites", "Rösti", "Marzipankartoffeln"],
    acceptCategories: ["wurzelgemuse", "kartoffel"],
    aliases: ["erdapfel", "speisekartoffeln"],
    reject: ["pommes", "rosti", "marzipan", "schoko", "herzogin", "longs"],
    requireName: true,
  },
  {
    query: "Pommes",
    means: "Pommes frites",
    not: ["rohe Kartoffeln", "Marzipan"],
    acceptCategories: ["tiefkuhlkartoffeln", "kartoffel"],
    aliases: [],
    reject: ["marzipan", "schoko"],
    requireName: true,
  },
  {
    query: "Joghurt",
    means: "Joghurt",
    not: ["Ayran", "Kefir"],
    acceptCategories: ["joghurt"],
    aliases: [],
    reject: ["ayran", "kefir", "kase"],
    requireName: false,
  },
  {
    query: "Bier",
    means: "Bier",
    not: ["dekorative Miniatur"],
    acceptCategories: ["bier", "alkoholfreies"],
    aliases: ["pils", "helles"],
    reject: ["miniatur", "deko"],
    requireName: false,
  },
  {
    query: "Wein",
    means: "Wein",
    not: ["Glühwein", "Schaumwein", "Aperitif"],
    acceptCategories: ["wein", "rotweine", "weissweine", "roseweine"],
    aliases: [],
    reject: ["gluh", "sekt", "bowle", "aperitif", "spritz", "met"],
    requireName: false,
  },
  {
    query: "Weizenbier",
    means: "Weizenbier",
    not: ["Pils", "Radler"],
    acceptCategories: ["bier"],
    aliases: ["weissbier"],
    reject: ["pils", "radler", "miniatur"],
    requireName: true,
    stem: true,
  },
  {
    query: "Rotwein",
    means: "Rotwein",
    not: ["Weißwein", "Glühwein", "Schaumwein"],
    acceptCategories: ["rotweine"],
    aliases: [],
    reject: ["gluh", "sekt", "weiss"],
    requireName: false,
  },
  {
    query: "Weißwein",
    means: "Weißwein",
    not: ["Rotwein", "Glühwein"],
    acceptCategories: ["weissweine"],
    aliases: ["weisswein"],
    reject: ["gluh", "sekt"],
    requireName: false,
  },
  {
    query: "Eis",
    means: "Speiseeis",
    not: ["Eisbergsalat", "Eier"],
    acceptCategories: ["eis"],
    aliases: ["eiscreme"],
    reject: ["eisberg", "salat", "eier", "likor"],
    requireName: false,
  },
  {
    query: "Fisch",
    means: "Fisch",
    not: ["Fischstäbchen", "Salat", "Garnelen", "Lampen", "Fahrrad"],
    acceptCategories: ["frischfisch", "raucherfisch", "tiefkuhlfisch", "marinierter", "fischkonserven"],
    aliases: [],
    reject: ["stabchen", "salat", "garnele", "muschel", "octopus", "leuchte", "lampe", "bike", "fahrrad"],
    requireName: false,
  },
  {
    query: "Lachs",
    means: "Lachs",
    not: ["Seelachs", "Lachsschinken", "Lammfleisch", "Forelle", "Kuchen"],
    acceptCategories: ["frischfisch", "raucherfisch", "tiefkuhlfisch", "marinierter"],
    aliases: ["lachsfilet"],
    reject: ["seelachs", "schinken", "kasseler", "lamm", "forelle", "aufstrich", "blatterteig"],
    requireName: true,
    stem: true,
  },
  {
    query: "Räucherlachs",
    means: "Räucherlachs",
    not: ["Seelachs", "Schinken"],
    acceptCategories: ["raucherfisch"],
    aliases: ["stremellachs", "wildlachs"],
    reject: ["seelachs", "schinken", "forelle"],
    requireName: true,
    stem: true,
  },
  {
    query: "Seelachs",
    means: "Seelachs, kein Lachs",
    not: ["Lachs"],
    acceptCategories: ["frischfisch", "tiefkuhlfisch", "raucherfisch", "fischkonserven"],
    aliases: [],
    reject: ["raucherlachs", "schinken"],
    requireName: true,
    stem: true,
  },
  {
    query: "Thunfisch",
    means: "Thunfisch",
    not: ["Thunfischsalat", "Lachs"],
    acceptCategories: ["fischkonserven", "frischfisch", "tiefkuhlfisch"],
    aliases: ["thunfischfilet"],
    reject: ["salat", "lachs"],
    requireName: true,
    stem: true,
  },
  {
    query: "Hering",
    means: "Hering",
    not: ["Lachs", "Garnelen"],
    acceptCategories: ["fischkonserven", "marinierter", "raucherfisch", "fischsalate"],
    aliases: ["heringsfilet", "matjes"],
    reject: ["lachs", "garnele"],
    requireName: true,
    stem: true,
  },
  {
    query: "Garnelen",
    means: "Garnelen",
    not: ["Fisch", "Muscheln", "Oktopus"],
    acceptCategories: ["meeresfruchte", "tiefkuhlfisch"],
    aliases: ["garnele"],
    reject: ["muschel", "octopus", "stabchen", "lachs"],
    requireName: true,
    stem: true,
  },
  {
    query: "Fischstäbchen",
    means: "Fischstäbchen",
    not: ["Filet", "Garnelen"],
    acceptCategories: ["tiefkuhlfisch", "tiefkuhlgerichte"],
    aliases: [],
    reject: ["garnele", "lachs"],
    requireName: true,
    stem: true,
  },
  {
    query: "Forelle",
    means: "Forelle",
    not: ["Seelachs"],
    acceptCategories: ["frischfisch", "raucherfisch", "tiefkuhlfisch"],
    aliases: ["lachsforelle"],
    reject: ["seelachs"],
    requireName: true,
    stem: true,
  },
  {
    query: "Rotbarsch",
    means: "Rotbarsch",
    not: ["Lachs", "Fischstäbchen"],
    acceptCategories: ["frischfisch", "raucherfisch", "tiefkuhlfisch"],
    aliases: [],
    reject: ["lachs", "stabchen"],
    requireName: true,
    stem: true,
  },
  {
    query: "Schellfisch",
    means: "Schellfisch",
    not: ["Lachs", "Kabeljau", "Fischstäbchen"],
    acceptCategories: ["frischfisch", "tiefkuhlfisch", "raucherfisch"],
    aliases: [],
    reject: ["lachs", "kabeljau", "dorsch", "stabchen"],
    requireName: true,
    stem: true,
  },
  {
    query: "Kabeljau",
    means: "Kabeljau",
    not: ["Schellfisch", "Lachs", "Fischstäbchen"],
    acceptCategories: ["frischfisch", "tiefkuhlfisch", "raucherfisch", "fischkonserven"],
    aliases: ["dorsch"],
    reject: ["schellfisch", "lachs", "stabchen"],
    requireName: true,
    stem: true,
  },
  {
    query: "Dorade",
    means: "Dorade",
    not: ["Lachs", "Barsch"],
    acceptCategories: ["frischfisch", "tiefkuhlfisch"],
    aliases: [],
    reject: ["lachs", "barsch"],
    requireName: true,
    stem: true,
  },
  {
    query: "Muscheln",
    means: "Muscheln",
    not: ["Garnelen", "Oktopus"],
    acceptCategories: ["meeresfruchte", "tiefkuhlfisch"],
    aliases: ["miesmuscheln"],
    reject: ["garnele", "octopus"],
    requireName: true,
    stem: true,
  },
  {
    query: "Hähnchen",
    means: "Hähnchen",
    not: ["Nuggets", "Wurst", "Gewürz"],
    acceptCategories: ["geflugel", "mariniertes", "tiefkuhlfleisch", "tiefkuhlgerichte"],
    aliases: [],
    reject: ["nugget", "wurst", "wiener", "gewurz", "aspik"],
    requireName: true,
    stem: true,
  },
  {
    query: "Hähnchenbrust",
    means: "Hähnchenbrust",
    not: ["Hähnchenschenkel", "Nuggets", "Wurst"],
    acceptCategories: ["geflugel", "mariniertes", "tiefkuhlfleisch", "tiefkuhlgerichte"],
    aliases: ["brustfilet"],
    reject: ["schenkel", "nugget", "wurst", "gewurz", "keule", "pute"],
    requireName: true,
    stem: true,
    need: ["brust", "innenfilet"],
  },
  {
    query: "Pute",
    means: "Pute",
    not: ["Hähnchen", "Wurst"],
    acceptCategories: ["geflugel", "tiefkuhlfleisch"],
    aliases: ["puten"],
    reject: ["wurst", "hahnchen"],
    requireName: true,
    stem: true,
  },
  {
    query: "Hackfleisch",
    means: "Hackfleisch",
    not: ["Wurst"],
    acceptCategories: ["hackfleisch"],
    aliases: [],
    reject: ["wurst"],
    requireName: false,
  },
  {
    query: "Rinderhack",
    means: "Rinderhackfleisch",
    not: ["Schweinehackfleisch", "gemischtes Hackfleisch"],
    acceptCategories: ["hackfleisch"],
    aliases: ["rinderhackfleisch"],
    reject: ["schwein", "gemischt"],
    requireName: true,
    stem: true,
  },
  {
    query: "Wurst",
    means: "Wurst und Würstchen",
    not: ["Pizza", "Croissant"],
    acceptCategories: ["wurste", "wurstaufschnitt", "koch"],
    aliases: [],
    reject: ["pizza", "croissant"],
    requireName: false,
  },
  {
    query: "Leberwurst",
    means: "Leberwurst",
    not: ["Würstchen", "Schinken"],
    acceptCategories: ["koch", "wurste", "wurstaufschnitt"],
    aliases: [],
    reject: ["pizza", "schinken"],
    requireName: true,
    stem: true,
  },
  {
    query: "Salami",
    means: "Salami",
    not: ["Schinken", "Würstchen"],
    acceptCategories: ["wurste", "wurstaufschnitt", "wurst"],
    aliases: [],
    reject: ["schinken"],
    requireName: true,
    stem: true,
  },
  {
    query: "Schinken",
    means: "Schinken",
    not: ["Croissant", "Schnitzel", "Palatschinken"],
    acceptCategories: ["schinken"],
    aliases: [],
    reject: ["croissant", "schnitzel", "palatschinken", "pizza", "wurst"],
    requireName: false,
  },
  {
    query: "Gouda",
    means: "Gouda",
    not: ["Mozzarella", "Feta", "Parmesan"],
    acceptCategories: ["kase"],
    aliases: [],
    reject: ["mozzarella", "feta", "parmesan"],
    requireName: true,
    stem: true,
  },
  {
    query: "Feta",
    means: "Feta",
    not: ["Gouda", "Mozzarella"],
    acceptCategories: ["kase"],
    aliases: ["hirtenkase"],
    reject: ["gouda", "mozzarella", "parmesan"],
    requireName: true,
    stem: true,
  },
  {
    query: "Mozzarella",
    means: "Mozzarella",
    not: ["Gouda", "Feta"],
    acceptCategories: ["kase"],
    aliases: [],
    reject: ["gouda", "feta", "parmesan"],
    requireName: true,
    stem: true,
  },
  {
    query: "Parmesan",
    means: "Parmesan",
    not: ["Gouda", "Mozzarella"],
    acceptCategories: ["kase"],
    aliases: ["parmigiano"],
    reject: ["gouda", "feta", "mozzarella"],
    requireName: true,
    stem: true,
  },
  {
    query: "Frischkäse",
    means: "Frischkäse",
    not: ["Hartkäse", "Quark"],
    acceptCategories: ["kase"],
    aliases: [],
    reject: ["gouda", "quark", "parmesan"],
    requireName: true,
    stem: true,
  },
  {
    query: "Quark",
    means: "Quark",
    not: ["Käse", "Dessertcreme"],
    acceptCategories: ["kase"],
    aliases: ["topfen"],
    reject: ["gouda", "frischkase"],
    requireName: true,
    stem: true,
  },
  {
    query: "Kaffee",
    means: "Kaffee",
    not: ["Kaffeemaschine", "Service"],
    acceptCategories: ["kaffee"],
    aliases: [],
    reject: ["maschine", "vollautomat", "service", "geschirr"],
    requireName: false,
  },
  {
    query: "Kaffeebohnen",
    means: "Kaffeebohnen",
    not: ["gemahlen", "Kapseln", "Kaffeemaschine"],
    acceptCategories: ["kaffee"],
    aliases: [],
    reject: ["kapsel", "pads", "loslich", "maschine", "gemahlen"],
    requireName: true,
    stem: true,
    need: ["bohnen", "bohne"],
  },
  {
    query: "Filterkaffee",
    means: "Filterkaffee",
    not: ["Kapseln", "Kaffeemaschine"],
    acceptCategories: ["kaffee"],
    aliases: [],
    reject: ["kapsel", "pads", "maschine", "loslich"],
    requireName: true,
    stem: true,
    need: ["gemahlen", "filter"],
  },
  {
    query: "Tee",
    means: "Tee",
    not: ["Teeservice"],
    acceptCategories: ["tee"],
    aliases: ["schwarztee"],
    reject: ["set", "kanne"],
    requireName: false,
  },
  {
    query: "Kräutertee",
    means: "Kräutertee",
    not: ["Schwarztee", "Set"],
    acceptCategories: ["tee"],
    aliases: [],
    reject: ["set", "schwarz"],
    requireName: true,
    stem: true,
    need: ["krauter"],
  },
  {
    query: "Pizza",
    means: "Pizza",
    not: ["Ofen", "Dekoration", "nur Teig"],
    acceptCategories: ["tiefkuhlpizza"],
    aliases: [],
    reject: ["miniatur", "deko", "gutschein", "teig"],
    requireName: true,
    stem: true,
  },
  {
    query: "Müsli",
    means: "Müsli",
    not: ["Riegel", "Schüssel", "Joghurt"],
    acceptCategories: ["muslimischungen", "musli"],
    aliases: [],
    reject: ["riegel", "schale", "joghurt"],
    requireName: true,
    stem: true,
  },
  {
    query: "Cola",
    means: "Cola",
    not: ["Popcorn", "Whisky"],
    acceptCategories: ["softdrinks"],
    aliases: ["pepsi"],
    reject: ["popcorn", "maker", "whisky", "walker"],
    requireName: true,
    stem: true,
  },
];

function fold(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function words(value: string): string[] {
  return fold(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function compact(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, "");
}

export function exactQueryFor(query: string): ExactQuery | null {
  const folded = fold(query.trim());
  if (!folded) return null;
  const ranked = [...EXACT_QUERIES].sort((a, b) => b.query.length - a.query.length);
  for (const rule of ranked) {
    const names = [rule.query, ...rule.aliases.map((alias) => alias)].map((name) => fold(name));
    if (names.includes(folded)) return rule;
  }
  return null;
}

function categoryOk(category: string, accepts: string[]): boolean {
  const first = words(category)[0];
  if (!first || accepts.length === 0) return false;
  return accepts.some((accept) => {
    const stem = fold(accept);
    return first === stem || first === `${stem}n` || first === `${stem}en` || first === `${stem}s`;
  });
}

function nameOk(name: string, rule: ExactQuery): boolean {
  const accepted = [fold(rule.query), ...rule.aliases.map((alias) => fold(alias))];
  const found = words(name);
  if (
    found.some((word) =>
      accepted.some((stem) => {
        if (word === stem || word === `${stem}n` || word === `${stem}en` || word === `${stem}s`) return true;
        if (!rule.stem || stem.length < 4) return false;
        return word.startsWith(stem) || word.endsWith(stem);
      }),
    )
  ) {
    return true;
  }
  const packed = compact(name);
  return accepted.some((stem) => {
    const token = stem.replace(/[^a-z0-9]+/g, "");
    return token.length >= 8 && packed.includes(token);
  });
}

function needed(name: string, description: string, stems: string[] | undefined): boolean {
  if (!stems || stems.length === 0) return true;
  const blob = fold(`${name} ${description}`);
  return stems.some((stem) => blob.includes(fold(stem)));
}

function rejected(name: string, category: string, description: string, stems: string[]): boolean {
  if (stems.length === 0) return false;
  const packed = compact(`${name} ${category} ${description}`);
  const found = words(`${name} ${category}`);
  return stems.some((stem) => {
    const needle = fold(stem);
    return found.includes(needle) || found.some((word) => word.includes(needle)) || packed.includes(needle);
  });
}

function genericName(name: string, query: string): boolean {
  const stem = fold(query.trim());
  if (stem.length < 3) return false;
  return words(name).some((word) => word === stem || word === `${stem}n` || word === `${stem}en` || word === `${stem}s`);
}

/** True when a handwritten reject fired. The learner must not overrule these. */
export function hardReject(query: string, productName: string, description: string, category: string): boolean {
  if (incompatibleCategory(exactQueryFor(query)?.query ?? query,category)) return true;
  const rule = exactQueryFor(query);
  if (!rule) return false;
  return rejected(productName || "", category || "", description || "", rule.reject);
}

/** True when the offer is the product that was asked for, not a lookalike. */
export function offerFits(query: string, productName: string, description: string, category: string): boolean {
  if (incompatibleCategory(exactQueryFor(query)?.query ?? query,category)) return false;
  const rule = exactQueryFor(query);
  const name = productName || "";
  const cat = category || "";
  if (!rule) return genericName(name, query);

  if (rejected(name, cat, description, rule.reject)) return false;
  if (!needed(name, description, rule.need)) return false;
  const catMatches = Boolean(cat) && categoryOk(cat, rule.acceptCategories);
  const named = nameOk(name, rule);
  if (rule.requireName) {
    const described = Boolean(rule.need?.length) && needed(name, description, rule.need) && catMatches;
    if (!named && !described) return false;
    if (!cat) return true;
    return catMatches || rule.acceptCategories.length === 0;
  }
  if (catMatches) return true;
  if (!cat) return named;
  return false;
}
