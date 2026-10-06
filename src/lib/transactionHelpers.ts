import { supabase } from '@/lib/supabase';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function isFutureDate(dateStr: string): boolean {
  return dateStr > todayStr();
}

/**
 * Recalculate a card invoice's amount by summing all its transactions.
 * Call this after any transaction insert/update/delete that affects an invoice.
 */
export async function recalcInvoiceAmount(invoiceId: string): Promise<void> {
  if (!invoiceId) return;
  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .eq('invoice_id', invoiceId);
  const total = (data || []).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  await supabase.from('card_invoices').update({ amount: total }).eq('id', invoiceId);
}

/**
 * Reverse a transaction's effect on its linked account balance.
 * Pass transactionDate so we only reverse if the original transaction had actually
 * affected the balance (i.e., it was not a future-dated unconfirmed transaction).
 */
export async function reverseAccountEffect(
  accountId: string | null,
  amount: number,
  type: 'income' | 'expense' | 'transfer',
  transactionDate?: string,
  wasConfirmed?: boolean
): Promise<void> {
  if (!accountId) return;
  // If the transaction was future-dated and unconfirmed, it never affected the balance,
  // so there's nothing to reverse.
  if (transactionDate && isFutureDate(transactionDate) && !wasConfirmed) return;
  const { data: acc } = await supabase.from('accounts').select('balance').eq('id', accountId).single();
  if (!acc) return;
  const reverseAmount = type === 'expense' ? Math.abs(amount) : -Math.abs(amount);
  await supabase.from('accounts').update({ balance: Number(acc.balance) + reverseAmount }).eq('id', accountId);
}

/**
 * Apply a transaction's effect to an account balance.
 * Pass transactionDate so future-dated transactions can be skipped.
 */
export async function applyAccountEffect(
  accountId: string | null,
  amount: number,
  type: 'income' | 'expense' | 'transfer',
  transactionDate?: string
): Promise<void> {
  if (!accountId) return;
  // Future-dated transactions do not affect the current balance.
  // Their balance impact happens only when the date arrives (via daily processing)
  // or when the user manually confirms/pays them.
  if (transactionDate && isFutureDate(transactionDate)) return;
  const { data: acc } = await supabase.from('accounts').select('balance').eq('id', accountId).single();
  if (!acc) return;
  const delta = type === 'expense' ? -Math.abs(amount) : Math.abs(amount);
  await supabase.from('accounts').update({ balance: Number(acc.balance) + delta }).eq('id', accountId);
}

/**
 * Reverse a benefit transaction's effect on the benefit balance.
 */
export async function reverseBenefitBalance(benefitId: string, amount: number, txnType: 'credit' | 'debit'): Promise<void> {
  const { data: ben } = await supabase.from('benefits').select('balance').eq('id', benefitId).single();
  if (!ben) return;
  // Reverse: debit was negative, so add back; credit was positive, so subtract
  const reverseAmount = txnType === 'debit' ? Math.abs(amount) : -Math.abs(amount);
  await supabase.from('benefits').update({ balance: Number(ben.balance) + reverseAmount }).eq('id', benefitId);
}

/**
 * Delete a single transaction and reverse ALL its side effects:
 * - Account balance (only if the transaction had actually affected it)
 * - Card invoice amount (if linked to a card/invoice)
 */
export async function deleteTransactionWithReversal(txn: {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  account_id: string | null;
  card_id: string | null;
  invoice_id: string | null;
  date: string;
  confirmed: boolean;
}): Promise<void> {
  // Reverse account effect only if it was actually applied
  if (txn.account_id) {
    await reverseAccountEffect(txn.account_id, Number(txn.amount), txn.type, txn.date, txn.confirmed);
  }

  // Delete the transaction itself
  await supabase.from('transactions').delete().eq('id', txn.id);

  // Recalculate the invoice amount if it was linked to one
  if (txn.invoice_id) {
    await recalcInvoiceAmount(txn.invoice_id);
  }
}
