import { useEffect, useState } from "react";
import { ProductReviewPanel } from "./product-review-panel";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarRange,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { COUNTRIES, SUGGESTIONS, zipOk, type CountryCode } from "@/lib/catalog";
import { cheapestId, primaryDeals, type Deal } from "@/lib/deals";
import { CATEGORIES, categoryLabel, categoryOf, dealInCategory, inCategories, productsIn, suggestProducts } from "@/lib/products";
import { EXACT_QUERIES, exactQueryFor, offerFits } from "@/lib/exact";
import { trainNeuralModel, neuralTrainingStatus, neuralModelStatus, archivedPriceHistory, brainSnapshot, flyerHints, productHints, scanQuery, studyLeaflets } from "@/lib/scan";
import type { BrainView } from "@/lib/brain";
import { recognizeVariant } from "@/lib/product-variants";
import { useAngebote, type LastScan } from "@/lib/store";
import { assortmentNames, dealStillOn, flyerLabel, isCurrentFlyer } from "@/lib/week";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function VariantLabels({ name, description }: { name: string; description: string }) {
  const variant = recognizeVariant(name, description);
  const labels: Record<string, string> = {
    salmon: "лосось", "smoked-salmon": "копчёный лосось", pollock: "сейлахс",
    "salmon-ham": "ветчина", oat: "овсяный напиток", soy: "соевый напиток",
    almond: "миндальный напиток", buttermilk: "пахта", uht: "длительного хранения",
    fresh: "свежее", organic: "Bio", "lactose-free": "без лактозы",
    vegan: "vegan", frozen: "замороженное", assorted: "разные сорта",
  };
  const tags = [variant.kind, ...variant.attributes].filter((tag): tag is string => Boolean(tag));
  if (!tags.length) return null;
  return <p className="mt-1 text-xs text-muted">{tags.map(tag => labels[tag] ?? (tag.startsWith("fat:") ? `жирность ${tag.slice(4)}` : tag)).join(" · ")}</p>;
}

function ArchivedHistory({ name }: { name: string }) {
  const country = useAngebote(state => state.country);
  const load = useServerFn(archivedPriceHistory);
  const [data, setData] = useState<Awaited<ReturnType<typeof archivedPriceHistory>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setData(null); setOpen(false); setError(""); }, [country, name]);
  async function show() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setBusy(true);
    setError("");
    try { setData(await load({ data: { country, name } })); }
    catch { setError("Не удалось загрузить архив цен"); }
    finally { setBusy(false); }
  }
  return <div className="mt-2 text-xs">
    <button type="button" className="underline" onClick={show} disabled={busy} aria-expanded={open}>
      {busy ? "Загрузка архива…" : "История цен"}
    </button>
    {open && <div className="mt-2 space-y-2">
      {error && <p role="alert">{error}</p>}
      {data && (data.observations === 0 ? <p>В архиве пока нет цен этого товара.</p> : <>
        <p>От {data.minimum} до {data.maximum} € · наблюдений: {data.observations}</p>
        <p className="text-muted">Сохранённые акции по стране, включая истёкшие. Фасовки и разновидности могут отличаться; это не текущая цена магазина.</p>
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Цены от минимальной до максимальной</caption>
            <thead><tr><th>Цена</th><th>Магазин / индекс</th><th>Срок / фасовка / описание</th></tr></thead>
            <tbody>{data.rows.map(row => <tr key={row.snapshot_id}>
              <td className="py-1 pr-2">{row.price} €{row.unit_price ? ` · ${row.unit_price} €/${row.unit}` : ""}</td>
              <td className="pr-2">{row.retailer || "Неизвестно"} · {row.zip}</td>
              <td>{row.valid_from.slice(0,10) || "?"} – {row.valid_to.slice(0,10) || "?"}{row.quantity ? ` · ${row.quantity} ${row.unit}` : ""}<p>{row.description}</p></td>
            </tr>)}</tbody>
          </table>
        </div>
        {data.truncated && <p>Показаны первые 500 записей. Диапазон учитывает весь архив.</p>}
      </>)}
    </div>}
  </div>;
}

