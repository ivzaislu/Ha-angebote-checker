export type ExactQuery = {
  query: string;
  means: string;
  not: string[];
  acceptCategories: string[];
  aliases: string[];
  reject: string[];
  /** Category alone is too broad, the name has to be this product too. */
  requireName: boolean;
};

/**
 * Checked against live Marktguru offers (PLZ 10115).
 * Each row is the product you meant, and the lookalikes the search must not return.
 */
export const EXACT_QUERIES: ExactQuery[] = [
  {
    query: "Milch",
    means: "молоко",
    not: ["Buttermilch", "Hafermilch", "Milchreis", "сыр", "йогурт", "шоколад"],
    acceptCategories: ["milch"],
    aliases: ["vollmilch", "h-milch", "frische milch"],
    reject: ["buttermilch", "hafermilch", "mandelmilch", "kokosmilch", "sojamilch", "kondensmilch", "milchreis", "schoko", "joghurt", "miniatur"],
    requireName: false,
  },
  {
    query: "Buttermilch",
    means: "пахта",
    not: ["обычное молоко", "масло"],
    acceptCategories: ["milch"],
    aliases: [],
    reject: ["hafer"],
    requireName: true,
  },
  {
    query: "Hafermilch",
    means: "овсяный напиток",
    not: ["коровье молоко"],
    acceptCategories: ["milch", "drink", "pflanz"],
    aliases: ["haferdrink"],
    reject: ["buttermilch"],
    requireName: true,
  },
  {
    query: "Gurke",
    means: "свежий огурец",
    not: ["Gewürzgurken", "Essiggurken", "ликёр Gurktaler"],
    acceptCategories: ["gurke"],
    aliases: ["gurken", "salatgurke"],
    reject: ["gewurz", "essig", "senf", "gurktal", "likor", "knax"],
    requireName: false,
  },
  {
    query: "Essiggurken",
    means: "маринованные огурцы",
    not: ["свежие огурцы", "Gurktaler"],
    acceptCategories: ["gemusekonserven", "gurke", "feinkost"],
    aliases: ["gewurzgurken", "senfgurken"],
    reject: ["gurktal", "likor"],
    requireName: true,
  },
  {
    query: "Toilettenpapier",
    means: "сухая туалетная бумага",
    not: ["Feuchtes Toilettenpapier"],
    acceptCategories: ["toilettenpapier"],
    aliases: [],
    reject: ["feucht"],
    requireName: false,
  },
  {
    query: "Feuchtes Toilettenpapier",
    means: "влажная туалетная бумага",
    not: ["сухие рулоны"],
    acceptCategories: ["toilettenpapier"],
    aliases: ["feuchtetucher", "feuchtes"],
    reject: [],
    requireName: true,
  },
  {
    query: "Butter",
    means: "сливочное масло",
    not: ["маргарин", "Butterschmalz", "печенье", "Buttermilch", "Butterkäse"],
    acceptCategories: ["butter"],
    aliases: [],
    reject: ["schmalz", "margarine", "streich", "keks", "cookie", "croissant", "zopf", "stollen", "cracker", "spritz", "buttermilch", "butterkase"],
    requireName: false,
  },
  {
    query: "Käse",
    means: "сыр",
    not: ["Crème fraîche", "чизкейк", "соус"],
    acceptCategories: ["kase"],
    aliases: ["gouda", "feta", "mozzarella", "emmentaler", "frischkase"],
    reject: ["fraiche", "kuchen", "sauce", "aufstrich"],
    requireName: false,
  },
  {
    query: "Brot",
    means: "хлеб",
    not: ["Knäckebrot", "Brötchen", "Toast", "круассаны", "пироги"],
    acceptCategories: ["brot"],
    aliases: ["schwarzbrot", "vollkornbrot", "landbrot"],
    reject: ["knacke", "toast", "brotchen", "croissant", "kuchen", "aufstrich"],
    requireName: false,
  },
  {
    query: "Brötchen",
    means: "булочки",
    not: ["хлеб", "круассаны"],
    acceptCategories: ["brotchen"],
    aliases: ["semmel", "semmeln"],
    reject: ["croissant", "kuchen"],
    requireName: false,
  },
  {
    query: "Knäckebrot",
    means: "хлебцы",
    not: ["обычный хлеб"],
    acceptCategories: ["brot"],
    aliases: [],
    reject: [],
    requireName: true,
  },
  {
    query: "Apfel",
    means: "яблоки",
    not: ["сок", "нектар", "штрудель"],
    acceptCategories: ["apfel"],
    aliases: ["apfel"],
    reject: ["saft", "nektar", "schorle", "smoothie", "spritz", "kuchen", "tasche", "mus"],
    requireName: false,
  },
  {
    query: "Apfelsaft",
    means: "яблочный сок",
    not: ["свежие яблоки"],
    acceptCategories: ["saft", "softdrinks", "getrank"],
    aliases: ["apfelschorle"],
    reject: ["schnaps", "likor"],
    requireName: true,
  },
  {
    query: "Reis",
    means: "рис",
    not: ["Milchreis", "чемодан", "рисоварка", "рисовые хлебцы"],
    acceptCategories: ["reis"],
    aliases: ["basmatireis", "langkornreis"],
    reject: ["milch", "reise", "koffer", "kocher", "waffel", "schoko", "sitzer"],
    requireName: true,
  },
  {
    query: "Milchreis",
    means: "молочный рис",
    not: ["сухой рис"],
    acceptCategories: ["dessert", "reis", "milch"],
    aliases: [],
    reject: ["basmati", "langkorn", "kocher"],
    requireName: true,
  },
  {
    query: "Eier",
    means: "яйца",
    not: ["лапша", "яичный ликёр", "шоколадные яйца"],
    acceptCategories: ["eier"],
    aliases: ["ei"],
    reject: ["teigwaren", "spatzle", "gnocchi", "maultasche", "girasoli", "likor", "schoko", "nudel"],
    requireName: true,
  },
  {
    query: "Wasser",
    means: "питьевая вода",
    not: ["чайник", "фильтр", "дезодорант", "спортнапиток"],
    acceptCategories: ["wasser"],
    aliases: ["mineralwasser", "naturelle"],
    reject: ["kocher", "filter", "deo", "karaffe", "sprudler", "waage", "ruder", "spray", "kartusche", "kanne", "sport", "active", "flavou"],
    requireName: false,
  },
  {
    query: "Sahne",
    means: "сливки",
    not: ["сельдь в сливках", "йогурт", "соус"],
    acceptCategories: ["sahne"],
    aliases: ["schlagsahne", "kochsahne"],
    reject: ["hering", "joghurt", "wurst", "sauce", "kase", "steif"],
    requireName: false,
  },
  {
    query: "Tomaten",
    means: "свежие томаты",
    not: ["Tomatenmark", "соус", "кетчуп", "пассированные"],
    acceptCategories: ["tomaten"],
    aliases: ["tomate", "paradeiser", "cherrytomaten", "rispentomaten"],
    reject: ["mark", "ketchup", "sauce", "passier", "konserve", "pizza"],
    requireName: false,
  },
  {
    query: "Tomatenmark",
    means: "томатная паста",
    not: ["свежие томаты"],
    acceptCategories: ["tomaten", "dips", "backzutaten"],
    aliases: [],
    reject: ["sauce", "ketchup"],
    requireName: true,
  },
  {
    query: "Zucker",
    means: "сахар",
    not: ["лимонад без сахара", "декор", "сироп"],
    acceptCategories: ["zucker"],
    aliases: ["puderzucker"],
    reject: ["frei", "zero", "limonade", "sirup", "stange", "dekor", "glasur", "hut", "fichte", "vanillin"],
    requireName: false,
  },
  {
    query: "Nudeln",
    means: "макароны",
    not: ["суп из пакетика"],
    acceptCategories: ["nudeln", "pasta", "teigwaren"],
    aliases: ["spaghetti", "penne", "pasta"],
    reject: ["tasse", "instant", "suppe"],
    requireName: false,
  },
  {
    query: "Öl",
    means: "растительное масло",
    not: ["сыр в масле", "распылитель"],
    acceptCategories: ["ole"],
    aliases: ["olivenol", "sonnenblumenol", "rapsol"],
    reject: ["kase", "wurfel", "zerstauber", "karaffe"],
    requireName: false,
  },
  {
    query: "Olivenöl",
    means: "оливковое масло",
    not: ["подсолнечное", "рапсовое", "сыр в масле"],
    acceptCategories: ["ole"],
    aliases: [],
    reject: ["sonnenblume", "raps", "kurbis", "nuss", "kase", "wurfel"],
    requireName: true,
  },
  {
    query: "Salat",
    means: "зелёный салат",
    not: ["сельдь", "картофельный салат", "соус", "тунец"],
    acceptCategories: ["salate"],
    aliases: ["eisbergsalat", "kopfsalat"],
    reject: ["thunfisch", "hering", "kartoffel", "dressing", "creme", "hummus", "fisch"],
    requireName: true,
  },
  {
    query: "Kartoffeln",
    means: "картофель",
    not: ["фри", "рёсти", "марципановые картофелины"],
    acceptCategories: ["wurzelgemuse", "kartoffel"],
    aliases: ["erdapfel", "speisekartoffeln"],
    reject: ["pommes", "rosti", "marzipan", "schoko", "herzogin", "longs"],
    requireName: true,
  },
  {
    query: "Pommes",
    means: "картофель фри",
    not: ["сырая картошка", "марципан"],
    acceptCategories: ["tiefkuhlkartoffeln", "kartoffel"],
    aliases: [],
    reject: ["marzipan", "schoko"],
    requireName: true,
  },
  {
    query: "Joghurt",
    means: "йогурт",
    not: ["Ayran", "кефир"],
    acceptCategories: ["joghurt"],
    aliases: [],
    reject: ["ayran", "kefir", "kase"],
    requireName: false,
  },
  {
    query: "Bier",
    means: "пиво",
    not: ["декоративная миниатюра"],
    acceptCategories: ["bier", "alkoholfreies"],
    aliases: ["pils", "helles", "weizenbier"],
    reject: ["miniatur", "deko"],
    requireName: false,
  },
  {
    query: "Wein",
    means: "вино",
    not: ["глинтвейн", "игристое", "аперитив"],
    acceptCategories: ["wein", "rotweine", "weissweine", "roseweine"],
    aliases: ["rotwein", "weisswein"],
    reject: ["gluh", "sekt", "bowle", "aperitif", "spritz", "met"],
    requireName: false,
  },
  {
    query: "Eis",
    means: "мороженое",
    not: ["Eisbergsalat", "яйца"],
    acceptCategories: ["eis"],
    aliases: ["eiscreme"],
    reject: ["eisberg", "salat", "eier", "likor"],
    requireName: false,
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
      accepted.some((stem) => word === stem || word === `${stem}n` || word === `${stem}en` || word === `${stem}s`),
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

/** True when the offer is the product that was asked for, not a lookalike. */
export function offerFits(query: string, productName: string, description: string, category: string): boolean {
  const rule = exactQueryFor(query);
  const name = productName || "";
  const cat = category || "";
  if (!rule) return genericName(name, query);

  if (rejected(name, cat, description, rule.reject)) return false;
  const catMatches = Boolean(cat) && categoryOk(cat, rule.acceptCategories);
  const named = nameOk(name, rule);
  if (rule.requireName) {
    if (!named) return false;
    if (!cat) return true;
    return catMatches || rule.acceptCategories.length === 0;
  }
  if (catMatches) return true;
  if (!cat) return named;
  return false;
}
