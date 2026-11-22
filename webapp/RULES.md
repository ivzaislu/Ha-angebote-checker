# Deterministische Produktregeln

Die Suche verwendet keine neuronalen Modelle. `exact.ts` definiert Suchbegriffe,
Synonyme, Produktvarianten, Kategorien und Ausschlüsse. `matchesProduct` ergänzt die
bestehende Lachs-/Seelachs-/Schinken-Unterscheidung. Archivsuche und entfernte Suche
verwenden dieselbe Entscheidung; Preise, Zeitraum, Land und PLZ bleiben getrennte Filter.

## Entscheidung

1. Suchbegriff normalisieren und eine bekannte Regel auswählen. Titelvarianten sind
   von Suchsynonymen getrennt: „Kochschinken“ darf keine allgemeine Schinkensuche werden.
2. Die letzte Kategorie einer Hierarchie wie `Lebensmittel > Gesichtspflege` prüfen.
   Ein explizit unvereinbarer Bereich schließt den Treffer aus.
3. Ausschlüsse pro Feld prüfen. Name und Kategorie werden nicht zu einem erfundenen
   Wort verbunden: `Butter` + `Milchprodukte` ist keine `Buttermilch`.
4. Eindeutige Produktnamen und erlaubte Varianten erkennen. Eine breite Kategorie wie
   `Obst`, `Molkereiprodukte` oder `Lebensmittel` widerlegt einen eindeutigen Namen nicht.
   Eine bekannte widersprechende Detailkategorie bleibt ein Ausschluss.
5. Mehrdeutige Titel wie `Original` benötigen einen ausdrücklich benannten Produkttyp
   am Anfang der Beschreibung. `Original / Milch / 6 x 65 ml` genügt nicht. Für Milch
   reicht die Kategorie allein auch bei einem unbekannten Markennamen nicht aus.
   Bei Kaffeebohnen und Filterkaffee zählen die ausdrückliche Form und Kaffeekategorie.
6. Kategorie allein bleibt für einige Regeln eine mögliche Stütze, etwa ein Markenname
   unter `Kaffee`. Kombinierte Kategorien mit `und`, `oder`, `&` oder Komma sind dafür
   keine eindeutige Grundlage. Ohne bekannte Regel wird eine zusammenhängende Wortfolge
   im Titel gesucht, keine beliebige Teilzeichenfolge.

Explizite Servier- und Rezeptabschnitte (`Serviervorschlag`, `Ideal für`, `Zum Backen`)
ändern die Produktidentität nicht. Angaben vor diesen Markierungen bleiben prüfbar.
Pizza darf Teig in ihrer Beschreibung nennen; tatsächlicher Pizzateig, Pizzaöfen,
Schneider und Gutscheine bleiben ausgeschlossen. `Apfelsaft` umfasst auf Wunsch des Inhabers Saft und Apfelschorle, aber keinen
Nektar oder Smoothie. Eine ausdrückliche Suche nach `Apfelschorle` bleibt auf Schorle beschränkt. `Räucherlachs` meint ausdrücklich geräucherten Lachs, nicht jeden Wildlachs.

## Prüfungen und Grenzen

`exact-cases.ts` enthält 227 ausdrücklich verfasste Regressionsfälle: 110 passende und
117 unpassende bzw. unzureichend bestimmte Beispiele. Einige Texte stammen aus den vom
Inhaber gemeldeten Fällen; weitere sind gezielte Gegenbeispiele. Das ist keine zufällige,
unabhängig erhobene Stichprobe aus dem tatsächlichen Angebotsverkehr.

| Prüfung derselben Beispiele | Vorher (`96f2618`) | Jetzt |
| --- | ---: | ---: |
| Passende Produkte gefunden | 45 / 110 | 110 / 110 |
| Falsche Treffer | 15 / 117 | 0 / 117 |

Die vorherige Messung verwendet den unveränderten Matcher aus dem genannten Commit
inklusive Variantenprüfung. Das Ergebnis bedeutet keine garantierte Genauigkeit bei
neuen Angeboten. Fehlende, falsche oder widersprüchliche Quelldaten bleiben möglich.

Tests prüfen sowohl den Textmatcher als auch alle Beispiele durch die SQL-Vorauswahl
und den Archivmatcher. Der Docker-Browsertest prüft richtige und falsche Angebote für
Äpfel, Apfelsaft, Pizza und Kaffee mit gesperrten Live-Marktguru-Anfragen.

Suchergebnisse speichern `rulesVersion`. Nach einem Regelwechsel werden alte Ergebnisse
nicht als neu geprüft angezeigt. „Angebote finden“ bewertet sie erneut über das Archiv;
ein vollständiges Prospekt-Update ist dafür nicht erforderlich.