function OfferCard({ deal, cheapest }: { deal: Deal; cheapest: boolean }) {
  const [broken, setBroken] = useState(false);
  const dates =
    deal.validFrom && deal.validTo
      ? `${deal.validFrom} – ${deal.validTo}`
      : deal.validTo
        ? `до ${deal.validTo}`
        : "";

  return (
    <article className="flex gap-3 border border-line bg-card p-3">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden bg-paper text-muted">
        {deal.imageUrl && !broken ? (
          <img
            src={deal.imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <Store className="size-5" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-xs font-medium tracking-[0.14em] text-muted uppercase">
            {deal.retailer}
          </p>
          {cheapest ? (
            <span className="shrink-0 bg-ink px-1.5 py-0.5 text-xs font-medium text-paper">
              дешевле
            </span>
          ) : null}
        </div>
        <p className="font-display text-3xl leading-none text-stamp">{deal.priceLabel}</p>
        {deal.unitPrice ? (
          <p className="text-xs text-muted">{deal.unitPrice.perUnit.toFixed(2).replace(".", ",")} € / {deal.unitPrice.unit}</p>
        ) : null}
        <p className="mt-1 line-clamp-2 text-sm text-ink">
          {deal.productName && deal.productName !== deal.description
            ? `${deal.productName} · ${deal.description}`
            : deal.description || deal.productName}
        </p>
        <VariantLabels name={deal.productName} description={deal.description} />
        <ArchivedHistory name={deal.productName || deal.description} />
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {dates ? (
            <span className="inline-flex items-center gap-1">
              <CalendarRange className="size-3.5" aria-hidden="true" />
              {dates}
            </span>
          ) : null}
          {deal.onlineOnly ? <span>только онлайн</span> : null}
          {deal.fromArchive ? <span>из сохранённых акций</span> : null}
          {deal.fromBrain ? <span>проверено нейросетью</span> : null}
          {deal.relevance < 50 && !deal.fromBrain ? <span>похожее</span> : null}
        </p>
      </div>
    </article>
  );
}

function ItemResults({
  item,
  deals,
  error,
  known,
  scanning,
  dropped,
  assortment,
  fresh,
}: {
  item: string;
  deals: Deal[];
  error: string | null;
  known: boolean;
  scanning: boolean;
  dropped: number;
  assortment: string[];
  fresh: boolean;
}) {
  const rule = exactQueryFor(item);
  const [open, setOpen] = useState(false);
  const { shown, rest } = primaryDeals(deals);
  const visible = open ? deals : shown;
  const cheap = cheapestId(visible);

  return (
    <section className="border-t border-line py-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-2xl text-ink">{item}</h3>
        <p className="shrink-0 text-sm text-muted">
          {error ? "ошибка" : !known ? "" : deals.length === 0 ? "нет акций" : `${deals.length}`}
        </p>
      </header>
      {rule ? (
        <p className="mb-2 text-xs text-muted">
          Ищем {rule.means}. Не {rule.not.join(", ")}.
        </p>
      ) : null}
      {assortment.length > 0 ? (
        <p className="mb-2 text-sm text-ink">
          {fresh ? "На этой неделе" : "На прошлой неделе"}: {assortment.join(", ")}
        </p>
      ) : null}
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
      {!error && known && deals.length === 0 ? (
        <p className="text-sm text-muted">
          {!fresh
            ? "На эту неделю список ещё не обновляли."
            : dropped > 0
              ? "В проспектах всплыло похожее, но это другой товар. Такие строки скрыты."
              : "В текущих проспектах по этому индексу ничего не нашлось."}
        </p>
      ) : null}
      {dropped > 0 && deals.length > 0 ? (
        <p className="mb-2 text-xs text-muted">Скрыто похожих, но других товаров: {dropped}</p>
      ) : null}
      {!known ? (
        <p className="text-sm text-muted">{scanning ? "Проверяем…" : "Ещё не проверяли"}</p>
      ) : null}
      <div className="grid gap-2">
        {visible.map((deal) => (
          <OfferCard key={`${deal.id}-${deal.retailer}`} deal={deal} cheapest={deal.id === cheap} />
        ))}
      </div>
      {rest.length > 0 ? (
        <button
          type="button"
          className="mt-2 text-sm font-medium text-ink underline decoration-line underline-offset-4"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Скрыть слабые совпадения" : `Ещё ${rest.length}`}
        </button>
      ) : null}
    </section>
  );
}

export function AngeboteApp() {
  const lists = useAngebote((s) => s.lists);
  const activeListId = useAngebote((s) => s.activeListId);
  const country = useAngebote((s) => s.country);
  const zip = useAngebote((s) => s.zip);
  const retailers = useAngebote((s) => s.retailers);
  const categories = useAngebote((s) => s.categories);
  const scans = useAngebote((s) => s.scans);
  const createList = useAngebote((s) => s.createList);
  const deleteList = useAngebote((s) => s.deleteList);
  const setActiveList = useAngebote((s) => s.setActiveList);
  const addItem = useAngebote((s) => s.addItem);
  const removeItem = useAngebote((s) => s.removeItem);
  const setCountry = useAngebote((s) => s.setCountry);
  const setZip = useAngebote((s) => s.setZip);
  const toggleRetailer = useAngebote((s) => s.toggleRetailer);
  const clearRetailers = useAngebote((s) => s.clearRetailers);
  const toggleCategory = useAngebote((s) => s.toggleCategory);
  const clearCategories = useAngebote((s) => s.clearCategories);
  const setListScan = useAngebote((s) => s.setListScan);

  const active = lists.find((list) => list.id === activeListId) ?? lists[0];
  const items = active?.items ?? [];
  const lastScan = active ? (scans[active.id] ?? null) : null;

  const scan = useServerFn(scanQuery);
  const study = useServerFn(studyLeaflets);
  const hints = useServerFn(flyerHints);
  const catalogHints = useServerFn(productHints);
  const brainOf = useServerFn(brainSnapshot);
  const modelStatus = useServerFn(neuralModelStatus);
  const trainingStatus = useServerFn(neuralTrainingStatus);
  const startTraining = useServerFn(trainNeuralModel);
  const [training, setTraining] = useState<Awaited<ReturnType<typeof neuralTrainingStatus>> | null>(null);
  const [trainingKey, setTrainingKey] = useState("");
  const [startingTraining, setStartingTraining] = useState(false);
  const [trainingError, setTrainingError] = useState("");
  const trainingBusy = training?.job?.status === "queued" || training?.job?.status === "running";
  const [neural, setNeural] = useState<Awaited<ReturnType<typeof neuralModelStatus>> | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [updatingLeaflets, setUpdatingLeaflets] = useState(false);
  const [progress, setProgress] = useState("");
  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [makingList, setMakingList] = useState(false);
  const [listDraft, setListDraft] = useState("");
  const [listNote, setListNote] = useState("");
  const [flyer, setFlyer] = useState<{ name: string; seen: number }[]>([]);
  const [brain, setBrain] = useState<BrainView | null>(null);

  const dict = suggestProducts(draft, categories);
  const matches = [
    ...dict.map((name) => ({ name, fromFlyer: false, seen: 0 })),
    ...flyer
        .filter((hint) => {
        const needle = draft.trim().toLowerCase();
        const name = hint.name.toLowerCase();
        return !dict.some((entry) => entry.toLowerCase() === hint.name.toLowerCase()) && (name.startsWith(needle) || name.includes(needle));
      })
      .map((hint) => ({ name: hint.name, fromFlyer: true, seen: hint.seen })),
  ].slice(0, 8);
  const showSuggest = focused && matches.length > 0;

  useEffect(() => {
    void Promise.resolve(useAngebote.persist.rehydrate()).finally(() => setReady(true));
    void modelStatus().then(setNeural).catch(()=>undefined);
    void trainingStatus().then(setTraining).catch(() => setTrainingError("Не удалось получить состояние обучения"));
  }, []);

  useEffect(() => {
    if (!trainingBusy) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void trainingStatus().then(async (status) => {
        if (cancelled) return;
        setTraining(status);
        setTrainingError("");
        if (status.job?.status !== "queued" && status.job?.status !== "running") {
          const model = await modelStatus();
          if (!cancelled) setNeural(model);
        }
      }).catch(() => { if (!cancelled) setTrainingError("Связь прервана; повторяем проверку состояния обучения…"); });
    }, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [trainingBusy]);

  async function beginTraining() {
    setStartingTraining(true);
    setTrainingError("");
    try {
      setTraining(await startTraining({ data: { key: trainingKey } }));
    } catch (error) {
      setTrainingError(error instanceof Error ? error.message : "Не удалось запустить обучение");
    } finally { setStartingTraining(false); }
  }

  useEffect(() => {
    setHighlight(0);
  }, [draft]);

  useEffect(() => {
    const prefix = draft.trim();
    if (prefix.length < 2) {
      setFlyer([]);
      return;
    }
    let cancel = false;
    const timer = setTimeout(() => {
      void Promise.all([
        catalogHints({ data: { country, prefix } }),
        hints({ data: { prefix } }),
      ])
        .then(([known, learned]) => {
          if (!cancel) {
            const seen = new Set<string>();
            setFlyer([...known, ...learned].filter(row => {
              const key = row.name.toLocaleLowerCase("de");
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }).slice(0, 12));
          }
        })
        .catch(() => {
          if (!cancel) setFlyer([]);
        });
    }, 200);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [draft, country, hints, catalogHints]);

  const listKey = lists.map((list) => list.items.map((item) => item.name).join("|")).join(";");
  useEffect(() => {
    if (!ready) return;
    const queries = lists.flatMap((list) => list.items.map((item) => item.name));
    void brainOf({ data: { queries } })
      .then(setBrain)
      .catch(() => undefined);
  }, [ready, listKey]);

  const zipValid = zipOk(country, zip);

  const catalog = COUNTRIES[country];

  function onAdd(name: string) {
    const ok = addItem(name);
    setNote(ok ? "" : "Уже в списке");
    if (ok) setDraft("");
  }

  async function onUpdateLeaflets() {
    if (!zipValid || country !== "de" || updatingLeaflets) return;
    setUpdatingLeaflets(true);
    setNote("");
    try {
      await study({data:{country,zip}});
      setNote("Листовки обновлены. Нажмите «Найти акции».");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Не удалось обновить листовки");
    } finally {
      setUpdatingLeaflets(false);
    }
  }

  async function onScan() {
    const targets = lists.filter((list) => list.items.length > 0);
    if (!zipValid || targets.length === 0 || scanning) return;
    setScanning(true);
    setNote("");
    setProgress("");
    const total = targets.reduce((sum, list) => sum + list.items.length, 0);
    let done = 0;

    for (const list of targets) {
      const byItem: Record<string, Deal[]> = {};
      const errors: Record<string, string> = {};
      await Promise.all(
        list.items.map(async (item) => {
          try {
            byItem[item.name] = await scan({
              data: {
                country,
                zip,
                query: item.name,
                retailers,
              },
            });
          } catch (err) {
            byItem[item.name] = [];
            errors[item.name] = err instanceof Error ? err.message : "Не удалось проверить";
          } finally {
            done += 1;
            setProgress(`${done} / ${total}`);
          }
        }),
      );
      setListScan(list.id, { at: new Date().toISOString(), byItem, errors });
    }

    setScanning(false);
    setProgress("");
    const queries = lists.flatMap((list) => list.items.map((item) => item.name));
    void brainOf({ data: { queries } })
      .then(setBrain)
      .catch(() => undefined);
  }

  const fresh = lastScan ? isCurrentFlyer(lastScan.at) : false;
  const week = flyerLabel();
  const visibleItems = items.filter((item) => inCategories(item.name, categories));
  const hits = lastScan
    ? visibleItems.reduce((sum, item) => {
        const deals = (lastScan.byItem[item.name] ?? []).filter(
          (deal) =>
            offerFits(item.name, deal.productName, deal.description, deal.category ?? "") &&
            dealInCategory(item.name, deal.category ?? "", deal.productName, categories) &&
            dealStillOn(deal),
        );
        return sum + deals.length;
      }, 0)
    : 0;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="h-1 bg-stamp" />
      <header className="mx-auto flex max-w-6xl items-end justify-between gap-4 px-4 pt-6 pb-4 sm:px-6">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">Проспекты</p>
          <h1 className="font-display text-4xl leading-none sm:text-5xl">Angebote</h1>
        </div>
        <p className="hidden text-right text-sm text-muted sm:block">
          Список покупок сверяется
          <br />с акциями у дома
        </p>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 sm:px-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="border border-line bg-card p-4">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(COUNTRIES) as CountryCode[]).map((code) => (
              <button
                key={code}
                type="button"
                className={
                  code === country
                    ? "h-11 bg-ink text-sm font-medium text-paper"
                    : "h-11 border border-line text-sm text-ink"
                }
                onClick={() => setCountry(code)}
              >
                {COUNTRIES[code].label}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-sm text-muted" htmlFor="zip">
            Индекс
          </label>
          <div className="mt-1 flex items-center gap-2 border border-line bg-paper px-3">
            <MapPin className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <input
              id="zip"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={catalog.zipLength}
              placeholder={country === "de" ? "10115" : "1010"}
              value={zip}
              onChange={(event) => setZip(event.target.value.replace(/\D/g, ""))}
              className="h-11 w-full bg-transparent text-base outline-none"
            />
          </div>
          {!zipValid && zip.length > 0 ? (
            <p className="mt-1 text-sm text-stamp">Нужно {catalog.zipLength} цифр</p>
          ) : null}

          <form
            className="relative mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const picked = showSuggest ? matches[highlight] : undefined;
              onAdd(picked?.name ?? draft);
              setFocused(false);
            }}
          >
            <label className="text-sm text-muted" htmlFor="item">
              Что искать в акциях
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="item"
                role="combobox"
                aria-expanded={showSuggest}
                aria-controls="product-suggest"
                aria-autocomplete="list"
                value={draft}
                placeholder="gur → Gurke"
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setNote("");
                  setFocused(true);
                }}
                onKeyDown={(event) => {
                  if (!showSuggest) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlight((index) => Math.min(index + 1, matches.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlight((index) => Math.max(index - 1, 0));
                  } else if (event.key === "Escape") {
                    setFocused(false);
                  }
                }}
                className="h-11 min-w-0 flex-1 border border-line bg-paper px-3 text-base outline-none"
              />
              <button
                type="submit"
                className="grid size-11 shrink-0 place-items-center bg-stamp text-stamp-ink"
                aria-label="Добавить"
              >
                <Plus className="size-5" />
              </button>
            </div>
            {showSuggest ? (
              <ul
                id="product-suggest"
                role="listbox"
                className="absolute z-20 mt-1 right-14 left-0 max-h-64 overflow-auto border border-line bg-card shadow-sm"
              >
                {matches.map((hint, index) => {
                  const name = hint.name;
                  const typed = draft.trim();
                  const head = name.toLowerCase().startsWith(typed.toLowerCase()) ? typed.length : 0;
                  return (
                    <li key={`${hint.fromFlyer ? "flyer" : "dict"}-${name}`} role="option" aria-selected={index === highlight}>
                      <button
                        type="button"
                        className={
                          index === highlight
                            ? "flex h-11 w-full items-center px-3 text-left text-sm bg-paper"
                            : "flex h-11 w-full items-center px-3 text-left text-sm"
                        }
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => {
                          onAdd(name);
                          setFocused(false);
                        }}
                      >
                        <span className="font-medium">{name.slice(0, head)}</span>
                        <span className="text-muted">{name.slice(head)}</span>
                        {hint.fromFlyer ? (
                          <span className="ml-auto pl-3 text-xs text-muted">
                            из листовок{hint.seen > 1 ? ` · ${hint.seen}` : ""}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {note ? <p className="mt-1 text-sm text-stamp">{note}</p> : null}
          </form>

          <div className="mt-4">
            <p className="text-sm text-muted">Категории</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                className={
                  categories.length === 0
                    ? "h-11 shrink-0 bg-ink px-3 text-sm text-paper"
                    : "h-11 shrink-0 border border-line px-3 text-sm"
                }
                onClick={clearCategories}
              >
                Все
              </button>
              {CATEGORIES.map((category) => {
                const on = categories.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    className={
                      on
                        ? "h-11 shrink-0 bg-ink px-3 text-sm text-paper"
                        : "h-11 shrink-0 border border-line px-3 text-sm"
                    }
                    onClick={() => toggleCategory(category.id)}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>

          <details className="mt-4">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm">
              <span>Точные запросы</span>
              <span className="text-muted">{EXACT_QUERIES.length}</span>
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {CATEGORIES.map((category) => {
                const rules = EXACT_QUERIES.filter((rule) => categoryOf(rule.query) === category.id);
                if (rules.length === 0) return null;
                return (
                  <li key={category.id} className="py-2">
                    <p className="text-xs font-medium tracking-[0.14em] text-muted uppercase">{category.label}</p>
                    <ul className="mt-1">
                      {rules.map((rule) => (
                        <li key={rule.query} className="py-1.5">
                          <p>
                            <span className="font-medium">{rule.query}</span>
                            <span className="text-muted"> — {rule.means}</span>
                          </p>
                          <p className="text-xs text-muted">не {rule.not.join(", ")}</p>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
              {EXACT_QUERIES.filter((rule) => categoryOf(rule.query) == null).map((rule) => (
                <li key={rule.query} className="py-1.5">
                  <p>
                    <span className="font-medium">{rule.query}</span>
                    <span className="text-muted"> — {rule.means}</span>
                  </p>
                  <p className="text-xs text-muted">не {rule.not.join(", ")}</p>
                </li>
              ))}
            </ul>
          </details>

          <details className="mt-4">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm">
              <span>Нейросеть товаров</span>
              <span className="text-muted">
                {neural?.active ? "активна · v2" : "не активирована"}
              </span>
            </summary>
            <p className="text-sm text-muted">
              {neural?.active
                ? `Версия ${neural.active.id}. Обучающих примеров: ${neural.active.trainCount}; проверочных: ${neural.active.validationCount}; контрольных: ${neural.active.testCount}. Поддерживаемых запросов: ${neural.active.supportedIntents.length}.`
                : "Поиск использует правила. Новая нейросеть включается после отдельного обучения и проверки качества."}
            </p>
            {neural?.active ? <p className="mt-2 text-xs text-muted">
              Схема признаков: {neural.active.featureVersion}; {neural.active.featureVersion === 3 ? "с группами товарных категорий" : "текст названия, категории и описания"}.
              В подготовленном наборе: ручных меток {neural.active.sources.human ?? 0}, авторских учебных {neural.active.sources.curated ?? 0}, автоматических {neural.active.sources.rules ?? 0}.
            </p> : null}
            <p className="mt-2 text-xs text-muted">
              Обучение использует накопленный архив и проверенные метки. Новая версия включается только после проверки качества. Контрольный набор авторский; его результат не означает такую же точность на всех акциях. При неопределённом ответе используются правила.
            </p>
            <div className="mt-3 space-y-2">
              {training?.configured ? <>
                <label htmlFor="training-key" className="block text-sm">Ключ владельца</label>
                <input id="training-key" type="password" autoComplete="off" value={trainingKey}
                  onChange={event => setTrainingKey(event.target.value)}
                  className="h-11 w-full rounded-md border border-line bg-transparent px-3"
                  placeholder="Ключ для запуска обучения" />
                <button type="button" onClick={() => void beginTraining()}
                  disabled={startingTraining || trainingBusy || !trainingKey.trim()}
                  className="h-11 rounded-md border border-line px-3 text-sm disabled:opacity-50">
                  {startingTraining ? "Запускаем…" : trainingBusy ? "Обучение выполняется…" : "Обучить нейросеть"}
                </button>
                <p className="text-xs text-muted">Страницу можно закрыть: обучение продолжится на сервере. Ключ хранится только до перезагрузки страницы.</p>
              </> : training ? <p className="text-sm text-muted">Для кнопки обучения настройте ключ владельца TRAINING_ADMIN_TOKEN на сервере.</p> : null}
              <div role="status" data-testid="training-status" className="text-sm">
                {training?.job ? <>
                  <p>{training.job.status === "queued" ? "Обучение в очереди…"
                    : training.job.status === "running" ? training.job.stage === "preparing" ? "Подготовка обучающих данных…"
                      : training.job.stage === "checking" ? "Проверка и сохранение модели…" : "Нейросеть обучается…"
                    : training.job.status === "succeeded" ? "Обучение завершено. Модель включена."
                    : training.job.status === "rejected" ? "Обучение завершено. Качество не прошло проверку; действующая модель сохранена."
                    : training.job.error}</p>
                  {training.job.result ? <p className="mt-1 text-xs text-muted">
                    Версия {training.job.result.candidate}. Обучающих примеров: {training.job.result.trainCount}; проверочных: {training.job.result.validationCount}; контрольных: {training.job.result.testCount}.
                    {training.job.result.deployedControlAccuracy !== null ? ` Результат на авторском контроле: ${(training.job.result.deployedControlAccuracy * 100).toFixed(2)}%.` : ""}
                  </p> : null}
                  {training.job.result?.reasons.map(reason => <p className="text-xs text-muted" key={reason}>{reason}</p>)}
                </> : null}
              </div>
              {trainingError ? <p role="alert" className="text-sm">{trainingError}</p> : null}
            </div>
            {training?.configured ? <ProductReviewPanel ownerKey={trainingKey}
              reviewedCount={neural?.reviewedLabels ?? 0}
              onReviewed={count=>setNeural(model=>model ? {...model,reviewedLabels:count} : model)} /> : null}
            <p className="mt-2 text-sm text-muted">Названия из ранее накопленного словаря:</p>
            {brain && brain.intents.length > 0 ? (
              <ul className="mt-2 divide-y divide-line">
                {brain.intents.map((intent) => (
                  <li key={intent.intent} className="py-2 text-sm">
                    <p className="font-medium">{intent.intent}</p>
                    {intent.names.length > 0 ? (
                      <p className="text-muted">в листовках: {intent.names.join(", ")}</p>
                    ) : null}
                    {intent.rejected.length > 0 ? (
                      <p className="text-muted">не это: {intent.rejected.join(", ")}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Пока нет названий в словаре. Новые товары сохраняются при поиске и обновлении листовок.
              </p>
            )}
          </details>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted">Списки</p>
              {lists.length > 1 && active ? (
                <button
                  type="button"
                  className="h-11 px-2 text-sm text-muted"
                  onClick={() => deleteList(active.id)}
                >
                  Удалить
                </button>
              ) : null}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {lists.map((list) => {
                const on = list.id === active?.id;
                return (
                  <button
                    key={list.id}
                    type="button"
                    className={
                      on
                        ? "h-11 shrink-0 bg-ink px-3 text-sm text-paper"
                        : "h-11 shrink-0 border border-line px-3 text-sm"
                    }
                    onClick={() => setActiveList(list.id)}
                  >
                    {list.name}
                    <span className={on ? "text-paper/70" : "text-muted"}> {list.items.length}</span>
                  </button>
                );
              })}
            </div>
            {makingList ? (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const trimmed = listDraft.trim();
                  if (!trimmed) return;
                  const ok = createList(trimmed);
                  setListNote(ok ? "" : "Такой список уже есть");
                  if (ok) {
                    setListDraft("");
                    setMakingList(false);
                  }
                }}
              >
                <input
                  value={listDraft}
                  autoFocus
                  placeholder="Например, Неделя"
                  onChange={(event) => setListDraft(event.target.value)}
                  className="h-11 min-w-0 flex-1 border border-line bg-paper px-3 text-base outline-none"
                />
                <button type="submit" className="h-11 shrink-0 bg-ink px-3 text-sm text-paper">
                  Создать
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="mt-2 h-11 text-sm font-medium underline decoration-line underline-offset-4"
                onClick={() => {
                  setListNote("");
                  setMakingList(true);
                }}
              >
                Новый список
              </button>
            )}
            {listNote ? <p className="mt-1 text-sm text-stamp">{listNote}</p> : null}
          </div>

          {items.length === 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(categories.length > 0 ? productsIn(categories) : SUGGESTIONS).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="h-11 border border-line px-3 text-sm"
                  onClick={() => onAdd(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}

          <details className="mt-5">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm">
              <span>Магазины</span>
              <span className="text-muted">{retailers.length === 0 ? "все" : retailers.length}</span>
            </summary>
            <div className="flex flex-wrap gap-2 pb-1">
              <button
                type="button"
                className={
                  retailers.length === 0
                    ? "h-11 bg-ink px-3 text-sm text-paper"
                    : "h-11 border border-line px-3 text-sm"
                }
                onClick={clearRetailers}
              >
                Все
              </button>
              {catalog.retailers.map((name) => {
                const on = retailers.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className={
                      on ? "h-11 bg-ink px-3 text-sm text-paper" : "h-11 border border-line px-3 text-sm"
                    }
                    onClick={() => toggleRetailer(name)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </details>

          <ul className="mt-4 divide-y divide-line border-t border-line">
            {items.filter((item) => inCategories(item.name, categories)).map((item) => {
              const rule = exactQueryFor(item.name);
              const cat = categoryOf(item.name);
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{item.name}</span>
                    {rule ? (
                      <span className="mt-0.5 block text-xs text-muted">
                        {rule.means}. Не {rule.not.join(", ")}
                      </span>
                    ) : cat ? (
                      <span className="mt-0.5 block text-xs text-muted">{categoryLabel(cat)}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="grid size-11 shrink-0 place-items-center text-muted"
                    aria-label={`Убрать ${item.name}`}
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {ready && items.length > 0 && items.every((item) => !inCategories(item.name, categories)) ? (
            <p className="py-4 text-sm text-muted">В этой категории в списке пусто.</p>
          ) : null}
          {ready && items.length === 0 ? (
            <p className="py-6 text-sm text-muted">
              Добавьте товары, которые покупаете регулярно. Приложение спросит Marktguru, нет ли их сейчас в проспекте.
            </p>
          ) : null}
        </section>

        <section className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-3xl">{fresh || !lastScan ? "Сейчас в акциях" : "Прошлая неделя"}</h2>
            <p className="text-sm text-muted">
              {lastScan ? `${hits} · ${formatWhen(lastScan.at)}` : ready ? "ещё не проверяли" : ""}
            </p>
          </div>
          {ready ? (
            <p className={fresh || !lastScan ? "mt-2 text-sm text-muted" : "mt-3 border border-stamp px-3 py-2 text-sm"}>
              {lastScan && !fresh
                ? `Проспекты уже другие, сейчас ${week} Списки ниже ещё со старого ассортимента.`
                : "Сначала ищем в сохранённых акциях вашего индекса. Если совпадений нет — запрашиваем Marktguru."}
            </p>
          ) : null}

          {!lastScan && !scanning && items.length === 0 ? (
            <p className="mt-6 max-w-md text-sm text-muted">
              Укажите индекс и список. Проверка идёт по текущим листовкам Aldi, Lidl, Rewe, Edeka и остальных сетей рядом с вами.
            </p>
          ) : null}

          {visibleItems.map((item) => {
            const known = lastScan != null && Object.prototype.hasOwnProperty.call(lastScan.byItem, item.name);
            const raw = known ? (lastScan?.byItem[item.name] ?? []) : [];
            const fitting = raw.filter(
              (deal) =>
                offerFits(item.name, deal.productName, deal.description, deal.category ?? "") &&
                dealInCategory(item.name, deal.category ?? "", deal.productName, categories),
            );
            const deals = fitting.filter((deal) => dealStillOn(deal));
            return (
              <ItemResults
                key={item.id}
                item={item.name}
                deals={deals}
                error={known && !scanning ? (lastScan?.errors[item.name] ?? null) : null}
                known={known}
                scanning={scanning}
                dropped={raw.length - fitting.length}
                assortment={assortmentNames(deals)}
                fresh={fresh}
              />
            );
          })}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button
            type="button"
            disabled={!zipValid || lists.every((list) => list.items.length === 0) || scanning}
            onClick={() => void onScan()}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 bg-stamp px-4 text-base font-medium text-stamp-ink disabled:opacity-40 sm:flex-none sm:px-8"
          >
            {scanning ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            {scanning ? `Ищем ${progress}` : "Найти акции"}
          </button>
          <button
            type="button"
            disabled={!zipValid || country !== "de" || updatingLeaflets}
            onClick={() => void onUpdateLeaflets()}
            className="h-12 shrink-0 border border-line px-3 text-sm disabled:opacity-40"
          >
            {updatingLeaflets ? "Обновляем листовки…" : "Обновить листовки"}
          </button>
          {scanning ? null : (
            <p className="hidden text-sm text-muted sm:block">
              {lists.every((list) => list.items.length === 0)
                ? "Сначала добавьте товар"
                : !zipValid
                  ? "Нужен почтовый индекс"
                  : ready
                    ? `Все списки · ${week}`
                    : "Все списки"}
            </p>
          )}
          {note && items.length > 0 ? (
            <button type="button" className="ml-auto text-muted sm:hidden" onClick={() => setNote("")}>
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
