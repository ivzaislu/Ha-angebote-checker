import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Deal } from "@/lib/deals";

const schema = z.object({
  country: z.enum(["de", "at"]),
  zip: z.string(),
  query: z.string(),
  retailers: z.array(z.string()),
});

export const scanQuery = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error("Некорректный запрос");
    const query = parsed.data.query.trim().replace(/\s+/g, " ");
    const zip = parsed.data.zip.trim();
    if (!query || query.length > 80) throw new Error("Введите название товара");
    if (parsed.data.country === "de" && !/^\d{5}$/.test(zip)) {
      throw new Error("Для Германии нужен индекс из 5 цифр");
    }
    if (parsed.data.country === "at" && !/^\d{4}$/.test(zip)) {
      throw new Error("Для Австрии нужен индекс из 4 цифр");
    }
    return {
      country: parsed.data.country,
      zip,
      query,
      retailers: parsed.data.retailers.slice(0, 40),
    };
  })
  .handler(async ({ data }): Promise<Deal[]> => {
    const { searchDeals } = await import("@/lib/marktguru.server");
    return searchDeals(data);
  });
