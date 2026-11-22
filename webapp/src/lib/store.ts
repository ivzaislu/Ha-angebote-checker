import { create } from "zustand";
import { clientId } from "./client-id.ts";
import { persist } from "zustand/middleware";
import type { CountryCode } from "@/lib/catalog";
import type { Deal } from "@/lib/deals";

export type WatchItem = { id: string; name: string };

export type ShopList = { id: string; name: string; items: WatchItem[] };

export type LastScan = {
  matchingMode?: string;
  rulesVersion?: number;
  at: string;
  byItem: Record<string, Deal[]>;
  errors: Record<string, string>;
};

const DEFAULT_LIST_ID = "list-einkauf";

function blankList(): ShopList {
  return { id: DEFAULT_LIST_ID, name: "Einkauf", items: [] };
}

type PersistedV1 = {
  items?: WatchItem[];
  lists?: ShopList[];
  activeListId?: string;
  scans?: Record<string, LastScan>;
  lastScan?: LastScan | null;
  country?: CountryCode;
  zip?: string;
  retailers?: string[];
};

type State = {
  lists: ShopList[];
  activeListId: string;
  country: CountryCode;
  zip: string;
  retailers: string[];
  categories: string[];
  scans: Record<string, LastScan>;
  createList: (name: string) => boolean;
  deleteList: (id: string) => void;
  setActiveList: (id: string) => void;
  addItem: (name: string) => boolean;
  removeItem: (id: string) => void;
  setCountry: (country: CountryCode) => void;
  setZip: (zip: string) => void;
  toggleRetailer: (name: string) => void;
  clearRetailers: () => void;
  toggleCategory: (id: string) => void;
  clearCategories: () => void;
  setLastScan: (scan: LastScan) => void;
  setListScan: (listId: string, scan: LastScan) => void;
};

function activeOf(state: Pick<State, "lists" | "activeListId">): ShopList | undefined {
  return state.lists.find((list) => list.id === state.activeListId) ?? state.lists[0];
}

export const useAngebote = create<State>()(
  persist(
    (set, get) => ({
      lists: [blankList()],
      activeListId: DEFAULT_LIST_ID,
      country: "de",
      zip: "",
      retailers: [],
      categories: [],
      scans: {},
      createList: (name) => {
        const trimmed = name.trim().replace(/\s+/g, " ");
        if (!trimmed) return false;
        if (get().lists.some((list) => list.name.toLowerCase() === trimmed.toLowerCase())) return false;
        const id = clientId();
        set({
          lists: [...get().lists, { id, name: trimmed, items: [] }],
          activeListId: id,
        });
        return true;
      },
      deleteList: (id) => {
        const lists = get().lists;
        if (lists.length <= 1) return;
        const next = lists.filter((list) => list.id !== id);
        const scans = { ...get().scans };
        delete scans[id];
        set({
          lists: next,
          activeListId: get().activeListId === id ? next[0].id : get().activeListId,
          scans,
        });
      },
      setActiveList: (id) => {
        if (get().lists.some((list) => list.id === id)) set({ activeListId: id });
      },
      addItem: (name) => {
        const trimmed = name.trim().replace(/\s+/g, " ");
        if (!trimmed) return false;
        const current = activeOf(get());
        if (!current) return false;
        if (current.items.some((item) => item.name.toLowerCase() === trimmed.toLowerCase())) return false;
        set({
          lists: get().lists.map((list) =>
            list.id === current.id
              ? { ...list, items: [...list.items, { id: clientId(), name: trimmed }] }
              : list,
          ),
        });
        return true;
      },
      removeItem: (id) => {
        const current = activeOf(get());
        if (!current) return;
        const name = current.items.find((item) => item.id === id)?.name;
        const scan = get().scans[current.id];
        const scans = { ...get().scans };
        if (scan && name) {
          const byItem = { ...scan.byItem };
          const errors = { ...scan.errors };
          delete byItem[name];
          delete errors[name];
          scans[current.id] = { ...scan, byItem, errors };
        }
        set({
          lists: get().lists.map((list) =>
            list.id === current.id ? { ...list, items: list.items.filter((item) => item.id !== id) } : list,
          ),
          scans,
        });
      },
      setCountry: (country) => set({ country, retailers: [] }),
      setZip: (zip) => set({ zip }),
      toggleRetailer: (name) => {
        const current = get().retailers;
        set({
          retailers: current.includes(name)
            ? current.filter((entry) => entry !== name)
            : [...current, name],
        });
      },
      clearRetailers: () => set({ retailers: [] }),
      toggleCategory: (id) => {
        const current = get().categories;
        set({
          categories: current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
        });
      },
      clearCategories: () => set({ categories: [] }),
      setLastScan: (scan) => {
        const id = activeOf(get())?.id;
        if (!id) return;
        get().setListScan(id, scan);
      },
      setListScan: (listId, scan) => {
        if (!get().lists.some((list) => list.id === listId)) return;
        set({ scans: { ...get().scans, [listId]: scan } });
      },
    }),
    {
      name: "angebote-v1",
      version: 2,
      skipHydration: true,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as PersistedV1;
        if (state.lists && state.lists.length > 0 && state.activeListId) return state as State;
        const id = clientId();
        const scans: Record<string, LastScan> = { ...(state.scans ?? {}) };
        if (state.lastScan) scans[id] = state.lastScan;
        return {
          ...state,
          lists: [{ id, name: "Einkauf", items: state.items ?? [] }],
          activeListId: id,
          scans,
        } as State;
      },
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<State>) };
        // Translate only the reserved built-in default; user list names are content.
        state.lists = state.lists.map(list =>
          list.id === DEFAULT_LIST_ID && list.name === "\u041f\u043e\u043a\u0443\u043f\u043a\u0438"
            ? { ...list, name: "Einkauf" } : list);
        return state;
      },
      partialize: (state) => ({
        lists: state.lists,
        activeListId: state.activeListId,
        country: state.country,
        zip: state.zip,
        retailers: state.retailers,
        categories: state.categories,
        scans: state.scans,
      }),
    },
  ),
);
