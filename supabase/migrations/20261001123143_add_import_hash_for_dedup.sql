/*
# Add Import Hash for Transaction Deduplication

## Overview
Adds an `import_hash` column to the `transactions` table so that imported
transactions (from OFX/CSV files) can be deduplicated. The hash is computed
from the combination of date, amount, description, and source account/card.

## New Columns
- `transactions.import_hash` (text, nullable, unique) — SHA-256 hash of
  date|amount|description|account_or_card_id. NULL for manually-created
  transactions.

## Security
- No policy changes needed — existing RLS policies already cover this column.
- A unique index on import_hash prevents duplicate imports from being inserted.
*/

DO $$ BEGIN
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_hash text;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_import_hash
  ON transactions(import_hash)
  WHERE import_hash IS NOT NULL;
