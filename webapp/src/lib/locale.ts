/** Presentation only: stored model reports and numeric data remain unchanged. */
export function formatNumber(value: number | string | null, digits = 2): string {
  if (value === null || value === "") return "–";
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "–";
}
export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match) return value || "?";
  return `${match[3]}.${match[2]}.${match[1]}`;
}
export function trainingReason(reason: string): string {
  const patterns: [RegExp, (...values: string[]) => string][] = [
    [/^Fewer than 100 training examples$/, () => "Weniger als 100 Trainingsbeispiele"],
    [/^(.+): insufficient labelled coverage\/classes$/, s => `${subset(s)}: Zu wenige bewertete Beispiele oder Klassen`],
    [/^(.+): deployed classification quality below threshold$/, s => `${subset(s)}: Die Klassifikationsqualität liegt unter dem Grenzwert`],
    [/^(.+): deployed neural accepted precision (.+) below (.+)$/, (s, n, min) => `${subset(s)}: Präzision bestätigter neuronaler Treffer ${metric(n)}; mindestens ${metric(min)} erforderlich`],
    [/^(.+): only (\d+) neural acceptances; need (\d+)$/, (s, n, min) => `${subset(s)}: Nur ${n} neuronale Bestätigungen; mindestens ${min} erforderlich`],
    [/^(.+): deployed neural coverage (.+) below (.+)$/, (s, n, min) => `${subset(s)}: Neuronale Abdeckung ${metric(n)}; mindestens ${metric(min)} erforderlich`],
    [/^control: missing positive\/negative coverage for enabled intent (.+)$/, intent => `Kontrollsatz: Positive oder negative Beispiele für „${intent}“ fehlen`],
    [/^control: deployed accuracy regressed against (.+)$/, baseline => `Kontrollsatz: Geringere Genauigkeit als ${reference(baseline)}`],
    [/^control: deployed false matches (\d+) exceed (.+) (\d+)$/, (n, baseline, old) => `Kontrollsatz: ${n} falsche Treffer; ${reference(baseline)} hat ${old}`],
    [/^control: deployed missed matches (\d+) exceed (.+) (\d+)$/, (n, baseline, old) => `Kontrollsatz: ${n} übersehene Treffer; ${reference(baseline)} hat ${old}`],
    [/^weak validation: deployed neural accepts disagree with automatic labels \(precision (.+)\); review required$/, n => `Automatische Validierung: Neuronale Bestätigungen widersprechen automatischen Bewertungen (Präzision ${metric(n)}). Manuelle Prüfung erforderlich.`],
    [/^weak validation: deployed neural rejects disagree with automatic positive labels \(recall (.+)\); review required$/, n => `Automatische Validierung: Neuronale Ablehnungen widersprechen automatischen positiven Bewertungen (Trefferquote ${metric(n)}). Manuelle Prüfung erforderlich.`],
    [/^(.+): insufficient reliable confident decisions$/, s => `${subset(s)}: Zu wenige verlässliche eindeutige Entscheidungen`],
    [/^Regression compared with the active model on the authored control set$/, () => "Verschlechterung gegenüber dem aktiven Modell auf dem redaktionellen Kontrollsatz"],
  ];
  for (const [pattern, translate] of patterns) {
    const match = pattern.exec(reason);
    if (match) return translate(...match.slice(1));
  }
  return "Die Qualitätsprüfung meldet einen weiteren Ablehnungsgrund. Details stehen im technischen Trainingsbericht.";
}
function subset(name: string): string {
  return ({ "trusted validation": "Geprüfte Validierung", "authored control": "Redaktioneller Kontrollsatz", validation: "Validierung", control: "Kontrollsatz" } as Record<string, string>)[name] ?? "Qualitätsprüfung";
}
function reference(name: string): string {
  return name === "active model" ? "das aktive Modell" : name === "rules baseline" ? "die Regelreferenz" : "das Referenzmodell";
}
function metric(value: string): string {
  return Number.isFinite(Number(value)) ? `${formatNumber(Number(value) * 100)} %` : "nicht bestimmt";
}

/** Display known application errors; transport/database internals use a German fallback. */
export function displayError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const german = /^(?:Das Training |Ungültiger Inhaberschlüssel|Eine dauerhafte PostgreSQL|Es gibt noch keine abgelehnten|Dieses Beispiel |Für (?:Deutschland|Österreich) |Ungültige Anfrage|Geben Sie einen Produktnamen|Marktguru (?:ist |meldet )|Marktguru-Schlüssel|Das Prospektarchiv )/;
  return german.test(message) ? message : fallback;
}
