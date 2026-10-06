import { supabase, type RecurringSeries, type Profile, type CreditCard } from './supabase';
import { applyAccountEffect, recalcInvoiceAmount } from './transactionHelpers';

/**
 * Calculate the next occurrence date based on periodicity.
 */
export function nextOccurrenceDate(currentDate: string, periodicity: 'weekly' | 'monthly' | 'yearly'): string {
  const d = new Date(currentDate + 'T00:00:00');
  if (periodicity === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (periodicity === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Check if a series has ended (reached max occurrences or end date).
 */
export function seriesHasEnded(series: RecurringSeries): boolean {
  if (!series.active) return true;
  if (series.end_type === 'count' && series.max_occurrences && series.generated_count >= series.max_occurrences) return true;
  if (series.end_type === 'date' && series.end_date && series.next_date > series.end_date) return true;
  return false;
}

/**
 * Find or create a card invoice for a given card + month, returning the invoice ID.
 */
async function findOrCreateInvoice(
  card: CreditCard,
  refDate: string,
  profile: Profile
): Promise<string | null> {
  const d = new Date(refDate + 'T00:00:00');
  const refMonth = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const dueDate = new Date(d.getFullYear(), d.getMonth(), card.due_day).toISOString().slice(0, 10);
  const closingDate = new Date(d.getFullYear(), d.getMonth(), card.closing_day).toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from('card_invoices')
    .select('id')
    .eq('card_id', card.id)
    .eq('reference_month', refMonth)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created } = await supabase.from('card_invoices').insert({
    card_id: card.id,
    reference_month: refMonth,
    due_date: dueDate,
    closing_date: closingDate,
    amount: 0,
    status: 'future',
    profile,
  }).select('id').single();

  return created?.id ?? null;
}

/**
 * Process all active recurring series: generate any occurrences whose next_date
 * has arrived or passed. For card-linked series, link each occurrence to the
 * correct invoice and recalc invoice amounts. For account-linked series,
 * apply the account balance effect.
 *
 * Call this on app load and after any series creation/update.
 */
export async function processRecurringSeries(profile: Profile): Promise<void> {
  const { data: seriesList } = await supabase
    .from('recurring_series')
    .select('*')
    .eq('profile', profile)
    .eq('active', true);

  if (!seriesList || seriesList.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);

  // Load cards for invoice linking
  const { data: cards } = await supabase.from('credit_cards').select('*').eq('profile', profile);
  const cardMap = new Map<string, CreditCard>((cards || []).map(c => [c.id, c]));

  const affectedInvoices = new Set<string>();

  for (const s of seriesList as RecurringSeries[]) {
    while (s.next_date <= today && !seriesHasEnded(s)) {
      const occNum = s.generated_count + 1;
      const txnData: Record<string, unknown> = {
        description: s.description,
        amount: s.type === 'expense' ? -Math.abs(Number(s.amount)) : Math.abs(Number(s.amount)),
        type: s.type,
        category_id: s.category_id,
        account_id: s.account_id,
        card_id: s.card_id,
        date: s.next_date,
        confirmed: true,
        source: 'manual',
        notes: null,
        installments_total: 1,
        installment_number: 1,
        recurring_series_id: s.id,
        occurrence_number: occNum,
        profile,
      };

      // Link to invoice if card-based
      if (s.card_id && cardMap.has(s.card_id)) {
        const card = cardMap.get(s.card_id)!;
        const invId = await findOrCreateInvoice(card, s.next_date, profile);
        if (invId) {
          txnData.invoice_id = invId;
          affectedInvoices.add(invId);
        }
      }

      await supabase.from('transactions').insert(txnData);

      // Apply account effect if account-based (only for past/today occurrences)
      if (s.account_id) {
        await applyAccountEffect(s.account_id, Math.abs(Number(s.amount)), s.type, s.next_date);
      }

      // Advance series
      const newNext = nextOccurrenceDate(s.next_date, s.periodicity);
      const newCount = occNum;

      // Check if series should end after this occurrence
      const reachedCount = s.end_type === 'count' && s.max_occurrences && newCount >= s.max_occurrences;
      const reachedDate = s.end_type === 'date' && s.end_date && newNext > s.end_date;

      if (reachedCount || reachedDate) {
        await supabase.from('recurring_series').update({
          generated_count: newCount,
          next_date: newNext,
          active: false,
        }).eq('id', s.id);
        s.generated_count = newCount;
        s.next_date = newNext;
        s.active = false;
        break;
      } else {
        await supabase.from('recurring_series').update({
          generated_count: newCount,
          next_date: newNext,
        }).eq('id', s.id);
        s.generated_count = newCount;
        s.next_date = newNext;
      }
    }
  }

  // Recalculate affected invoices
  for (const invId of affectedInvoices) {
    await recalcInvoiceAmount(invId);
  }
}

/**
 * Create a new recurring series and immediately generate the first occurrence.
 */
export async function createRecurringSeries(params: {
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category_id: string | null;
  account_id: string | null;
  card_id: string | null;
  periodicity: 'weekly' | 'monthly' | 'yearly';
  end_type: 'never' | 'date' | 'count';
  end_date: string | null;
  max_occurrences: number | null;
  start_date: string;
  profile: Profile;
}): Promise<string | null> {
  const { data, error } = await supabase.from('recurring_series').insert({
    description: params.description,
    amount: Math.abs(params.amount),
    type: params.type,
    category_id: params.category_id,
    account_id: params.account_id,
    card_id: params.card_id,
    periodicity: params.periodicity,
    end_type: params.end_type,
    end_date: params.end_date,
    max_occurrences: params.max_occurrences,
    generated_count: 0,
    next_date: params.start_date,
    active: true,
    profile: params.profile,
  }).select('id').single();

  if (error || !data) return null;

  // Process immediately to generate the first occurrence
  await processRecurringSeries(params.profile);
  return data.id;
}

/**
 * Delete an entire recurring series and all its generated transactions.
 * Reverses account effects and recalculates invoices.
 */
export async function deleteRecurringSeries(seriesId: string): Promise<void> {
  // Fetch all transactions linked to this series
  const { data: txns } = await supabase
    .from('transactions')
    .select('*')
    .eq('recurring_series_id', seriesId);

  if (txns) {
    for (const t of txns) {
      // Reverse account effect
      if (t.account_id) {
        const reverseAmount = t.type === 'expense' ? Math.abs(Number(t.amount)) : -Math.abs(Number(t.amount));
        const { data: acc } = await supabase.from('accounts').select('balance').eq('id', t.account_id).single();
        if (acc) {
          await supabase.from('accounts').update({ balance: Number(acc.balance) + reverseAmount }).eq('id', t.account_id);
        }
      }
    }

    const invoiceIds = new Set<string>();
    txns.forEach(t => { if (t.invoice_id) invoiceIds.add(t.invoice_id); });

    await supabase.from('transactions').delete().eq('recurring_series_id', seriesId);

    for (const invId of invoiceIds) {
      await recalcInvoiceAmount(invId);
    }
  }

  await supabase.from('recurring_series').delete().eq('id', seriesId);
}

/**
 * Delete only a single occurrence from a series (detach it).
 */
export async function deleteSingleOccurrence(txnId: string, seriesId: string | null): Promise<void> {
  // Just delete the single transaction with reversal
  const { data: txn } = await supabase.from('transactions').select('*').eq('id', txnId).single();
  if (!txn) return;

  if (txn.account_id) {
    const reverseAmount = txn.type === 'expense' ? Math.abs(Number(txn.amount)) : -Math.abs(Number(txn.amount));
    const { data: acc } = await supabase.from('accounts').select('balance').eq('id', txn.account_id).single();
    if (acc) {
      await supabase.from('accounts').update({ balance: Number(acc.balance) + reverseAmount }).eq('id', txn.account_id);
    }
  }

  await supabase.from('transactions').delete().eq('id', txnId);

  if (txn.invoice_id) {
    await recalcInvoiceAmount(txn.invoice_id);
  }
}
