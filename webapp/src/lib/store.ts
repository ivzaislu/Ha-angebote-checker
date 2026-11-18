import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CountryCode } from "@/lib/catalog";
import type { Deal } from "@/lib/deals";

export type WatchItem = { id: string; name: string };

export type LastScan = {
  at: string;
  byItem: Record<string, Deal[]>;
  errors: Record<string, string>;
};

type State = {
  items: WatchItem[];
  country: CountryCode;
  zip: string;
  retailers: string[];
  lastScan: LastScan | null;
  addItem: (name: string) => boolean;
  removeItem: (id: string) => void;
  setCountry: (country: CountryCode) => void;
  setZip: (zip: string) => void;
  toggleRetailer: (name: string) => void;
  clearRetailers: () => void;
  setLastScan: (scan: LastScan) => void;
};

export const useAngebote = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      country: "de",
      zip: "",
      retailers: [],
      lastScan: null,
      addItem: (name) => {
        const trimmed = name.trim().replace(/\s+/g, " ");
        if (!trimmed) return false;
        if (get().items.some((item) => item.name.toLowerCase() === trimmed.toLowerCase())) {
          return false;
        }
        set({
          items: [...get().items, { id: crypto.randomUUID(), name: trimmed }],
        });
        return true;
      },
      removeItem: (id) => {
        const name = get().items.find((item) => item.id === id)?.name;
        const last = get().lastScan;
        let lastScan = last;
        if (last && name) {
          const byItem = { ...last.byItem };
          const errors = { ...last.errors };
          delete byItem[name];
          delete errors[name];
          lastScan = { ...last, byItem, errors };
        }
        set({ items: get().items.filter((item) => item.id !== id), lastScan });
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
      setLastScan: (lastScan) => set({ lastScan }),
    }),
    {
      name: "angebote-v1",
      skipHydration: true,
      partialize: (state) => ({
        items: state.items,
        country: state.country,
        zip: state.zip,
        retailers: state.retailers,
        lastScan: state.lastScan,
      }),
    },
  ),
);
