import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { neuralReviewQueue, answerNeuralReview } from "@/lib/scan";
import type { ReviewCard } from "@/lib/product-review-queue";

function ReviewPhoto({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed)
    return (
      <p className="text-xs text-muted" data-testid="review-image-unavailable">
        Фото недоступно. Если названия и описания недостаточно, пропустите пример.
      </p>
    );
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
      title="Открыть фото крупнее"
    >
      <img
        src={url}
        alt={`Фото товара: ${name}`}
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
      setError(error instanceof Error ? error.message : "Не удалось загрузить примеры");
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
      setError(error instanceof Error ? error.message : "Не удалось сохранить ответ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-4 space-y-3 border-t border-line pt-3"
      aria-label="Ручная проверка товаров"
    >
      <h3 className="text-sm font-medium">Помочь нейросети</h3>
      <p className="text-xs text-muted">
        Фото помогает вам при проверке. Нейросеть анализирует текст и категории, изображения не
        анализирует.
      </p>
      <p className="text-xs text-muted" data-testid="review-count">
        Проверенных примеров в базе: {batch?.reviewedCount ?? reviewedCount}.
      </p>
      <p className="text-xs text-muted">
        Сравните запрос с товаром. Ответы сохраняются для следующего обучения; веса действующей
        модели сейчас не меняются. Если данных недостаточно, пропустите пример.
      </p>
      <button
        type="button"
        className="h-11 rounded-md border border-line px-3 text-sm disabled:opacity-50"
        disabled={busy || !ownerKey.trim()}
        onClick={() => void loadBatch()}
      >
        {busy ? "Обрабатываем…" : "Загрузить примеры для проверки"}
      </button>
      <button
        type="button"
        disabled={busy || !ownerKey.trim()}
        onClick={() => void loadBatch("rejected")}
        className="h-11 rounded-md border border-line px-3 text-sm disabled:opacity-50"
      >
        Разобрать последний отказ
      </button>
      {batch ? (
        <div className="space-y-1 text-xs text-muted" data-testid="review-target">
          <p>
            {batch.reviewModel.mode === "rejected"
              ? "Разбор отклонённого кандидата"
              : "Проверка действующей модели"}
            : {batch.reviewModel.id ?? "правила"}. Схема признаков:{" "}
            {batch.reviewModel.featureVersion}.
          </p>
          {batch.reviewModel.mode === "rejected" ? (
            <>
              <p>
                Разбор не включает кандидата. Подтвердите ответы, затем запустите новое обучение.
              </p>
              <p>
                Конфликтов в отчёте: {batch.reportedConflicts}; доступно непроверенных:{" "}
                {batch.pendingConflicts}.
              </p>
              {batch.unavailableConflicts ? (
                <p>
                  Недоступно для разметки: {batch.unavailableConflicts} (нет подходящего снимка или
                  пример исключён).
                </p>
              ) : null}
              {batch.reviewModel.reasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      {!ownerKey.trim() ? <p className="text-xs text-muted">Введите ключ владельца выше.</p> : null}
      {card ? (
        <article data-testid="review-card" className="space-y-2 rounded-md border border-line p-3">
          <p className="text-sm">
            Запрос: <strong>{card.intent}</strong>
          </p>
          <p className="break-words text-sm font-medium" data-testid="review-product-name">
            Товар: {card.displayName}
          </p>
          {card.otherNames.map((name) => (
            <p key={name} className="break-words text-xs text-muted">
              Другое название в источнике: {name}
            </p>
          ))}
          <ReviewPhoto key={card.snapshotId} url={card.imageUrl} name={card.displayName} />
          {card.shortName ? (
            <p className="text-xs text-muted">
              В архиве короткое название. Уточните товар по фото и описанию или пропустите пример.
            </p>
          ) : null}
          {card.category ? <p className="text-xs text-muted">Категория: {card.category}</p> : null}
          <p className="text-xs text-muted">Группа товара: {card.categoryGroup}</p>
          {card.description ? (
            <p className="whitespace-pre-wrap text-sm">{card.description}</p>
          ) : null}
          <p className="text-xs text-muted">
            {card.reportedConflict
              ? "Конфликт из сохранённого отчёта кандидата. Автоматическая метка требует вашей проверки."
              : card.reason === "conflict"
                ? "Модель и автоматическое правило расходятся."
                : card.reason === "uncertain"
                  ? "Ответ сети неопределённый."
                  : "Учебная пара для проверки; показ карточки не означает совпадение."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !ownerKey.trim()}
              className="h-11 rounded-md border border-line px-3 text-sm disabled:opacity-50"
              onClick={() => void submit(card, true)}
            >
              Подходит
            </button>
            <button
              type="button"
              disabled={busy || !ownerKey.trim()}
              className="h-11 rounded-md border border-line px-3 text-sm disabled:opacity-50"
              onClick={() => void submit(card, false)}
            >
              Не подходит
            </button>
            <button
              type="button"
              disabled={busy}
              className="h-11 px-3 text-sm text-muted"
              onClick={() =>
                setBatch((batch) => (batch ? { ...batch, cards: batch.cards.slice(1) } : batch))
              }
            >
              Пропустить
            </button>
          </div>
          <p className="text-xs text-muted">
            В этой порции осталось: {batch?.cards.length}. Пропуск не сохраняет метку.
          </p>
        </article>
      ) : batch ? (
        <p className="text-sm">
          {batch.reviewModel.mode === "rejected"
            ? batch.reportedConflicts === 0
              ? "В отчёте нет конфликтов слабой разметки для этой очереди. Причины отказа показаны выше."
              : batch.pendingConflicts === 0 && batch.unavailableConflicts === 0
                ? "Доступные конфликты проверены. Теперь запустите новое обучение."
                : "Проверьте оставшиеся случаи или загрузите разбор заново."
            : "Порция закончилась. Загрузите следующую; если примеров нет, обновите архив акций."}
        </p>
      ) : null}
      {batch ? (
        <p className="text-xs text-muted">
          {batch.reviewModel.mode === "rejected"
            ? `Снимков для конфликтов: ${batch.conflictSnapshotsRead}. Поиск по сохранённым текстам отчёта, без ограничения последними акциями.`
            : `Очередь из последних ${batch.archiveSnapshotsRead} снимков Германии; предел ${batch.archiveReadLimit}.`}{" "}
          Контрольные товары исключены.
        </p>
      ) : null}
      {last ? (
        <div role="status" className="space-y-1 text-xs text-muted">
          <p>
            Сохранено: «{last.card.name}» для «{last.card.intent}» —{" "}
            {last.positive ? "подходит" : "не подходит"}.
          </p>
          <button
            type="button"
            className="h-11 underline disabled:opacity-50"
            disabled={busy || !ownerKey.trim()}
            onClick={() => void submit(last.card, !last.positive, last.positive)}
          >
            Изменить последний ответ
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
