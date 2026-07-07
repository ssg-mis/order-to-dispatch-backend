-- Create dispatch_drafts table for Save as Draft feature (Actual Dispatch stage)
-- Drafts are shared per order (any user can view/continue one), so the draft is
-- keyed by order_key alone; username just records who saved it last.
CREATE TABLE IF NOT EXISTS dispatch_drafts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username    text NOT NULL,
  order_key   text NOT NULL,
  draft_data  jsonb NOT NULL,
  saved_at    timestamptz DEFAULT now(),
  UNIQUE(order_key)
);
