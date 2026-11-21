# Angebote.com: begrenzter Archiv-Pilot

Dieser Pilot sammelt drei konkrete Seiten aus zwei abgeschlossenen Lidl-Prospekten
(KW 39 und 46/2026), keine aktuellen regionalen Ladenpreise. Er verändert weder die
Produktionsdatenbank noch die aktive VPS-Version. Der GitHub-Workflow läuft auf
Änderungen der Pilotdateien oder manuell; es ist kein zeitgesteuerter Crawl eingerichtet.

## Herkunft und Bewertung

`pilot-sources.json` enthält die Seiten-URLs. Der Sammler prüft robots.txt, beschränkt
Hosts, Weiterleitungen, Antwortgrößen und Laufzeit, wartet zwischen Anfragen und
beendet den Lauf bei Fehlern wie HTTP 403/429. Er liest ausschließlich den OCR-Abschnitt,
nicht Navigation, Werbung oder die gesamte Seite als vermeintliches Produkt.
Die Originalbilder bleiben separat zugänglich; die Textklassifikation verarbeitet
keine Bildpixel. OCR und JPEG erhalten SHA256-Prüfsummen.

`pilot-annotations.jsonl` enthält 18 anhand der Seitenbilder vom Assistenten kuratierte
Produkte mit insgesamt 38 ausdrücklichen Bewertungen. Die Kategorien sind ebenfalls
kuratiert, keine vom Anbieter bestätigte Warentaxonomie. Die Einträge tragen
`assistant-curated` und werden als `curated` verwendet, niemals als menschliche
Bestätigung. Auch diese Bewertungen können falsch sein. Roh-OCR bleibt unbewertet;
der Sammler erzeugt **keine** automatischen Trainingslabels. Ändert sich ein belegter
Text oder ein Bild, muss die Annotation erneut geprüft werden; das Training bricht
bei abweichenden Prüfsummen ab.

12 Produkte / 25 Paare aus KW 39 gehen in die Vorbereitung des Trainings- und
Validierungsdatensatzes ein. Die bestehende Gruppenteilung nach Produktnamen bleibt
erhalten. Der gesamte andere Prospekt (6 Produkte / 13 Paare) bleibt zurückgehalten.
Weder diese Antworten noch die 512 redaktionellen Kontrollantworten wählen Gewichte,
Epochen oder den unterstützten Suchumfang. Die Stichprobe ist klein und unausgewogen
(nur eine positive Archivbewertung im Trainingspool); sie belegt keine allgemeine
Produktgenauigkeit und keinen Nutzen durch größere Archivmengen.

## Lokaler Ablauf

```bash
PYTHONPATH=tools python3 -m unittest tools/test_angebote_archive.py
python3 tools/angebote_archive.py --manifest training/angebote/pilot-sources.json --out .angebote-pilot/run
node --experimental-strip-types webapp/scripts/train-archive-pilot.ts \
  .angebote-pilot/run/pages.jsonl training/angebote/pilot-annotations.jsonl .angebote-pilot/model
```

Ausgaben: Seitenbelege und Bilder, `report.json`, `baseline.json`, `candidate.json`,
`evaluation.json`, `holdout-decisions.jsonl` und vorbereitete `training-examples.jsonl`. Vorhandene Zielverzeichnisse
werden nicht überschrieben. Im GitHub-Workflow **Angebote archive pilot** werden diese
Dateien für sieben Tage als Artefakt gespeichert. Modus `collect` lädt alternativ bis zu
sechs Seiten eines abgeschlossenen Prospekts aus einer Archivübersicht, ohne Training.

Der Trainingslauf erstellt zunächst eine isolierte Referenz aus dem vorhandenen
redaktionellen Lehrmaterial. Danach ergänzt er die Archivannotationen und verwendet
bei geeigneter Referenz deren Gewichte zum Weitertraining. Ihre 252 oder späteren
VPS-Bewertungen, das dortige Marktguru-Archiv und die VPS-Gewichte sind hier nicht
vorhanden. Eine lokale Freigabe gegen diese Referenz ist **keine** Freigabe gegen das
aktive VPS-Modell. Das Artefakt wird nicht automatisch importiert oder aktiviert.
Wenn der Ausgangsstand auf der geprüften Validierung gewinnt, wird dies ausdrücklich
als `weightsUpdated: false` ausgewiesen; ein neuer Dateiname ist kein Lernerfolg.

