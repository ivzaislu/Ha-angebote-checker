-- Product vocabulary and observed prices, independent of neural-network weights.
create table if not exists known_products (
  country text not null,
  name_key text not null,
  name text not null,
  category text not null default '',
  seen_count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (country, name_key)
);
create index if not exists known_products_recent on known_products (country, seen_count desc);
create table if not exists observed_prices (
  country text not null,
  offer_id text not null,
  retailer text not null,
  name_key text not null,
  price numeric(12,2) not null,
  observed_at timestamptz not null default now(),
  primary key (country, offer_id, retailer)
);
create index if not exists observed_prices_product on observed_prices (country, name_key, observed_at desc);
