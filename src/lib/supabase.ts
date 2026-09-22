import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Category = {
  id: string;
  name: string;
  type: 'expense' | 'income';
  classification: 'fixed' | 'variable';
  color: string;
  icon: string;
  parent_id: string | null;
  created_at: string;
};

export type Account = {
  id: string;
  name: string;
  institution: string;
  type: 'checking' | 'savings' | 'investment';
  balance: number;
  agency: string | null;
  account_number: string | null;
  sync_enabled: boolean;
  last_sync: string | null;
  color: string;
  created_at: string;
};

export type CreditCard = {
  id: string;
  name: string;
  institution: string;
  limit_total: number;
  closing_day: number;
  due_day: number;
  color: string;
  created_at: string;
};

export type CardInvoice = {
  id: string;
  card_id: string;
  reference_month: string;
  due_date: string;
  closing_date: string;
  amount: number;
  status: 'open' | 'future' | 'closed' | 'paid';
  paid_at: string | null;
  created_at: string;
};

export type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category_id: string | null;
  account_id: string | null;
  card_id: string | null;
  invoice_id: string | null;
  date: string;
  confirmed: boolean;
  source: 'manual' | 'open_finance' | 'ai';
  notes: string | null;
  created_at: string;
  category?: Category | null;
  account?: Account | null;
  card?: CreditCard | null;
};

export type Benefit = {
  id: string;
  name: string;
  provider: string;
  type: 'food' | 'meal' | 'fuel' | 'other';
  balance: number;
  card_number: string | null;
  color: string;
  created_at: string;
};

export type BenefitTransaction = {
  id: string;
  benefit_id: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  date: string;
  created_at: string;
};

export type Loan = {
  id: string;
  name: string;
  institution: string;
  type: string;
  total_amount: number;
  interest_rate: number;
  installments_total: number;
  installment_amount: number;
  due_day: number;
  start_date: string;
  remaining_balance: number;
  installments_paid: number;
  color: string;
  created_at: string;
};

export type LoanInstallment = {
  id: string;
  loan_id: string;
  number: number;
  amount: number;
  due_date: string;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
};

export type Investment = {
  id: string;
  name: string;
  type: 'fixed_income' | 'stocks' | 'fiis' | 'crypto' | 'funds' | 'other';
  institution: string | null;
  quantity: number;
  avg_price: number;
  current_price: number;
  invested_amount: number;
  current_value: number;
  color: string;
  created_at: string;
};

export type AIConversation = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type Alert = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  related_id: string | null;
  due_date: string | null;
  created_at: string;
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateShort(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(date));
}
