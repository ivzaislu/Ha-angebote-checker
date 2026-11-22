/** Operator-only collector/exporter. Credentials come from DATABASE_URL, never CLI args. */
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { gatherOffers } from "../src/lib/corpus.server.ts";
import { archiveOffers } from "../src/lib/offer-archive.ts";

if (!process.env.DATABASE_URL?.trim()) throw new Error("A persistent DATABASE_URL is required; run npm run db:migrate first");
const [command, ...args] = process.argv.slice(2);
if (command !== "collect" && command !== "export") throw new Error("Usage: archive:collect ZIP... | archive:export output.jsonl");
if (command === "collect" && (!args.length || args.length > 30 || args.some(zip => !/^\d{5}$/.test(zip)))) {
  throw new Error("Specify 1–30 German five-digit postcodes");
}
if (command === "export" && args.length !== 1) throw new Error("Specify an output JSONL file");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const sql = { query: async <T>(text: string, params?: unknown[]): Promise<T[]> => (await pool.query(text, params)).rows as T[] };
try {
  if (command === "collect") {
    for (const zip of new Set(args)) {
      let inserted = 0;
      await gatherOffers(zip, undefined, async offers => { inserted += await archiveOffers(sql, "de", zip, offers); });
      console.log(`${zip}: ${inserted} new snapshots`);
    }
  } else {
    const rows = await sql.query(`select snapshot_id,country,offer_id,zip,retailer,name,description,category,
      variant_key,price,unit,quantity,unit_price,valid_from,valid_to,observed_at,raw_payload
      from offer_archive order by observed_at,snapshot_id`);
    await writeFile(args[0], rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), { flag: "wx" });
    console.log(`${rows.length} archive snapshots exported`);
  }
} finally {
  await pool.end();
}
