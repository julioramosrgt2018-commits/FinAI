import { supabase, formatCurrency, formatDate, type Profile, type CardInvoice, type CreditCard, type Loan, type LoanInstallment } from './supabase';

export type DueAlertItem = {
  id: string;
  kind: 'invoice' | 'loan_installment' | 'bill';
  title: string;
  subtitle: string;
  amount: number;
  dueDate: string;
  daysUntilDue: number;
  severity: 'overdue' | 'today' | 'soon' | 'ok';
  cardId?: string;
  loanId?: string;
  txnId?: string;
  invoiceId?: string;
  installmentId?: string;
};

export type DueAlertSummary = {
  items: DueAlertItem[];
  overdue: DueAlertItem[];
  today: DueAlertItem[];
  soon: DueAlertItem[];
  totalOverdue: number;
  totalDueSoon: number;
  hasUrgent: boolean;
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function severityFor(days: number): DueAlertItem['severity'] {
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 3) return 'soon';
  return 'ok';
}

/**
 * Compute all due alerts: unpaid card invoices with due dates, unpaid loan
 * installments with due dates, and unpaid expense transactions linked to
 * accounts that are not yet confirmed (bills to pay).
 */
export async function computeDueAlerts(profile: Profile): Promise<DueAlertSummary> {
  const [invRes, cardRes, loanRes, installmentRes, txnRes] = await Promise.all([
    supabase.from('card_invoices').select('*').eq('profile', profile).in('status', ['open', 'closed']),
    supabase.from('credit_cards').select('*').eq('profile', profile),
    supabase.from('loans').select('*').eq('profile', profile),
    supabase.from('loan_installments').select('*').eq('profile', profile).eq('paid', false),
    supabase.from('transactions').select('*, account:accounts(*), card:credit_cards(*)').eq('profile', profile).eq('confirmed', false).eq('type', 'expense').order('date', { ascending: true }),
  ]);

  const cards = (cardRes.data || []) as CreditCard[];
  const invoices = (invRes.data || []) as CardInvoice[];
  const loans = (loanRes.data || []) as Loan[];
  const installments = (installmentRes.data || []) as LoanInstallment[];
  const txns = txnRes.data || [];

  const items: DueAlertItem[] = [];

  // 1. Card invoices that are open or closed (not paid) — check due date
  for (const inv of invoices) {
    if (inv.status === 'paid') continue;
    const days = daysUntil(inv.due_date);
    if (days > 7) continue; // Only show if within 7 days or overdue
    const card = cards.find(c => c.id === inv.card_id);
    items.push({
      id: `inv-${inv.id}`,
      kind: 'invoice',
      title: `Fatura ${card?.name || 'Cartão'}`,
      subtitle: `${card?.institution || ''} • Vence ${formatDate(inv.due_date)}`,
      amount: Number(inv.amount),
      dueDate: inv.due_date,
      daysUntilDue: days,
      severity: severityFor(days),
      cardId: inv.card_id,
      invoiceId: inv.id,
    });
  }

  // 2. Loan installments not paid — check due date
  for (const inst of installments) {
    const loan = loans.find(l => l.id === inst.loan_id);
    if (!loan) continue;
    const days = daysUntil(inst.due_date);
    if (days > 7) continue;
    items.push({
      id: `loan-${inst.id}`,
      kind: 'loan_installment',
      title: `Parcela ${inst.number}/${loan.installments_total} • ${loan.name}`,
      subtitle: `${loan.institution} • Vence ${formatDate(inst.due_date)}`,
      amount: Number(inst.amount),
      dueDate: inst.due_date,
      daysUntilDue: days,
      severity: severityFor(days),
      loanId: inst.loan_id,
      installmentId: inst.id,
    });
  }

  // 3. Unconfirmed expense transactions (bills to pay) — use date as due date
  for (const t of txns) {
    if (t.invoice_id) continue; // Skip card transactions — they're tracked via invoices
    const days = daysUntil(t.date);
    if (days > 7) continue;
    const originName = t.account?.name || t.card?.name || 'Conta';
    items.push({
      id: `bill-${t.id}`,
      kind: 'bill',
      title: t.description,
      subtitle: `${originName} • Vence ${formatDate(t.date)}`,
      amount: Math.abs(Number(t.amount)),
      dueDate: t.date,
      daysUntilDue: days,
      severity: severityFor(days),
      txnId: t.id,
      cardId: t.card_id || undefined,
    });
  }

  // Sort by urgency: overdue first, then today, then soon
  items.sort((a, b) => {
    const order = { overdue: 0, today: 1, soon: 2, ok: 3 };
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    return a.daysUntilDue - b.daysUntilDue;
  });

  const overdue = items.filter(i => i.severity === 'overdue');
  const today = items.filter(i => i.severity === 'today');
  const soon = items.filter(i => i.severity === 'soon');

  const totalOverdue = overdue.reduce((s, i) => s + i.amount, 0);
  const totalDueSoon = [...today, ...soon].reduce((s, i) => s + i.amount, 0);

  return {
    items,
    overdue,
    today,
    soon,
    totalOverdue,
    totalDueSoon,
    hasUrgent: overdue.length > 0 || today.length > 0,
  };
}

