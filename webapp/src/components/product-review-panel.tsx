import { trainingReason, displayError } from "@/lib/locale";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { neuralReviewQueue, answerNeuralReview } from "@/lib/scan";
import type { ReviewCard } from "@/lib/product-review-queue";

function ReviewPhoto({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed)
    return (
      <p className="text-xs text-muted" data-testid="review-image-unavailable">
        Foto nicht verfügbar. Überspringen Sie das Beispiel, wenn Name und Beschreibung nicht ausreichen.
      </p>
    );
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
      title="Foto vergrößern"
    >
      <img
        src={url}
        alt={`Produktfoto: ${name}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-48 w-full rounded-md border border-line bg-white object-contain"
        data-testid="review-image"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

export function ProductReviewPanel({
  ownerKey,
  reviewedCount,
  onReviewed,
}: {
  ownerKey: string;
  reviewedCount: number;
  onReviewed: (count: number) => void;
}) {
  const load = useServerFn(neuralReviewQueue);
  const answer = useServerFn(answerNeuralReview);
  const [batch, setBatch] = useState<Awaited<ReturnType<typeof neuralReviewQueue>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState<{ card: ReviewCard; positive: boolean } | null>(null);
  const card = batch?.cards[0];
  async function loadBatch(mode: "active" | "rejected" = "active") {
    setBusy(true);
    setError("");
    try {
      const result = await load({ data: { key: ownerKey, mode } });
      setBatch(result);
      onReviewed(result.reviewedCount);
    } catch (error) {
      setError(displayError(error, "Beispiele konnten nicht geladen werden"));
    } finally {
      setBusy(false);
    }
  }
  async function submit(selected: ReviewCard, positive: boolean, expectedPositive?: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await answer({
        data: {
          key: ownerKey,
          snapshotId: selected.snapshotId,
          intent: selected.intent,
          positive,
          expectedPositive,
        },
      });
      setLast({ card: selected, positive });
      onReviewed(result.reviewedCount);
      setBatch((batch) =>
        batch
          ? {
              ...batch,
              reviewedCount: result.reviewedCount,
              pendingConflicts: Math.max(
                0,
                batch.pendingConflicts -
                  (batch.cards.some((row) => row.id === selected.id && row.reportedConflict)
                    ? 1
                    : 0),
              ),
              cards: batch.cards.filter((row) => row.id !== selected.id),
            }
          : batch,
      );
    } catch (error) {
      setError(displayError(error, "Antwort konnte nicht gespeichert werden"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-4 space-y-3 border-t border-line pt-3"
      aria-label="Produkte manuell prüfen"
    >
      <h3 className="text-sm font-medium">Dem neuronalen Netz helfen</h3>
      <p className="text-xs text-muted">
        Das Foto hilft Ihnen bei der Prüfung. Das neuronale Netz wertet Text und Kategorien aus. Es analysiert keine Bilder.
      </p>
      <p className="text-xs text-muted" data-testid="review-count">
        Geprüfte Beispiele in der Datenbank: {batch?.reviewedCount ?? reviewedCount}.
      </p>
      <p className="text-xs text-muted">
        Vergleichen Sie die Suchanfrage mit dem Produkt. Ihre Antworten werden für das nächste Training gespeichert. Das aktive Modell bleibt dabei unverändert. Überspringen Sie das Beispiel, wenn Angaben fehlen.
      </p>
      <button
        type="button"
        className="h-11 rounded-md border border-line px-3 text-sm disabled:opacity-50"
        disabled={busy || !ownerKey.trim()}
        onClick={() => void loadBatch()}
      >
        {busy ? "Wird verarbeitet…" : "Beispiele zur Prüfung laden"}
      </button>
      <button
        type="button"
        disabled={busy || !ownerKey.trim()}
        onClick={() => void loadBatch("rejected")}
        className="h-11 rounded-md border border-line px-3 text-sm disabled:opacity-50"
      >
        Letzte Ablehnung prüfen
      </button>
      {batch ? (
        <div className="space-y-1 text-xs text-muted" data-testid="review-target">
          <p>
            {batch.reviewModel.mode === "rejected"
              ? "Prüfung des abgelehnten Kandidaten"
              : "Prüfung des aktiven Modells"}
            : {batch.reviewModel.id ?? "Regeln"}. Merkmalsschema:{" "}
            {batch.reviewModel.featureVersion}.
          </p>
          {batch.reviewModel.mode === "rejected" ? (
            <>
              <p>
                Die Prüfung aktiviert den Kandidaten nicht. Bestätigen Sie die Antworten und starten Sie anschließend ein neues Training.
              </p>
              <p>
                Konflikte im Bericht: {batch.reportedConflicts}; noch ungeprüft verfügbar:{" "}
                {batch.pendingConflicts}.
              </p>
              {batch.unavailableConflicts ? (
                <p>
                  Nicht zur Bewertung verfügbar: {batch.unavailableConflicts} (kein passender Archiveintrag oder Beispiel ausgeschlossen).
                </p>
              ) : null}
              {batch.reviewModel.reasons.map((reason) => (
                <p key={reason}>{trainingReason(reason)}</p>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      {!ownerKey.trim() ? <p className="text-xs text-muted">Geben Sie oben den Inhaberschlüssel ein.</p> : null}
      {card ? (
        <article data-testid="review-card" className="space-y-2 rounded-md border border-line p-3">
          <p className="text-sm">
            Suchanfrage: <strong>{card.intent}</strong>
          </p>
          <p className="break-words text-sm font-medium" data-testid="review-product-name">
            Produkt: {card.displayName}
          </p>
          {card.otherNames.map((name) => (
            <p key={name} className="break-words text-xs text-muted">
              Weiterer Name in der Quelle: {name}
            </p>
          ))}
          <ReviewPhoto key={card.snapshotId} url={card.imageUrl} name={card.displayName} />
          {card.shortName ? (
            <p className="text-xs text-muted">
              Der Archivname ist kurz. Prüfen Sie das Produkt anhand von Foto und Beschreibung oder überspringen Sie das Beispiel.
            </p>
          ) : null}
          {card.category ? <p className="text-xs text-muted">Kategorie: {card.category}</p> : null}
          <p className="text-xs text-muted">Produktgruppe: {card.categoryGroup}</p>
          {card.description ? (
            <p className="whitespace-pre-wrap text-sm">{card.description}</p>
          ) : null}
          <p className="text-xs text-muted">
            {card.reportedConflict
              ? "Konflikt aus dem gespeicherten Kandidatenbericht. Die automatische Bewertung muss von Ihnen geprüft werden."
              : card.reason === "conflict"
                ? "Modell und automatische Regel widersprechen sich."
                : card.reason === "uncertain"
                  ? "Das Netz ist unsicher."
                  : "Trainingspaar zur Prüfung. Die Anzeige bedeutet nicht, dass das Produkt passt."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !ownerKey.trim()}
              className="h-11 rounded-md border border-line px-3 text-sm disabled:opacity-50"
              onClick={() => void submit(card, true)}
            >
              Passt
            </button>
            <button
              type="button"
              disabled={busy || !ownerKey.trim()}
              className="h-11 rounded-md border border-line px-3 text-sm disabled:opacity-50"
              onClick={() => void submit(card, false)}
            >
              Passt nicht
            </button>
            <button
              type="button"
              disabled={busy}
              className="h-11 px-3 text-sm text-muted"
              onClick={() =>
                setBatch((batch) => (batch ? { ...batch, cards: batch.cards.slice(1) } : batch))
              }
            >
              Überspringen
            </button>
          </div>
          <p className="text-xs text-muted">
            In dieser Auswahl verbleibend: {batch?.cards.length}. Beim Überspringen wird keine Bewertung gespeichert.
          </p>
        </article>
      ) : batch ? (
        <p className="text-sm">
          {batch.reviewModel.mode === "rejected"
            ? batch.reportedConflicts === 0
              ? "Der Bericht enthält keine Konflikte automatischer Bewertungen für diese Auswahl. Die Ablehnungsgründe stehen oben."
              : batch.pendingConflicts === 0 && batch.unavailableConflicts === 0
                ? "Alle verfügbaren Konflikte sind geprüft. Starten Sie jetzt ein neues Training."
                : "Prüfen Sie die übrigen Fälle oder laden Sie die Prüfung erneut."
            : "Auswahl abgeschlossen. Laden Sie die nächste Auswahl. Falls keine Beispiele verfügbar sind, aktualisieren Sie das Angebotsarchiv."}
        </p>
      ) : null}
      {batch ? (
        <p className="text-xs text-muted">
          {batch.reviewModel.mode === "rejected"
            ? `Archiveinträge für Konflikte: ${batch.conflictSnapshotsRead}. Suche anhand der gespeicherten Berichtstexte, ohne Beschränkung auf die neuesten Angebote.`
            : `Auswahl aus den neuesten ${batch.archiveSnapshotsRead} Archiveinträgen aus Deutschland; Obergrenze ${batch.archiveReadLimit}.`}{" "}
          Produkte aus dem Kontrollsatz sind ausgeschlossen.
        </p>
      ) : null}
      {last ? (
        <div role="status" className="space-y-1 text-xs text-muted">
          <p>
            Gespeichert: «{last.card.name}» für «{last.card.intent}» —{" "}
            {last.positive ? "passt" : "passt nicht"}.
          </p>
          <button
            type="button"
            className="h-11 underline disabled:opacity-50"
            disabled={busy || !ownerKey.trim()}
            onClick={() => void submit(last.card, !last.positive, last.positive)}
          >
            Letzte Antwort ändern
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
