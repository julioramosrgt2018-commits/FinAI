/*
# Add sync tracking columns to benefits table

## Overview
Adds `sync_enabled` and `last_sync` columns to the `benefits` table so that
VA/VR benefit cards (Caixa Pré-Pagos, Alelo, etc.) can be synced via the
Open Finance sync engine, just like bank accounts.

## New Columns
- `sync_enabled boolean DEFAULT false` — whether the benefit card is connected for auto-sync
- `last_sync timestamptz` — timestamp of the last successful sync

## Security
No policy changes needed — existing RLS policies already cover these columns.
*/

DO $$ BEGIN
  ALTER TABLE benefits ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE benefits ADD COLUMN IF NOT EXISTS last_sync timestamptz;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
