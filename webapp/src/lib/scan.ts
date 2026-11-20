import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BrainView, FlyerHint } from "@/lib/brain";
import type { Deal } from "@/lib/deals";

const schema = z.object({
  country: z.enum(["de", "at"]),
  zip: z.string(),
  query: z.string(),
  retailers: z.array(z.string()),
});

function place(country: "de" | "at", zip: string): { country: "de" | "at"; zip: string } {
  const clean = zip.trim();
  if (country === "de" && !/^\d{5}$/.test(clean)) throw new Error("Для Германии нужен индекс из 5 цифр");
  if (country === "at" && !/^\d{4}$/.test(clean)) throw new Error("Для Австрии нужен индекс из 4 цифр");
  return { country, zip: clean };
}

export const scanQuery = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error("Некорректный запрос");
    const query = parsed.data.query.trim().replace(/\s+/g, " ");
    if (!query || query.length > 80) throw new Error("Введите название товара");
    return {
      ...place(parsed.data.country, parsed.data.zip),
      query,
      retailers: parsed.data.retailers.slice(0, 40),
    };
  })
  .handler(async ({ data }): Promise<Deal[]> => {
    const { searchDeals } = await import("@/lib/marktguru.server");
    return searchDeals(data);
  });

export const studyLeaflets = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const parsed = z.object({ country: z.enum(["de", "at"]), zip: z.string() }).safeParse(data);
    if (!parsed.success) throw new Error("Некорректный запрос");
    return place(parsed.data.country, parsed.data.zip);
  })
  .handler(async ({ data }): Promise<{ offers: number; already: boolean }> => {
    const { studyLeaflets: study } = await import("@/lib/marktguru.server");
    return study(data);
  });

export const flyerHints = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const parsed = z.object({ prefix: z.string() }).safeParse(data);
    if (!parsed.success) throw new Error("Некорректный запрос");
    return parsed.data.prefix.trim().slice(0, 40);
  })
  .handler(async ({ data }): Promise<FlyerHint[]> => {
    const { hintsFor } = await import("@/lib/brain.server");
    return hintsFor(data);
  });

export const brainSnapshot = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const parsed = z.object({ queries: z.array(z.string()) }).safeParse(data);
    if (!parsed.success) throw new Error("Некорректный запрос");
    return parsed.data.queries.map((query) => query.trim()).filter(Boolean).slice(0, 40);
  })
  .handler(async ({ data }): Promise<BrainView> => {
    const { snapshotFor } = await import("@/lib/brain.server");
    return snapshotFor(data);
  });

/** Autocomplete from products actually observed in offers, regardless of search intent. */
export const productHints = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({
    country: z.enum(["de", "at"]), prefix: z.string().min(2).max(40),
  }).parse(data))
  .handler(async ({ data }): Promise<{ name: string; seen: number }[]> => {
    const { knownProductHints } = await import("@/lib/product-knowledge.server");
    return knownProductHints(data.country, data.prefix);
  });

/** Locally archived observations, including expired offers, sorted from min to max. */
export const archivedPriceHistory = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({
    country: z.enum(["de", "at"]), name: z.string().min(3).max(180),
    zip: z.string().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    if (data.zip !== undefined) place(data.country, data.zip);
    const { getSql } = await import("@/lib/db");
    const { priceHistory } = await import("@/lib/offer-archive");
    return priceHistory(await getSql(), data.country, data.name, data.zip);
  });

/** Public read-only model status. */
export const neuralModelStatus = createServerFn({method:"GET"})
  .handler(async()=>{
    const {productModelStatus}=await import("@/lib/product-model.server");
    return productModelStatus();
  });

export const neuralTrainingStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const { trainingStatus } = await import("@/lib/product-training.server");
    return trainingStatus();
  });

export const trainNeuralModel = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ key: z.string().max(512) }).parse(data))
  .handler(async ({ data }) => {
    const { startTraining } = await import("@/lib/product-training.server");
    return startTraining(data.key);
  });
