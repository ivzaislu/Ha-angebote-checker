create table if not exists offer_brain (
  id text primary key,
  model text not null,
  updated_at timestamptz not null default now()
);