## Erweiterte Partie (Standard im Workflow)

`expanded-sources.json` und `expanded-annotations.jsonl` erweitern den Versuch auf
**189 unterschiedliche Produktnamen, 25 Seiten und fünf abgeschlossene Prospekte**
von Netto, Edeka und Lidl. Produktnamen werden nicht mit Datum oder Filiale verändert,
um Wiederholungen künstlich zu neuen Produkten zu machen. Vor der Messung wurden
unklare Bildpositionen und redundante einfache Negativfälle entfernt. Kategorien und
Bewertungen bleiben vom Assistenten kuratiert, nicht von Menschen bestätigte Wahrheit.

- Trainings-/Validierungspool: 139 Produkte, 200 Paare (42 positive, 158 negative).
- Zurückgehalten: 50 Produkte, 69 Paare (12 positive, 57 negative).
- Ein neuer vollständiger Netto-Ausgabenblock wird getrennt von der zurückgehaltenen
  Lidl-Ausgabe des ersten Piloten ausgewertet. Beide bleiben aus dem Training ausgeschlossen.
- Die natürliche Verteilung wird offengelegt; diese Partie ist nicht exakt 50:50.
  Die vorhandene Klassen-Gewichtung im Trainer bleibt unverändert.

`expanded-scope.json` ergänzt ausschließlich für diesen isolierten Versuch 77 explizite
redaktionelle Lernpaare und acht separat benannte Kontrollpaare für **Fisch** und **Wurst**.
Diese zusätzlichen Fälle sind Lehrbeispiele, keine weiteren archivierten Angebote. Die
bisherigen 512 Kontrollpaare bleiben erhalten, insgesamt werden 520 geprüft. Die Definition
von Wurst umfasst verzehrfertigen Fleischaufschnitt; rohes Fleisch und Pizza sind ausgeschlossen.
Fisch schließt Fischfilet und Räucherfisch ein, aber keine Fischstäbchen, Salate oder Meeresfrüchte.
Neue Suchanfragen werden weiterhin ausschließlich mit Training und geprüfter Validierung
für die neuronale Verwendung ausgewählt. Die Freigabeschwellen werden nicht verändert.

```bash
python3 tools/angebote_archive.py --manifest training/angebote/expanded-sources.json --out .angebote-pilot/expanded-run
node --experimental-strip-types webapp/scripts/train-archive-pilot.ts \
  .angebote-pilot/expanded-run/pages.jsonl training/angebote/expanded-annotations.jsonl \
  .angebote-pilot/expanded-model training/angebote/expanded-scope.json
```

Ein explizites Manifest darf jetzt höchstens 32 Seiten enthalten; der entdeckende
Sammelmodus bleibt auf sechs Seiten beschränkt. Der Workflow erlaubt 20 Minuten,
lädt weiterhin seriell mit Verzögerung und bricht bei Netzwerk-/Belegfehlern ab.
Im Workflow kann `dataset: pilot` den ursprünglichen kleinen Versuch reproduzieren.

Das Offline-Weitertraining kopiert die Referenzgewichte unabhängig von deren Ergebnis
auf dem Freigabe-Kontrollsatz. So kann die Kontrollbewertung nicht über einen Wechsel
zwischen Neuaufbau und Weitertraining indirekt die trainierten Gewichte bestimmen.
Diese explizite Initialisierung verleiht keine Freigabe; der Produktions-CLI verwendet
weiterhin ausschließlich qualifizierte aktive Gewichte. `control-errors.json` hält konkrete
Freigabefehler fest. Zusätzlich zeigen `newIntentValidation`, `supportedIntents` und
`archiveHoldoutByBrochure`, welche neuen Anfragen tatsächlich neuronale Entscheidungen
verwenden und wie jede zurückgehaltene Ausgabe abgeschnitten hat.

Erste lokale Messung: auf dem neuen Netto-Block 49 → 53 von 56 Paaren korrekt,
auf dem früheren Lidl-Block 11 → 12 von 13. Fisch und Wurst wurden unterstützt und
Gewichte aktualisiert. Die Freigabe scheiterte dennoch an einem zusätzlichen falschen
Treffer auf dem Kontrollsatz (Wurst bei rohem Schweinefilet). Das ist kein Produktionsrelease; die bestehende VPS-Version
wird nicht ersetzt. Die Ergebnisse sind kleine, assistentenkuratierte Stichproben und
keine unabhängige Genauigkeitsgarantie.
