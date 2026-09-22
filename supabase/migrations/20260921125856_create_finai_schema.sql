/*
# FinAI - Personal Finance Management Schema

## Overview
Complete database schema for FinAI, a personal finance management app with AI copilot,
Open Finance integration, credit cards, benefits (VA/VR), loans, and investments.

## New Tables

1. **categories** - Custom expense/income categories (fixed vs variable)
2. **accounts** - Bank accounts (checking, savings) with Open Finance integration
3. **credit_cards** - Credit cards with limits and billing cycles
4. **card_invoices** - Monthly credit card invoices (open, future, closed/paid)
5. **transactions** - Unified transaction feed across all accounts and cards
6. **benefits** - VA/VR benefit cards (Alelo, Sodexo, etc.)
7. **benefit_transactions** - VA/VR transaction history
8. **loans** - Loans and financing with amortization tracking
9. **loan_installments** - Individual loan installments (paid/pending)
10. **investments** - Investment portfolio (renda fixa, ações, FIIs, cripto)
11. **investment_transactions** - Investment buy/sell/earnings history
12. **ai_conversations** - AI copilot chat history
13. **alerts** - Pending items and financial alerts

## Security
- Single-tenant app (no auth) - all policies use TO anon, authenticated
- RLS enabled on every table
- All monetary values use numeric(18,2) for exact decimal precision
*/

-- ============================================
-- CATEGORIES
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
  classification text NOT NULL DEFAULT 'variable' CHECK (classification IN ('fixed', 'variable')),
  color text DEFAULT '#10b981',
  icon text DEFAULT 'Tag',
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE TO anon, authenticated USING (true);

-- ============================================
-- ACCOUNTS (Bank accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  institution text NOT NULL,
  type text NOT NULL DEFAULT 'checking' CHECK (type IN ('checking', 'savings', 'investment')),
  balance numeric(18,2) NOT NULL DEFAULT 0,
  agency text,
  account_number text,
  sync_enabled boolean DEFAULT false,
  last_sync timestamptz,
  color text DEFAULT '#3b82f6',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_accounts" ON accounts;
CREATE POLICY "anon_select_accounts" ON accounts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_accounts" ON accounts;
CREATE POLICY "anon_insert_accounts" ON accounts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_accounts" ON accounts;
CREATE POLICY "anon_update_accounts" ON accounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_accounts" ON accounts;
CREATE POLICY "anon_delete_accounts" ON accounts FOR DELETE TO anon, authenticated USING (true);

-- ============================================
-- CREDIT CARDS
-- ============================================
CREATE TABLE IF NOT EXISTS credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  institution text NOT NULL,
  limit_total numeric(18,2) NOT NULL DEFAULT 0,
  closing_day integer NOT NULL DEFAULT 1,
  due_day integer NOT NULL DEFAULT 10,
  color text DEFAULT '#ef4444',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_credit_cards" ON credit_cards;
CREATE POLICY "anon_select_credit_cards" ON credit_cards FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_credit_cards" ON credit_cards;
CREATE POLICY "anon_insert_credit_cards" ON credit_cards FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_credit_cards" ON credit_cards;
CREATE POLICY "anon_update_credit_cards" ON credit_cards FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_credit_cards" ON credit_cards;
CREATE POLICY "anon_delete_credit_cards" ON credit_cards FOR DELETE TO anon, authenticated USING (true);

-- ============================================
-- CARD INVOICES
-- ============================================
CREATE TABLE IF NOT EXISTS card_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  reference_month text NOT NULL,
  due_date date NOT NULL,
  closing_date date NOT NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'future', 'closed', 'paid')),
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE card_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_card_invoices" ON card_invoices;
CREATE POLICY "anon_select_card_invoices" ON card_invoices FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_card_invoices" ON card_invoices;
CREATE POLICY "anon_insert_card_invoices" ON card_invoices FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_card_invoices" ON card_invoices;
CREATE POLICY "anon_update_card_invoices" ON card_invoices FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_card_invoices" ON card_invoices;
CREATE POLICY "anon_delete_card_invoices" ON card_invoices FOR DELETE TO anon, authenticated USING (true);

