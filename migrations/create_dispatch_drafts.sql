-- Create dispatch_drafts table for Save as Draft feature (Actual Dispatch stage)
CREATE TABLE IF NOT EXISTS dispatch_drafts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username    text NOT NULL,
  order_key   text NOT NULL,
  draft_data  jsonb NOT NULL,
  saved_at    timestamptz DEFAULT now(),
  UNIQUE(username, order_key)
);

-- Index for fast lookups by (username, order_key)
CREATE INDEX IF NOT EXISTS idx_dispatch_drafts_lookup ON dispatch_drafts (username, order_key);
