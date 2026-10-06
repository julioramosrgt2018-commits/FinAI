/*
# Add Installment Tracking Columns to Transactions

## Overview
Adds `installments_total` and `installment_number` columns to the transactions table
so that credit card purchases paid in installments (parceladas) can be tracked
with their progress (e.g., Parcela 1/6, 2/6, etc.).

## New Columns
- `installments_total integer DEFAULT 1` — total number of installments (1 = à vista)
- `installment_number integer DEFAULT 1` — which installment this transaction represents

## Security
No policy changes needed — existing RLS policies already cover these columns.
*/

DO $$ BEGIN
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS installments_total integer NOT NULL DEFAULT 1;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS installment_number integer NOT NULL DEFAULT 1;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
