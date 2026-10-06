/*
# PJ Module: Card Terminals (Maquininhas) and Card Sales

## Overview
This migration adds two new tables for the PJ (Pessoa Jurídica) profile:
1. `card_terminals` — Card payment terminals (maquininhas) from acquirers like Cielo, Rede, Getnet, PagSeguro, Stone.
2. `card_sales` — Individual sales transactions processed through those terminals, with fee calculation and settlement schedule.

## New Tables

### card_terminals
- `id` (uuid, PK)
- `name` (text) — Display name, e.g. "Maquininha Cielo Lio"
- `acquirer` (text) — Acquirer brand: Cielo, Rede, Getnet, PagSeguro, Stone, Mercado Pago, Outro
- `terminal_id` (text, nullable) — Physical terminal serial/ID
- `sync_enabled` (boolean, default false) — Whether connected via API for auto-sync
- `last_sync` (timestamptz, nullable) — Last successful API sync
- `color` (text) — UI accent color
- `profile` (text, default 'pj') — Profile isolation (always 'pj' for business terminals)
- `created_at` (timestamptz)

### card_sales
- `id` (uuid, PK)
- `terminal_id` (uuid, FK → card_terminals ON DELETE CASCADE)
- `sale_date` (date) — When the sale happened
- `gross_amount` (numeric 18,2) — Gross sale value before fees
- `net_amount` (numeric 18,2) — Net amount after MDR/fees
- `fee_amount` (numeric 18,2) — Fee deducted by acquirer
- `fee_rate` (numeric 5,4) — Fee rate as decimal (e.g. 0.0399 = 3.99%)
- `payment_type` (text) — 'debit' or 'credit'
- `installments` (integer, default 1) — Number of installments (1 = à vista)
- `settlement_date` (date) — Expected D+1 for debit, D+30 for credit
- `settlement_type` (text) — 'standard' or 'anticipated'
- `status` (text) — 'pending', 'settled', 'cancelled'
- `description` (text, nullable) — Optional sale description
- `source` (text) — 'manual' or 'api'
- `profile` (text, default 'pj')
- `created_at` (timestamptz)

## Security
- RLS enabled on both tables with anon+authenticated CRUD (single-tenant, no-auth app).
- All policies follow the existing pattern used across the app.

## Important Notes
1. Both tables default `profile` to 'pj' since they are PJ-only features.
2. The `card_sales` table tracks gross vs. net amounts so the UI can show MDR deductions.
3. Settlement dates are computed on insert: debit = D+1, credit = D+30 (or per anticipation).
4. The sync engine will update `last_sync` on connected terminals and mark settled sales.
*/

-- ============================================
-- CARD TERMINALS (MAQUININHAS)
-- ============================================
CREATE TABLE IF NOT EXISTS card_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  acquirer text NOT NULL DEFAULT 'Cielo' CHECK (acquirer IN ('Cielo', 'Rede', 'Getnet', 'PagSeguro', 'Stone', 'Mercado Pago', 'Outro')),
  terminal_id text,
  sync_enabled boolean NOT NULL DEFAULT false,
  last_sync timestamptz,
  color text DEFAULT '#3b82f6',
  profile text NOT NULL DEFAULT 'pj' CHECK (profile IN ('pf', 'pj')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE card_terminals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_card_terminals" ON card_terminals;
CREATE POLICY "anon_select_card_terminals" ON card_terminals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_card_terminals" ON card_terminals;
CREATE POLICY "anon_insert_card_terminals" ON card_terminals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_card_terminals" ON card_terminals;
CREATE POLICY "anon_update_card_terminals" ON card_terminals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_card_terminals" ON card_terminals;
CREATE POLICY "anon_delete_card_terminals" ON card_terminals FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_card_terminals_profile ON card_terminals(profile);

-- ============================================
-- CARD SALES (VENDAS VIA MAQUININHA)
-- ============================================
CREATE TABLE IF NOT EXISTS card_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id uuid NOT NULL REFERENCES card_terminals(id) ON DELETE CASCADE,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  net_amount numeric(18,2) NOT NULL DEFAULT 0,
  fee_amount numeric(18,2) NOT NULL DEFAULT 0,
  fee_rate numeric(5,4) NOT NULL DEFAULT 0,
  payment_type text NOT NULL DEFAULT 'credit' CHECK (payment_type IN ('debit', 'credit')),
  installments integer NOT NULL DEFAULT 1,
  settlement_date date NOT NULL DEFAULT CURRENT_DATE,
  settlement_type text NOT NULL DEFAULT 'standard' CHECK (settlement_type IN ('standard', 'anticipated')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'cancelled')),
  description text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
  profile text NOT NULL DEFAULT 'pj' CHECK (profile IN ('pf', 'pj')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE card_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_card_sales" ON card_sales;
CREATE POLICY "anon_select_card_sales" ON card_sales FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_card_sales" ON card_sales;
CREATE POLICY "anon_insert_card_sales" ON card_sales FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_card_sales" ON card_sales;
CREATE POLICY "anon_update_card_sales" ON card_sales FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_card_sales" ON card_sales;
CREATE POLICY "anon_delete_card_sales" ON card_sales FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_card_sales_terminal ON card_sales(terminal_id);
CREATE INDEX IF NOT EXISTS idx_card_sales_profile ON card_sales(profile);
CREATE INDEX IF NOT EXISTS idx_card_sales_date ON card_sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_card_sales_settlement ON card_sales(settlement_date);

-- ============================================
-- ADD SUBCATEGORY SUPPORT TO CATEGORIES
-- ============================================
-- The parent_id column already exists for subcategory support.
-- We add a 'group_name' column to support Plano de Contas Empresarial grouping.
DO $$ BEGIN
  ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_name text;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMENT ON COLUMN categories.group_name IS 'Optional grouping label for PJ Plano de Contas (e.g. Receita Operacional, Custos Variaveis, Despesas Fixas, Impostos, Pro-labore)';
