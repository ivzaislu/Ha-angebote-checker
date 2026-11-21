/** Operator-only collector/exporter. Credentials come from DATABASE_URL, never CLI args. */
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { gatherLessons } from "../src/lib/corpus.server.ts";
import { archiveOffers, prepareTrainingData, type TrainingSource } from "../src/lib/offer-archive.ts";

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
      await gatherLessons(zip, undefined, async offers => { inserted += await archiveOffers(sql, "de", zip, offers); });
      console.log(`${zip}: ${inserted} new snapshots`);
    }
  } else {
    const rows = await sql.query<TrainingSource>(`select snapshot_id,country,offer_id,name,description,category,variant_key
      from offer_archive where country='de' order by observed_at,snapshot_id`);
    const examples = prepareTrainingData(rows);
    await writeFile(args[0], examples.map(row => JSON.stringify(row)).join("\n") + (examples.length ? "\n" : ""), { flag: "wx" });
    console.log(`${examples.length} rule-labelled candidates exported; review before training`);
  }
} finally {
  await pool.end();
}
