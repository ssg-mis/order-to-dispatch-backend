-- Create gate_in_records table for Gate In workflow page
CREATE TABLE IF NOT EXISTS gate_in_records (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_key            text NOT NULL,
  username             text NOT NULL,
  front_vehicle_image  text,
  back_vehicle_image   text,
  driver_photo         text,
  submitted_at         timestamptz DEFAULT now(),
  UNIQUE(order_key)
);

CREATE INDEX IF NOT EXISTS idx_gate_in_records_order_key ON gate_in_records (order_key);
