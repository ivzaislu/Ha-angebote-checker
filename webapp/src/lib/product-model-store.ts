import { createHash } from "node:crypto";
import type { ArchiveSql } from "./offer-archive.ts";
import { validProductNet, type ProductNet } from "./product-net.ts";
import type { TrainingReport } from "./product-training.ts";
export type ProductModelPackage = { id: string; net: ProductNet; report: TrainingReport };
export async function saveProductCandidate(
  sql: ArchiveSql,
  net: ProductNet,
  report: TrainingReport,
): Promise<ProductModelPackage> {
  if (!validProductNet(net)) throw new Error("Invalid candidate weights");
  const id = `product-v2-${createHash("sha256")
    .update(JSON.stringify([net, report]))
    .digest("hex")
    .slice(0, 20)}`;
  await sql.query(
    `insert into product_models(id,dataset_fingerprint,model,report) values($1,$2,$3::jsonb,$4::jsonb)
    on conflict(id) do nothing`,
    [id, report.datasetFingerprint, JSON.stringify(net), JSON.stringify(report)],
  );
  return { id, net, report };
}
export async function readProductCandidate(
  sql: ArchiveSql,
  id: string,
): Promise<ProductModelPackage | null> {
  const [row] = await sql.query<{ id: string; model: unknown; report: TrainingReport }>(
    "select id,model,report from product_models where id=$1",
    [id],
  );
  if (!row) return null;
  if (
    !validProductNet(row.model) ||
    ![1, 2].includes(row.report.schemaVersion) ||
    !Array.isArray(row.report.supportedIntents) ||
    !Array.isArray(row.report.vocabulary)
  )
    throw new Error("Stored model is incompatible or corrupt");
  return { id: row.id, net: row.model, report: row.report };
}
export async function activeProductModelId(sql: ArchiveSql): Promise<string | null> {
  const [row] = await sql.query<{ model_id: string }>(
    "select model_id from product_model_active where singleton=1",
  );
  return row?.model_id ?? null;
}
/** Inspection only: returning a rejected candidate never changes the active pointer. */
export async function latestRejectedProductModel(
  sql: ArchiveSql,
): Promise<ProductModelPackage | null> {
  const [row] = await sql.query<{ id: string }>(`select id from product_models
    where report->>'eligible'='false' and report->>'schemaVersion'='2'
      and jsonb_typeof(report->'deployment')='object'
    order by created_at desc,id desc limit 1`);
  return row ? readProductCandidate(sql, row.id) : null;
}
/** Lease prevents an older training process from replacing a newly activated model. */
export async function activateProductCandidate(
  sql: ArchiveSql,
  id: string,
  expectedId: string | null,
  action: "activate" | "rollback" = "activate",
): Promise<void> {
  const model = await readProductCandidate(sql, id);
  if (!model || !model.report.eligible) throw new Error("Candidate did not pass the quality gate");
  if (
    action === "activate" &&
    (model.report.schemaVersion !== 2 || model.report.deployment?.version !== 2)
  )
    throw new Error("Obsolete evaluation policy; recheck the candidate before activation");
  if (action === "rollback") {
    const rows = await sql.query(
      "select id from product_model_events where model_id=$1 and action in ('activate','rollback') limit 1",
      [id],
    );
    if (!rows.length) throw new Error("Rollback requires a previously activated version");
  }
  const rows = await sql.query(
    `with pointer as (
    insert into product_model_active(singleton,model_id)
    select 1,$1 where (select model_id from product_model_active where singleton=1) is not distinct from $2::text
    on conflict(singleton) do update set model_id=excluded.model_id
      where product_model_active.model_id is not distinct from $2::text
    returning model_id
  ), stamp as (
    update product_models set activated_at=now() where id in (select model_id from pointer)
  ) insert into product_model_events(model_id,action) select model_id,$3 from pointer returning id`,
    [id, expectedId, action],
  );
  if (!rows.length)
    throw new Error(
      "Active model changed concurrently; inspect status and retrain before activation",
    );
}

export async function saveReviewedLabels(
  sql: ArchiveSql,
  rows: import("./product-net.ts").ProductExample[],
): Promise<number> {
  if (rows.some((row) => row.source !== "human"))
    throw new Error("Only explicitly reviewed human labels may be persisted");
  const { exampleKey } = await import("./product-training.ts");
  const payload = rows.map((row) => ({
    ...row,
    example_key: createHash("sha256").update(exampleKey(row)).digest("hex"),
  }));
  const saved = await sql.query(
    `insert into product_review_labels(example_key,intent,name,category,description,positive)
    select example_key,intent,name,category,description,positive from jsonb_to_recordset($1::jsonb)
      as x(example_key text,intent text,name text,category text,description text,positive boolean)
    on conflict(example_key) do update set positive=excluded.positive,updated_at=now()
    returning example_key`,
    [JSON.stringify(payload)],
  );
  return saved.length;
}
export async function readReviewedLabels(
  sql: ArchiveSql,
): Promise<import("./product-net.ts").ProductExample[]> {
  const rows = await sql.query<import("./product-net.ts").ProductExample>(
    "select intent,name,category,description,positive,'human' as source from product_review_labels order by updated_at desc,example_key limit 10000",
  );
  return rows;
}

/** Return to deterministic rules without deleting any trained version. */
export async function deactivateProductModel(sql: ArchiveSql, expectedId: string): Promise<void> {
  const rows = await sql.query(
    `with previous as (
    delete from product_model_active where singleton=1 and model_id=$1 returning model_id
  ) insert into product_model_events(model_id,action) select model_id,'deactivate' from previous returning id`,
    [expectedId],
  );
  if (!rows.length) throw new Error("Active model changed concurrently; inspect status");
}
