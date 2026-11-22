import test from "node:test";
import assert from "node:assert/strict";
import { formatNumber, formatDate, displayError } from "./locale.ts";

test("German presentation formats prices, percentages and archive dates without changing values", () => {
  assert.equal(formatNumber("1.29"), "1,29");
  assert.equal(formatNumber(99.8046875), "99,80");
  assert.equal(formatNumber(null), "–");
  assert.equal(formatNumber("invalid"), "–");
  assert.equal(formatDate("2026-11-21T23:45:00Z"), "21.11.2026");
  assert.equal(formatDate("21.11.2026"), "21.11.2026");
  assert.equal(formatDate(""), "?");
});

test("application errors remain German and transport internals use a readable fallback", () => {
  assert.equal(displayError(new Error("Ungültige Anfrage"), "Fehler"), "Ungültige Anfrage");
  assert.equal(displayError(new Error("Failed to fetch"), "Verbindung fehlgeschlagen"), "Verbindung fehlgeschlagen");
  assert.equal(displayError("legacy error", "Suche fehlgeschlagen"), "Suche fehlgeschlagen");
});