/**
 * Play a discreet notification sound using the Web Audio API.
 * A short two-tone ascending chime — not annoying but noticeable.
 */
export function playAlertSound(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [
      { freq: 660, start: 0, dur: 0.12 },
      { freq: 880, start: 0.14, dur: 0.18 },
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = n.freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(0.15, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur);
    }

    setTimeout(() => ctx.close(), 600);
  } catch {
    // Audio context may not be available (e.g., before user interaction)
  }
}

/**
 * Pay a card invoice: mark it as paid and deduct the amount from the selected account.
 */
export async function payInvoice(invoiceId: string, accountId: string): Promise<void> {
  const { data: inv } = await supabase.from('card_invoices').select('*').eq('id', invoiceId).single();
  if (!inv) return;

  await supabase.from('card_invoices').update({
    status: 'paid',
    paid_at: new Date().toISOString(),
  }).eq('id', invoiceId);

  // Deduct from selected account
  const { data: acc } = await supabase.from('accounts').select('balance').eq('id', accountId).single();
  if (acc) {
    await supabase.from('accounts').update({
      balance: Number(acc.balance) - Math.abs(Number(inv.amount)),
    }).eq('id', accountId);
  }
}

/**
 * Pay a loan installment: mark it as paid, deduct from account, and update loan progress.
 */
export async function payLoanInstallment(installmentId: string, accountId: string): Promise<void> {
  const { data: inst } = await supabase.from('loan_installments').select('*').eq('id', installmentId).single();
  if (!inst) return;

  await supabase.from('loan_installments').update({
    paid: true,
    paid_at: new Date().toISOString(),
  }).eq('id', installmentId);

  // Deduct from account
  const { data: acc } = await supabase.from('accounts').select('balance').eq('id', accountId).single();
  if (acc) {
    await supabase.from('accounts').update({
      balance: Number(acc.balance) - Math.abs(Number(inst.amount)),
    }).eq('id', accountId);
  }

  // Update loan progress
  const { data: loan } = await supabase.from('loans').select('*').eq('id', inst.loan_id).single();
  if (loan) {
    const newPaid = loan.installments_paid + 1;
    const newRemaining = Math.max(0, Number(loan.remaining_balance) - Math.abs(Number(inst.amount)));
    await supabase.from('loans').update({
      installments_paid: newPaid,
      remaining_balance: newRemaining,
    }).eq('id', inst.loan_id);
  }
}

/**
 * Pay a bill (unconfirmed expense transaction): mark as confirmed and deduct from account.
 * Since unconfirmed/future-dated transactions never had their balance effect applied,
 * paying them always applies the balance effect now.
 */
export async function payBill(txnId: string, accountId: string): Promise<void> {
  const { data: txn } = await supabase.from('transactions').select('*').eq('id', txnId).single();
  if (!txn) return;

  await supabase.from('transactions').update({
    confirmed: true,
  }).eq('id', txnId);

  // The balance was never applied for unconfirmed transactions, so always deduct now.
  const { data: acc } = await supabase.from('accounts').select('balance').eq('id', accountId).single();
  if (acc) {
    await supabase.from('accounts').update({
      balance: Number(acc.balance) - Math.abs(Number(txn.amount)),
    }).eq('id', accountId);
  }

  // If paying from a different account than the one linked, also link the transaction
  if (txn.account_id !== accountId) {
    await supabase.from('transactions').update({ account_id: accountId }).eq('id', txnId);
  }
}

/**
 * Pay any due alert item using the given account.
 */
export async function payDueAlertItem(item: DueAlertItem, accountId: string): Promise<void> {
  if (item.kind === 'invoice' && item.invoiceId) {
    await payInvoice(item.invoiceId, accountId);
  } else if (item.kind === 'loan_installment' && item.installmentId) {
    await payLoanInstallment(item.installmentId, accountId);
  } else if (item.kind === 'bill' && item.txnId) {
    await payBill(item.txnId, accountId);
  }
}
