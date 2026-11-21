export type CountryCode = "de" | "at";

export const COUNTRIES: Record<
  CountryCode,
  { label: string; zipLength: number; retailers: string[] }
> = {
  de: {
    label: "Deutschland",
    zipLength: 5,
    retailers: [
      "Aldi",
      "Lidl",
      "Rewe",
      "Edeka",
      "Kaufland",
      "Netto",
      "Penny",
      "dm",
      "Rossmann",
      "Müller",
      "Norma",
      "Globus",
      "tegut",
      "Hit",
      "Combi",
      "Famila",
    ],
  },
  at: {
    label: "Österreich",
    zipLength: 4,
    retailers: [
      "Billa",
      "Spar",
      "Hofer",
      "Lidl",
      "Penny",
      "MPreis",
      "Unimarkt",
      "Norma",
      "dm",
      "Bipa",
      "Müller",
      "Adeg",
    ],
  },
};

export const SUGGESTIONS = [
  "Toilettenpapier",
  "Butter",
  "Milch",
  "Kaffee",
  "Nudeln",
  "Spülmittel",
];

export function zipOk(country: CountryCode, zip: string): boolean {
  return new RegExp(`^\\d{${COUNTRIES[country].zipLength}}$`).test(zip);
}
