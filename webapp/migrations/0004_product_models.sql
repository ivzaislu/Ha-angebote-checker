-- Versioned candidates and an explicit active pointer; inference never trains.
create table if not exists product_models (
  id text primary key,
  dataset_fingerprint text not null,
  model jsonb not null,
  report jsonb not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);
create table if not exists product_model_active (
  singleton integer primary key check (singleton = 1),
  model_id text not null references product_models(id)
);
create table if not exists product_model_events (
  id bigserial primary key,
  model_id text not null references product_models(id),
  action text not null check (action in ('activate','rollback','deactivate')),
  created_at timestamptz not null default now()
);
create table if not exists product_review_labels (
  example_key text primary key,
  intent text not null,
  name text not null,
  category text not null,
  description text not null,
  positive boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
