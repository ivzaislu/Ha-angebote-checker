import { useEffect, useState } from "react";
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
import { scanQuery } from "@/lib/scan";
import { useAngebote, type LastScan } from "@/lib/store";

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
        <p className="mt-1 line-clamp-2 text-sm text-ink">
          {deal.productName && deal.productName !== deal.description
            ? `${deal.productName} · ${deal.description}`
            : deal.description || deal.productName}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {dates ? (
            <span className="inline-flex items-center gap-1">
              <CalendarRange className="size-3.5" aria-hidden="true" />
              {dates}
            </span>
          ) : null}
          {deal.onlineOnly ? <span>только онлайн</span> : null}
          {deal.relevance < 50 ? <span>похожее</span> : null}
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
}: {
  item: string;
  deals: Deal[];
  error: string | null;
  known: boolean;
  scanning: boolean;
}) {
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
      {error ? <p className="text-sm text-stamp">{error}</p> : null}
      {!error && known && deals.length === 0 ? (
        <p className="text-sm text-muted">В текущих проспектах по этому индексу ничего не нашлось.</p>
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
  const setLastScan = useAngebote((s) => s.setLastScan);

  const active = lists.find((list) => list.id === activeListId) ?? lists[0];
  const items = active?.items ?? [];
  const lastScan = active ? (scans[active.id] ?? null) : null;

  const scan = useServerFn(scanQuery);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [makingList, setMakingList] = useState(false);
  const [listDraft, setListDraft] = useState("");
  const [listNote, setListNote] = useState("");

  const matches = suggestProducts(draft, categories);
  const showSuggest = focused && matches.length > 0;

  useEffect(() => {
    void Promise.resolve(useAngebote.persist.rehydrate()).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [draft]);

  const zipValid = zipOk(country, zip);
  const catalog = COUNTRIES[country];

  function onAdd(name: string) {
    const ok = addItem(name);
    setNote(ok ? "" : "Уже в списке");
    if (ok) setDraft("");
  }

  async function onScan() {
    if (!zipValid || items.length === 0 || scanning) return;
    const snapshot = items.slice();
    setScanning(true);
    setNote("");
    const byItem: Record<string, Deal[]> = {};
    const errors: Record<string, string> = {};
    let done = 0;

    await Promise.all(
      snapshot.map(async (item) => {
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
          setProgress(`${done} / ${snapshot.length}`);
        }
      }),
    );

    const next: LastScan = { at: new Date().toISOString(), byItem, errors };
    setLastScan(next);
    setScanning(false);
    setProgress("");
  }

  const visibleItems = items.filter((item) => inCategories(item.name, categories));
  const hits = lastScan
    ? visibleItems.reduce((sum, item) => {
        const deals = (lastScan.byItem[item.name] ?? []).filter((deal) =>
          dealInCategory(item.name, deal.category ?? "", deal.productName, categories),
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
              onAdd(picked ?? draft);
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
                {matches.map((name, index) => {
                  const typed = draft.trim();
                  const head = name.toLowerCase().startsWith(typed.toLowerCase()) ? typed.length : 0;
                  return (
                    <li key={name} role="option" aria-selected={index === highlight}>
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
              const cat = categoryOf(item.name);
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {item.name}
                    {cat ? <span className="ml-2 text-xs text-muted">{categoryLabel(cat)}</span> : null}
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
            <h2 className="font-display text-3xl">Сейчас в акциях</h2>
            <p className="text-sm text-muted">
              {lastScan ? `${hits} · ${formatWhen(lastScan.at)}` : ready ? "ещё не проверяли" : ""}
            </p>
          </div>

          {!lastScan && !scanning && items.length === 0 ? (
            <p className="mt-6 max-w-md text-sm text-muted">
              Укажите индекс и список. Проверка идёт по текущим листовкам Aldi, Lidl, Rewe, Edeka и остальных сетей рядом с вами.
            </p>
          ) : null}

          {visibleItems.map((item) => {
            const known = lastScan != null && Object.prototype.hasOwnProperty.call(lastScan.byItem, item.name);
            const deals = (known ? (lastScan?.byItem[item.name] ?? []) : []).filter((deal) =>
              dealInCategory(item.name, deal.category ?? "", deal.productName, categories),
            );
            return (
              <ItemResults
                key={item.id}
                item={item.name}
                deals={deals}
                error={known && !scanning ? (lastScan?.errors[item.name] ?? null) : null}
                known={known}
                scanning={scanning}
              />
            );
          })}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button
            type="button"
            disabled={!zipValid || items.length === 0 || scanning}
            onClick={() => void onScan()}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 bg-stamp px-4 text-base font-medium text-stamp-ink disabled:opacity-40 sm:flex-none sm:px-8"
          >
            {scanning ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            {scanning ? `Проверяем ${progress}` : "Проверить акции"}
          </button>
          {scanning ? null : (
            <p className="hidden text-sm text-muted sm:block">
              {items.length === 0
                ? "Сначала добавьте товар"
                : !zipValid
                  ? "Нужен почтовый индекс"
                  : retailers.length === 0
                    ? "Все магазины"
                    : retailers.join(", ")}
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
