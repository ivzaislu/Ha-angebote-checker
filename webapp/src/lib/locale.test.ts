import test from "node:test";
import assert from "node:assert/strict";
import { formatNumber, formatDate, trainingReason, displayError } from "./locale.ts";

test("German presentation formats prices, percentages and archive dates without changing values", () => {
  assert.equal(formatNumber("1.29"), "1,29");
  assert.equal(formatNumber(99.8046875), "99,80");
  assert.equal(formatNumber(null), "–");
  assert.equal(formatNumber("invalid"), "–");
  assert.equal(formatDate("2026-11-21T23:45:00Z"), "21.11.2026");
  assert.equal(formatDate("21.11.2026"), "21.11.2026");
  assert.equal(formatDate(""), "?");
});

test("existing rejection reports display German diagnostics with original numeric meaning", () => {
  const reason = "weak validation: deployed neural rejects disagree with automatic positive labels (recall 0.6875); review required";
  assert.equal(trainingReason(reason), "Automatische Validierung: Neuronale Ablehnungen widersprechen automatischen positiven Bewertungen (Trefferquote 68,75 %). Manuelle Prüfung erforderlich.");
  assert.match(trainingReason("control: deployed false matches 3 exceed active model 2"), /3 falsche Treffer; das aktive Modell hat 2/);
  assert.match(trainingReason("trusted validation: deployed neural accepted precision undefined below 0.95"), /nicht bestimmt; mindestens 95,00 %/);
  assert.match(trainingReason("validation: insufficient reliable confident decisions"), /Validierung: Zu wenige/);
  assert.match(trainingReason("unknown future diagnostic"), /technischen Trainingsbericht/);
});

test("application errors remain German and transport internals use a readable fallback", () => {
  assert.equal(displayError(new Error("Ungültiger Inhaberschlüssel"), "Fehler"), "Ungültiger Inhaberschlüssel");
  assert.equal(displayError(new Error("Failed to fetch"), "Verbindung fehlgeschlagen"), "Verbindung fehlgeschlagen");
  assert.equal(displayError("legacy error", "Suche fehlgeschlagen"), "Suche fehlgeschlagen");
});
