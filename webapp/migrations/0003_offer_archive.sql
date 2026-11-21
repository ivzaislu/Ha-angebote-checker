-- Immutable snapshots: a repeated scan is idempotent; changed prices survive.
create table if not exists offer_archive (
  snapshot_id text primary key,
  country text not null check (country in ('de', 'at')),
  source text not null default 'marktguru',
  offer_id text not null,
  zip text not null,
  retailer text not null,
  name text not null,
  name_key text not null,
  description text not null,
  category text not null,
  variant_key text not null,
  price numeric(12,2),
  unit text,
  quantity numeric,
  unit_price numeric,
  valid_from text not null,
  valid_to text not null,
  raw_payload jsonb not null,
  observed_at timestamptz not null default now()
);
create index if not exists offer_archive_history on offer_archive(country, name_key, price, observed_at);
create index if not exists offer_archive_region on offer_archive(country, zip, observed_at);
