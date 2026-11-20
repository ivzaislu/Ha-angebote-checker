CREATE TABLE product_training_jobs (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','rejected','failed')),
  stage text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result jsonb,
  error text
);
CREATE UNIQUE INDEX product_training_one_active ON product_training_jobs ((true))
  WHERE status IN ('queued','running');
