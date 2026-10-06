/*
# Add Recurring Transaction Series

1. New Table: recurring_series
   - Stores the template/definition of a recurring transaction (despesa fixa/receita fixa).
   - Fields: id, description, amount, type, category_id, account_id, card_id, periodicity, end_type, end_date, max_occurrences, generated_count, next_date, profile, created_at, active.

2. Modified Table: transactions
   - Adds recurring_series_id (nullable FK to recurring_series) to link individual transaction occurrences back to their parent series.
   - Adds occurrence_number (int, default 1) to track which occurrence in the series this is.

3. Security
   - RLS enabled on recurring_series with anon+authenticated CRUD (single-tenant app, no auth screen).
*/

CREATE TABLE IF NOT EXISTS recurring_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL DEFAULT 'expense' CHECK (type IN ('income','expense','transfer')),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  card_id uuid REFERENCES credit_cards(id) ON DELETE SET NULL,
  periodicity text NOT NULL DEFAULT 'monthly' CHECK (periodicity IN ('weekly','monthly','yearly')),
  end_type text NOT NULL DEFAULT 'never' CHECK (end_type IN ('never','date','count')),
  end_date date,
  max_occurrences int,
  generated_count int NOT NULL DEFAULT 0,
  next_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  profile text NOT NULL DEFAULT 'pf' CHECK (profile IN ('pf','pj')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recurring_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_recurring_series" ON recurring_series;
CREATE POLICY "anon_select_recurring_series" ON recurring_series FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_recurring_series" ON recurring_series;
CREATE POLICY "anon_insert_recurring_series" ON recurring_series FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_recurring_series" ON recurring_series;
CREATE POLICY "anon_update_recurring_series" ON recurring_series FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_recurring_series" ON recurring_series;
CREATE POLICY "anon_delete_recurring_series" ON recurring_series FOR DELETE
TO anon, authenticated USING (true);

-- Add recurring_series_id and occurrence_number to transactions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'recurring_series_id') THEN
    ALTER TABLE transactions ADD COLUMN recurring_series_id uuid REFERENCES recurring_series(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'occurrence_number') THEN
    ALTER TABLE transactions ADD COLUMN occurrence_number int NOT NULL DEFAULT 1;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recurring_series_next_date ON recurring_series(next_date);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring_series_id ON transactions(recurring_series_id);