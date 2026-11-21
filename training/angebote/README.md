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

## Frühere erweiterte Partie

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

Ein explizites Manifest darf jetzt höchstens 48 Seiten enthalten; der entdeckende
Sammelmodus bleibt auf sechs Seiten beschränkt. Der Workflow erlaubt 30 Minuten,
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


## Mehrere Geschäfte (Standard im Workflow)

`multistore-sources.json` und `multistore-annotations.jsonl` enthalten 291 unterschiedliche
Produkte auf 46 belegten Seiten aus 12 Handelsketten: Netto, Edeka, Lidl, Norma, NKD,
Aldi (Nord und Süd zusammengefasst), Rewe, Kaufland, Penny, dm, Rossmann und Müller.
Alle 189 Produkte der vorherigen Partie bleiben erhalten. Die neuen Annotationen wurden
anhand der Originalbilder geprüft; sie bleiben `assistant-curated`, keine menschlichen Labels.

- Trainings-/Validierungspool: 216 Produkte, 290 Paare (53 positive, 237 negative).
- Zurückgehaltene ganze Prospekte: 75 Produkte, 99 Paare (17 positive, 82 negative).
- Norma erhält getrennte Lern- und Prüfprosપekte; NKD ebenfalls. Die vier NKD-Prüffälle
  sind Kleidung und ausschließlich negative Antworten auf Lebensmittelanfragen. Sie
  messen weder allgemeine NKD-Erkennung noch die Fähigkeit, Kleidung zu klassifizieren.
- Bei Edeka, Aldi, Rewe, Kaufland, Penny, dm, Rossmann und Müller liegen nur Lernfälle
  vor; dafür wird keine Genauigkeit auf unabhängigen Archivfällen ausgewiesen.

`multistore-coverage.json` dokumentiert die Anbieterabdeckung aller 17 deutschen
Geschäfte im App-Filter. Die geprüften Angebote.com-Archivübersichten für Globus,
tegut, HIT, Combi und famila lieferten HTTP 404. Das beschreibt diese Anbieterpfade,
nicht die Existenz der Geschäfte oder deren Verfügbarkeit bei Marktguru. Der App-Filter
enthält jetzt auch NKD; Norma war bereits vorhanden. Filtereinträge garantieren keine
regional verfügbaren Angebote.

```bash
python3 tools/angebote_archive.py --manifest training/angebote/multistore-sources.json --out .angebote-pilot/multistore-run
node --experimental-strip-types webapp/scripts/train-archive-pilot.ts \
  .angebote-pilot/multistore-run/pages.jsonl training/angebote/multistore-annotations.jsonl \
  .angebote-pilot/multistore-model training/angebote/expanded-scope.json \
  training/angebote/expanded-annotations.jsonl
```

Der optionale letzte Parameter reproduziert den festgelegten vorherigen Archivstand.
Dessen unveränderte Trainingsantworten müssen weiterhin in der neuen Partie enthalten
sein; alle früheren Prüfantworten bleiben zurückgehalten. Weitertraining startet aus
diesen Gewichten. Die redaktionellen Freigabeschwellen vergleichen weiterhin mit der
ursprünglichen isolierten Referenz, nicht mit einer zuvor abgelehnten Archivversion.

Zusätzlich prüft `archiveReleaseGate` jede zurückgehaltene Ausgabe gegen den vorherigen
Archivstand: weder falsche noch übersehene Treffer dürfen zunehmen. Diese Prüfung erfolgt
erst nach abgeschlossener Gewichtsauswahl; Archivantworten wählen keine Epochen oder
Schwellen. `experimentQualified` verlangt beide Prüfungen. Ein erfolgreicher Workflow
bedeutet nur, dass Sammlung und Auswertung erfolgreich ausgeführt wurden.

Lokale Messung: Norma 26/26, NKD 4/4 (nur negative Kleidungsfälle), Lidl unverändert
12/13; Netto 52/56 gegenüber zuvor 53/56. Insgesamt 94/99 gegenüber 95/99. Der
redaktionelle Kontrollsatz wurde bestanden, die zusätzliche Archivprüfung jedoch
**nicht**. Der Kandidat wird daher nicht als Ersatzmodell empfohlen und nicht aktiviert.
Der frühere falsche Wurst-Treffer bei rohem Schweinefilet ist behoben; das rechtfertigt
keine Verschlechterung im Netto-Archiv. Weitere Lernfälle müssen getrennt von diesen
Prüfantworten gesammelt werden. VPS-Gewichte und dortige Nutzerbewertungen bleiben
von diesem Offline-Versuch unberührt.