-- ============================================
-- TRANSACTIONS (Unified feed)
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric(18,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  card_id uuid REFERENCES credit_cards(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES card_invoices(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  confirmed boolean DEFAULT true,
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'open_finance', 'ai')),
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_card ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

-- ============================================
-- BENEFITS (VA/VR)
-- ============================================
CREATE TABLE IF NOT EXISTS benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'Manual',
  type text NOT NULL DEFAULT 'food' CHECK (type IN ('food', 'meal', 'fuel', 'other')),
  balance numeric(18,2) NOT NULL DEFAULT 0,
  card_number text,
  color text DEFAULT '#f59e0b',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE benefits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_benefits" ON benefits;
CREATE POLICY "anon_select_benefits" ON benefits FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_benefits" ON benefits;
CREATE POLICY "anon_insert_benefits" ON benefits FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_benefits" ON benefits;
CREATE POLICY "anon_update_benefits" ON benefits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_benefits" ON benefits;
CREATE POLICY "anon_delete_benefits" ON benefits FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS benefit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benefit_id uuid NOT NULL REFERENCES benefits(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(18,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE benefit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_benefit_transactions" ON benefit_transactions;
CREATE POLICY "anon_select_benefit_transactions" ON benefit_transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_benefit_transactions" ON benefit_transactions;
CREATE POLICY "anon_insert_benefit_transactions" ON benefit_transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_benefit_transactions" ON benefit_transactions;
CREATE POLICY "anon_update_benefit_transactions" ON benefit_transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_benefit_transactions" ON benefit_transactions;
CREATE POLICY "anon_delete_benefit_transactions" ON benefit_transactions FOR DELETE TO anon, authenticated USING (true);

-- ============================================
-- LOANS & FINANCING
-- ============================================
CREATE TABLE IF NOT EXISTS loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  institution text NOT NULL,
  type text NOT NULL DEFAULT 'loan' CHECK (type IN ('loan', 'financing', 'financing_vehicle', 'financing_real_estate')),
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  interest_rate numeric(5,2) NOT NULL DEFAULT 0,
  installments_total integer NOT NULL DEFAULT 1,
  installment_amount numeric(18,2) NOT NULL DEFAULT 0,
  due_day integer NOT NULL DEFAULT 10,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  remaining_balance numeric(18,2) NOT NULL DEFAULT 0,
  installments_paid integer NOT NULL DEFAULT 0,
  color text DEFAULT '#8b5cf6',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_loans" ON loans;
CREATE POLICY "anon_select_loans" ON loans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_loans" ON loans;
CREATE POLICY "anon_insert_loans" ON loans FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_loans" ON loans;
CREATE POLICY "anon_update_loans" ON loans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_loans" ON loans;
CREATE POLICY "anon_delete_loans" ON loans FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS loan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  number integer NOT NULL,
  amount numeric(18,2) NOT NULL,
  due_date date NOT NULL,
  paid boolean DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE loan_installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_loan_installments" ON loan_installments;
CREATE POLICY "anon_select_loan_installments" ON loan_installments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_loan_installments" ON loan_installments;
CREATE POLICY "anon_insert_loan_installments" ON loan_installments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_loan_installments" ON loan_installments;
CREATE POLICY "anon_update_loan_installments" ON loan_installments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_loan_installments" ON loan_installments;
CREATE POLICY "anon_delete_loan_installments" ON loan_installments FOR DELETE TO anon, authenticated USING (true);

-- ============================================
-- INVESTMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'fixed_income' CHECK (type IN ('fixed_income', 'stocks', 'fiis', 'crypto', 'funds', 'other')),
  institution text,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  avg_price numeric(18,4) NOT NULL DEFAULT 0,
  current_price numeric(18,4) NOT NULL DEFAULT 0,
  invested_amount numeric(18,2) NOT NULL DEFAULT 0,
  current_value numeric(18,2) NOT NULL DEFAULT 0,
  color text DEFAULT '#06b6d4',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_investments" ON investments;
CREATE POLICY "anon_select_investments" ON investments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_investments" ON investments;
CREATE POLICY "anon_insert_investments" ON investments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_investments" ON investments;
CREATE POLICY "anon_update_investments" ON investments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_investments" ON investments;
CREATE POLICY "anon_delete_investments" ON investments FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id uuid NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('buy', 'sell', 'earnings', 'dividend')),
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  price numeric(18,4) NOT NULL DEFAULT 0,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_inv_transactions" ON investment_transactions;
CREATE POLICY "anon_select_inv_transactions" ON investment_transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_inv_transactions" ON investment_transactions;
CREATE POLICY "anon_insert_inv_transactions" ON investment_transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_inv_transactions" ON investment_transactions;
CREATE POLICY "anon_update_inv_transactions" ON investment_transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_inv_transactions" ON investment_transactions;
CREATE POLICY "anon_delete_inv_transactions" ON investment_transactions FOR DELETE TO anon, authenticated USING (true);

-- ============================================
-- AI CONVERSATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_ai_conversations" ON ai_conversations;
CREATE POLICY "anon_select_ai_conversations" ON ai_conversations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ai_conversations" ON ai_conversations;
CREATE POLICY "anon_insert_ai_conversations" ON ai_conversations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ai_conversations" ON ai_conversations;
CREATE POLICY "anon_delete_ai_conversations" ON ai_conversations FOR DELETE TO anon, authenticated USING (true);

-- ============================================
-- ALERTS
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('bill_due', 'installment_due', 'transaction_pending', 'low_balance', 'invoice_closing', 'custom')),
  title text NOT NULL,
  message text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  read boolean DEFAULT false,
  related_id uuid,
  due_date date,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_alerts" ON alerts;
CREATE POLICY "anon_select_alerts" ON alerts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_alerts" ON alerts;
CREATE POLICY "anon_insert_alerts" ON alerts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_alerts" ON alerts;
CREATE POLICY "anon_update_alerts" ON alerts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_alerts" ON alerts;
CREATE POLICY "anon_delete_alerts" ON alerts FOR DELETE TO anon, authenticated USING (true);

-- ============================================
-- SEED DEFAULT CATEGORIES
-- ============================================
INSERT INTO categories (name, type, classification, color, icon) VALUES
('Moradia', 'expense', 'fixed', '#ef4444', 'Home'),
('Alimentação', 'expense', 'variable', '#f59e0b', 'UtensilsCrossed'),
('Transporte', 'expense', 'variable', '#3b82f6', 'Car'),
('Saúde', 'expense', 'variable', '#ec4899', 'HeartPulse'),
('Educação', 'expense', 'fixed', '#8b5cf6', 'GraduationCap'),
('Lazer', 'expense', 'variable', '#06b6d4', 'Gamepad2'),
('Compras', 'expense', 'variable', '#f97316', 'ShoppingBag'),
('Salário', 'income', 'fixed', '#10b981', 'Wallet'),
('Investimentos', 'income', 'variable', '#14b8a6', 'TrendingUp'),
('Freelance', 'income', 'variable', '#22c55e', 'Briefcase')
ON CONFLICT DO NOTHING;
