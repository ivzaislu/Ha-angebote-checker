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
    aliases: [],
    reject: ["fraiche", "kuchen", "sauce", "aufstrich", "quark"],
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
    aliases: ["pils", "helles"],
    reject: ["miniatur", "deko"],
    requireName: false,
  },
  {
    query: "Wein",
    means: "вино",
    not: ["глинтвейн", "игристое", "аперитив"],
    acceptCategories: ["wein", "rotweine", "weissweine", "roseweine"],
    aliases: [],
    reject: ["gluh", "sekt", "bowle", "aperitif", "spritz", "met"],
    requireName: false,
  },
  {
    query: "Weizenbier",
    means: "пшеничное пиво",
    not: ["пильзнер", "радлер"],
    acceptCategories: ["bier"],
    aliases: ["weissbier"],
    reject: ["pils", "radler", "miniatur"],
    requireName: true,
    stem: true,
  },
  {
    query: "Rotwein",
    means: "красное вино",
    not: ["белое", "глинтвейн", "игристое"],
    acceptCategories: ["rotweine"],
    aliases: [],
    reject: ["gluh", "sekt", "weiss"],
    requireName: false,
  },
  {
    query: "Weißwein",
    means: "белое вино",
    not: ["красное", "глинтвейн"],
    acceptCategories: ["weissweine"],
    aliases: ["weisswein"],
    reject: ["gluh", "sekt"],
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
  {
    query: "Fisch",
    means: "рыба",
    not: ["палочки", "салат", "креветки", "лампы", "велосипед"],
    acceptCategories: ["frischfisch", "raucherfisch", "tiefkuhlfisch", "marinierter", "fischkonserven"],
    aliases: [],
    reject: ["stabchen", "salat", "garnele", "muschel", "octopus", "leuchte", "lampe", "bike", "fahrrad"],
    requireName: false,
  },
  {
    query: "Lachs",
    means: "лосось",
    not: ["Seelachs", "Lachsschinken", "баранина", "форель", "пирог"],
    acceptCategories: ["frischfisch", "raucherfisch", "tiefkuhlfisch", "marinierter"],
    aliases: ["lachsfilet"],
    reject: ["seelachs", "schinken", "kasseler", "lamm", "forelle", "aufstrich", "blatterteig"],
    requireName: true,
    stem: true,
  },
  {
    query: "Räucherlachs",
    means: "копчёный лосось",
    not: ["сайда", "ветчина"],
    acceptCategories: ["raucherfisch"],
    aliases: ["stremellachs", "wildlachs"],
    reject: ["seelachs", "schinken", "forelle"],
    requireName: true,
    stem: true,
  },
  {
    query: "Seelachs",
    means: "сайда, это не лосось",
    not: ["лосось"],
    acceptCategories: ["frischfisch", "tiefkuhlfisch", "raucherfisch", "fischkonserven"],
    aliases: [],
    reject: ["raucherlachs", "schinken"],
    requireName: true,
    stem: true,
  },
  {
    query: "Thunfisch",
    means: "тунец",
    not: ["салат с тунцом", "лосось"],
    acceptCategories: ["fischkonserven", "frischfisch", "tiefkuhlfisch"],
    aliases: ["thunfischfilet"],
    reject: ["salat", "lachs"],
    requireName: true,
    stem: true,
  },
  {
    query: "Hering",
    means: "сельдь",
    not: ["лосось", "креветки"],
    acceptCategories: ["fischkonserven", "marinierter", "raucherfisch", "fischsalate"],
    aliases: ["heringsfilet", "matjes"],
    reject: ["lachs", "garnele"],
    requireName: true,
    stem: true,
  },
  {
    query: "Garnelen",
    means: "креветки",
    not: ["рыба", "мидии", "осьминог"],
    acceptCategories: ["meeresfruchte", "tiefkuhlfisch"],
    aliases: ["garnele"],
    reject: ["muschel", "octopus", "stabchen", "lachs"],
    requireName: true,
    stem: true,
  },
  {
    query: "Fischstäbchen",
    means: "рыбные палочки",
    not: ["филе", "креветки"],
    acceptCategories: ["tiefkuhlfisch", "tiefkuhlgerichte"],
    aliases: [],
    reject: ["garnele", "lachs"],
    requireName: true,
    stem: true,
  },
  {
    query: "Forelle",
    means: "форель",
    not: ["сайда"],
    acceptCategories: ["frischfisch", "raucherfisch", "tiefkuhlfisch"],
    aliases: ["lachsforelle"],
    reject: ["seelachs"],
    requireName: true,
    stem: true,
  },
  {
    query: "Rotbarsch",
    means: "морской окунь",
    not: ["лосось", "палочки"],
    acceptCategories: ["frischfisch", "raucherfisch", "tiefkuhlfisch"],
    aliases: [],
    reject: ["lachs", "stabchen"],
    requireName: true,
    stem: true,
  },
  {
    query: "Schellfisch",
    means: "пикша",
    not: ["лосось", "треска", "палочки"],
    acceptCategories: ["frischfisch", "tiefkuhlfisch", "raucherfisch"],
    aliases: [],
    reject: ["lachs", "kabeljau", "dorsch", "stabchen"],
    requireName: true,
    stem: true,
  },
  {
    query: "Kabeljau",
    means: "треска",
    not: ["пикша", "лосось", "палочки"],
    acceptCategories: ["frischfisch", "tiefkuhlfisch", "raucherfisch", "fischkonserven"],
    aliases: ["dorsch"],
    reject: ["schellfisch", "lachs", "stabchen"],
    requireName: true,
    stem: true,
  },
  {
    query: "Dorade",
    means: "дорада",
    not: ["лосось", "окунь"],
    acceptCategories: ["frischfisch", "tiefkuhlfisch"],
    aliases: [],
    reject: ["lachs", "barsch"],
    requireName: true,
    stem: true,
  },
  {
    query: "Muscheln",
    means: "мидии",
    not: ["креветки", "осьминог"],
    acceptCategories: ["meeresfruchte", "tiefkuhlfisch"],
    aliases: ["miesmuscheln"],
    reject: ["garnele", "octopus"],
    requireName: true,
    stem: true,
  },
  {
    query: "Hähnchen",
    means: "курица",
    not: ["наггетсы", "колбаса", "приправа"],
    acceptCategories: ["geflugel", "mariniertes", "tiefkuhlfleisch", "tiefkuhlgerichte"],
    aliases: [],
    reject: ["nugget", "wurst", "wiener", "gewurz", "aspik"],
    requireName: true,
    stem: true,
  },
  {
    query: "Hähnchenbrust",
    means: "куриная грудка",
    not: ["окорочка", "наггетсы", "колбаса"],
    acceptCategories: ["geflugel", "mariniertes", "tiefkuhlfleisch", "tiefkuhlgerichte"],
    aliases: ["brustfilet"],
    reject: ["schenkel", "nugget", "wurst", "gewurz", "keule", "pute"],
    requireName: true,
    stem: true,
    need: ["brust", "innenfilet"],
  },
  {
    query: "Pute",
    means: "индейка",
    not: ["курица", "колбаса"],
    acceptCategories: ["geflugel", "tiefkuhlfleisch"],
    aliases: ["puten"],
    reject: ["wurst", "hahnchen"],
    requireName: true,
    stem: true,
  },
  {
    query: "Hackfleisch",
    means: "фарш",
    not: ["колбаса"],
    acceptCategories: ["hackfleisch"],
    aliases: [],
    reject: ["wurst"],
    requireName: false,
  },
  {
    query: "Rinderhack",
    means: "говяжий фарш",
    not: ["свиной фарш", "смешанный фарш"],
    acceptCategories: ["hackfleisch"],
    aliases: ["rinderhackfleisch"],
    reject: ["schwein", "gemischt"],
    requireName: true,
    stem: true,
  },
  {
    query: "Wurst",
    means: "колбаса и сосиски",
    not: ["пицца", "круассан"],
    acceptCategories: ["wurste", "wurstaufschnitt", "koch"],
    aliases: [],
    reject: ["pizza", "croissant"],
    requireName: false,
  },
  {
    query: "Leberwurst",
    means: "ливерная колбаса",
    not: ["сосиски", "ветчина"],
    acceptCategories: ["koch", "wurste", "wurstaufschnitt"],
    aliases: [],
    reject: ["pizza", "schinken"],
    requireName: true,
    stem: true,
  },
  {
    query: "Salami",
    means: "салями",
    not: ["ветчина", "сосиски"],
    acceptCategories: ["wurste", "wurstaufschnitt", "wurst"],
    aliases: [],
    reject: ["schinken"],
    requireName: true,
    stem: true,
  },
  {
    query: "Schinken",
    means: "ветчина",
    not: ["круассан", "шницель", "палачинки"],
    acceptCategories: ["schinken"],
    aliases: [],
    reject: ["croissant", "schnitzel", "palatschinken", "pizza", "wurst"],
    requireName: false,
  },
  {
    query: "Gouda",
    means: "сыр гауда",
    not: ["моцарелла", "фета", "пармезан"],
    acceptCategories: ["kase"],
    aliases: [],
    reject: ["mozzarella", "feta", "parmesan"],
    requireName: true,
    stem: true,
  },
  {
    query: "Feta",
    means: "фета",
    not: ["гауда", "моцарелла"],
    acceptCategories: ["kase"],
    aliases: ["hirtenkase"],
    reject: ["gouda", "mozzarella", "parmesan"],
    requireName: true,
    stem: true,
  },
  {
    query: "Mozzarella",
    means: "моцарелла",
    not: ["гауда", "фета"],
    acceptCategories: ["kase"],
    aliases: [],
    reject: ["gouda", "feta", "parmesan"],
    requireName: true,
    stem: true,
  },
  {
    query: "Parmesan",
    means: "пармезан",
    not: ["гауда", "моцарелла"],
    acceptCategories: ["kase"],
    aliases: ["parmigiano"],
    reject: ["gouda", "feta", "mozzarella"],
    requireName: true,
    stem: true,
  },
  {
    query: "Frischkäse",
    means: "сливочный сыр",
    not: ["твёрдый сыр", "кварк"],
    acceptCategories: ["kase"],
    aliases: [],
    reject: ["gouda", "quark", "parmesan"],
    requireName: true,
    stem: true,
  },
  {
    query: "Quark",
    means: "кварк",
    not: ["сыр", "десертный крем"],
    acceptCategories: ["kase"],
    aliases: ["topfen"],
    reject: ["gouda", "frischkase"],
    requireName: true,
    stem: true,
  },
  {
    query: "Kaffee",
    means: "кофе",
    not: ["кофемашина", "сервиз"],
    acceptCategories: ["kaffee"],
    aliases: [],
    reject: ["maschine", "vollautomat", "service", "geschirr"],
    requireName: false,
  },
  {
    query: "Kaffeebohnen",
    means: "кофе в зёрнах",
    not: ["молотый", "капсулы", "кофемашина"],
    acceptCategories: ["kaffee"],
    aliases: [],
    reject: ["kapsel", "pads", "loslich", "maschine", "gemahlen"],
    requireName: true,
    stem: true,
    need: ["bohnen", "bohne"],
  },
  {
    query: "Filterkaffee",
    means: "молотый кофе",
    not: ["капсулы", "кофемашина"],
    acceptCategories: ["kaffee"],
    aliases: [],
    reject: ["kapsel", "pads", "maschine", "loslich"],
    requireName: true,
    stem: true,
    need: ["gemahlen", "filter"],
  },
  {
    query: "Tee",
    means: "чай",
    not: ["чайный набор"],
    acceptCategories: ["tee"],
    aliases: ["schwarztee"],
    reject: ["set", "kanne"],
    requireName: false,
  },
  {
    query: "Kräutertee",
    means: "травяной чай",
    not: ["чёрный чай", "набор"],
    acceptCategories: ["tee"],
    aliases: [],
    reject: ["set", "schwarz"],
    requireName: true,
    stem: true,
    need: ["krauter"],
  },
  {
    query: "Pizza",
    means: "пицца",
    not: ["печь", "декор", "только тесто"],
    acceptCategories: ["tiefkuhlpizza"],
    aliases: [],
    reject: ["miniatur", "deko", "gutschein", "teig"],
    requireName: true,
    stem: true,
  },
  {
    query: "Müsli",
    means: "мюсли",
    not: ["батончик", "миска", "йогурт"],
    acceptCategories: ["muslimischungen", "musli"],
    aliases: [],
    reject: ["riegel", "schale", "joghurt"],
    requireName: true,
    stem: true,
  },
  {
    query: "Cola",
    means: "кола",
    not: ["попкорн", "виски"],
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
  const rule = exactQueryFor(query);
  if (!rule) return false;
  return rejected(productName || "", category || "", description || "", rule.reject);
}

/** True when the offer is the product that was asked for, not a lookalike. */
export function offerFits(query: string, productName: string, description: string, category: string): boolean {
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
