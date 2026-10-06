/*
# Add Profile Isolation (PF/PJ) and Sync Tracking

## Overview
This migration adds a `profile` column to all data tables so that Pessoa Física (PF) and Pessoa Jurídica (PJ) data are strictly isolated. It also creates a `sync_log` table to track Open Finance synchronization events.

## New Columns
Added `profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'))` to:
- categories
- accounts
- credit_cards
- card_invoices
- transactions
- benefits
- benefit_transactions
- loans
- loan_installments
- investments
- investment_transactions
- ai_conversations
- alerts

All existing rows default to 'pf' so current data remains visible in the default PF view.

## New Tables
- `sync_log`: Tracks Open Finance sync events with timestamp, status, and details.

## Security
- RLS enabled on sync_log with anon+authenticated CRUD (single-tenant, no-auth app).
- All existing policies remain unchanged; the new column is accessible to the same roles.

## Important Notes
1. The `profile` column defaults to 'pf' so existing data stays visible in the default view.
2. The frontend will filter all queries by the selected profile (pf or pj).
3. PJ profile hides benefits-related data via frontend filtering (no RLS restriction needed since the app is single-tenant).
*/

-- Add profile column to all data tables
DO $$ BEGIN
  ALTER TABLE categories ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE card_invoices ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE benefits ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE benefit_transactions ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE loans ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE loan_installments ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE investments ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE alerts ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Add indexes for profile filtering
CREATE INDEX IF NOT EXISTS idx_categories_profile ON categories(profile);
CREATE INDEX IF NOT EXISTS idx_accounts_profile ON accounts(profile);
CREATE INDEX IF NOT EXISTS idx_credit_cards_profile ON credit_cards(profile);
CREATE INDEX IF NOT EXISTS idx_card_invoices_profile ON card_invoices(profile);
CREATE INDEX IF NOT EXISTS idx_transactions_profile ON transactions(profile);
CREATE INDEX IF NOT EXISTS idx_benefits_profile ON benefits(profile);
CREATE INDEX IF NOT EXISTS idx_loans_profile ON loans(profile);
CREATE INDEX IF NOT EXISTS idx_investments_profile ON investments(profile);
CREATE INDEX IF NOT EXISTS idx_alerts_profile ON alerts(profile);

-- ============================================
-- SYNC LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf', 'pj')),
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'running')),
  entities_synced text[],
  error_message text,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_sync_log" ON sync_log;
CREATE POLICY "anon_select_sync_log" ON sync_log FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sync_log" ON sync_log;
CREATE POLICY "anon_insert_sync_log" ON sync_log FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sync_log" ON sync_log;
CREATE POLICY "anon_update_sync_log" ON sync_log FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sync_log" ON sync_log;
CREATE POLICY "anon_delete_sync_log" ON sync_log FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_sync_log_profile ON sync_log(profile, created_at DESC);