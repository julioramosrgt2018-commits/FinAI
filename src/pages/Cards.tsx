import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, formatDate, type CreditCard, type CardInvoice, type Transaction } from '@/lib/supabase';
import { CreditCard as CardIcon, Plus, Pencil, Trash2, Calendar, CheckCircle2, Clock, ChevronRight, Receipt, CalendarClock, Layers, Repeat, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState } from '@/components/Shared';
import { DateFilterBar } from '@/components/DateFilterBar';
import { useDateFilter } from '@/lib/dateFilter';
import { useProfile } from '@/lib/profile';
import { recalcInvoiceAmount, deleteTransactionWithReversal } from '@/lib/transactionHelpers';
import { createRecurringSeries, deleteSingleOccurrence } from '@/lib/recurrence';

export function Cards() {
  const { profile } = useProfile();
  const { startDate, endDate } = useDateFilter();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [invoices, setInvoices] = useState<CardInvoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCardForm, setShowCardForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<'open' | 'future' | 'closed'>('open');
  const [savingExpense, setSavingExpense] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [showTxnForm, setShowTxnForm] = useState(false);
  const [deleteTxnId, setDeleteTxnId] = useState<string | null>(null);
  const [txnForm, setTxnForm] = useState({ description: '', amount: '', date: new Date().toISOString().slice(0, 10) });

  const [cardForm, setCardForm] = useState({
    name: '', institution: '', limit_total: '', closing_day: '1', due_day: '10', color: '#ef4444',
  });

  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    paymentType: 'cash' as 'cash' | 'installment',
    installments: '2',
  });
  const [isRecurringExpense, setIsRecurringExpense] = useState(false);
  const [recurringExpense, setRecurringExpense] = useState({
    periodicity: 'monthly' as 'weekly' | 'monthly' | 'yearly',
    end_type: 'never' as 'never' | 'date' | 'count',
    end_date: '',
    max_occurrences: '12',
  });

  const loadData = useCallback(async () => {
    const [cds, invs, txns] = await Promise.all([
      supabase.from('credit_cards').select('*').eq('profile', profile).order('name'),
      supabase.from('card_invoices').select('*').eq('profile', profile).order('due_date'),
      supabase.from('transactions').select('*').eq('profile', profile).order('date', { ascending: false }),
    ]);
    setCards(cds.data || []);
    setInvoices(invs.data || []);
    setTransactions(txns.data || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (editingCard) {
      setCardForm({
        name: editingCard.name, institution: editingCard.institution,
        limit_total: String(editingCard.limit_total), closing_day: String(editingCard.closing_day),
        due_day: String(editingCard.due_day), color: editingCard.color,
      });
    } else {
      setCardForm({ name: '', institution: '', limit_total: '', closing_day: '1', due_day: '10', color: '#ef4444' });
    }
  }, [editingCard]);

  useEffect(() => {
    if (showExpenseForm) {
      setExpenseForm({
        description: '',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        paymentType: 'cash',
        installments: '2',
      });
      setIsRecurringExpense(false);
      setRecurringExpense({ periodicity: 'monthly', end_type: 'never', end_date: '', max_occurrences: '12' });
    }
  }, [showExpenseForm]);

  async function saveCard(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: cardForm.name, institution: cardForm.institution,
      limit_total: parseFloat(cardForm.limit_total) || 0,
      closing_day: parseInt(cardForm.closing_day), due_day: parseInt(cardForm.due_day),
      color: cardForm.color, profile,
    };
    if (editingCard) {
      await supabase.from('credit_cards').update(data).eq('id', editingCard.id);
    } else {
      await supabase.from('credit_cards').insert(data);
    }
    setShowCardForm(false);
    setEditingCard(null);
    loadData();
  }

  async function deleteCard() {
    if (!deleteCardId) return;
    await supabase.from('card_invoices').delete().eq('card_id', deleteCardId);
    await supabase.from('credit_cards').delete().eq('id', deleteCardId);
    setDeleteCardId(null);
    loadData();
  }

  useEffect(() => {
    if (editingTxn) {
      setTxnForm({
        description: editingTxn.description.replace(/\s*\(\d+\/\d+\)\s*$/, ''),
        amount: String(Math.abs(Number(editingTxn.amount))),
        date: editingTxn.date,
      });
    } else {
      setTxnForm({ description: '', amount: '', date: new Date().toISOString().slice(0, 10) });
    }
  }, [editingTxn]);

  async function saveTxn(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTxn) return;
    const newAmount = parseFloat(txnForm.amount);
    const oldAmount = Math.abs(Number(editingTxn.amount));

    await supabase.from('transactions').update({
      description: txnForm.description,
      amount: -Math.abs(newAmount),
      date: txnForm.date,
    }).eq('id', editingTxn.id);

    // Recalc the invoice (in case amount changed)
    if (editingTxn.invoice_id) {
      await recalcInvoiceAmount(editingTxn.invoice_id);
    }

    setShowTxnForm(false);
    setEditingTxn(null);
    loadData();
  }

  async function handleDeleteTxn() {
    if (!deleteTxnId) return;
    const txn = transactions.find(t => t.id === deleteTxnId);
    if (txn) {
      if (txn.recurring_series_id) {
        // For recurring transactions in card view, delete single occurrence
        await deleteSingleOccurrence(txn.id, txn.recurring_series_id);
      } else {
        await deleteTransactionWithReversal({
          id: txn.id,
          amount: Number(txn.amount),
          type: txn.type,
          account_id: txn.account_id,
          card_id: txn.card_id,
          invoice_id: txn.invoice_id,
          date: txn.date,
          confirmed: txn.confirmed,
        });
      }
    }
    setDeleteTxnId(null);
    loadData();
  }

  async function payInvoice(inv: CardInvoice) {
    await supabase.from('card_invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', inv.id);
    loadData();
  }

  async function getOrCreateInvoice(cardId: string, refMonth: string, dueDate: string, closingDate: string): Promise<string | null> {
    const existing = invoices.find(i => i.card_id === cardId && i.reference_month === refMonth);
    if (existing) return existing.id;

    const { data, error } = await supabase.from('card_invoices').insert({
      card_id: cardId,
      reference_month: refMonth,
      due_date: dueDate,
      closing_date: closingDate,
      amount: 0,
      status: 'future',
      profile,
    }).select('id').single();

    if (error) return null;
    return data.id;
  }

  function computeInvoiceDates(card: CreditCard, monthsAhead: number) {
    const now = new Date(expenseForm.date);
    const target = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1);
    const refMonth = target.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const dueDate = new Date(target.getFullYear(), target.getMonth(), card.due_day);
    const closingDate = new Date(target.getFullYear(), target.getMonth(), card.closing_day);

    return {
      refMonth,
      dueDate: dueDate.toISOString().slice(0, 10),
      closingDate: closingDate.toISOString().slice(0, 10),
    };
  }

  async function saveExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCard || !expenseForm.description || !expenseForm.amount) return;
    setSavingExpense(true);

    const card = cards.find(c => c.id === selectedCard);
    if (!card) { setSavingExpense(false); return; }

    const totalAmount = parseFloat(expenseForm.amount);

    // If recurring and cash payment, create a recurring series
    if (isRecurringExpense && expenseForm.paymentType === 'cash') {
      await createRecurringSeries({
        description: expenseForm.description,
        amount: totalAmount,
        type: 'expense',
        category_id: null,
        account_id: null,
        card_id: card.id,
        periodicity: recurringExpense.periodicity,
        end_type: recurringExpense.end_type,
        end_date: recurringExpense.end_type === 'date' ? recurringExpense.end_date || null : null,
        max_occurrences: recurringExpense.end_type === 'count' ? parseInt(recurringExpense.max_occurrences) || null : null,
        start_date: expenseForm.date,
        profile,
      });
      setSavingExpense(false);
      setShowExpenseForm(false);
      loadData();
      return;
    }

    const isInstallment = expenseForm.paymentType === 'installment';
    const numInstallments = isInstallment ? parseInt(expenseForm.installments) : 1;
    const installmentAmount = totalAmount / numInstallments;

    const createdInvoiceIds: string[] = [];

    for (let i = 0; i < numInstallments; i++) {
      const { refMonth, dueDate, closingDate } = computeInvoiceDates(card, i);
      const invoiceId = await getOrCreateInvoice(card.id, refMonth, dueDate, closingDate);

      if (invoiceId) {
        createdInvoiceIds.push(invoiceId);

        const desc = isInstallment
          ? `${expenseForm.description} (${i + 1}/${numInstallments})`
          : expenseForm.description;

        await supabase.from('transactions').insert({
          description: desc,
          amount: -Math.abs(installmentAmount),
          type: 'expense',
          card_id: card.id,
          invoice_id: invoiceId,
          date: expenseForm.date,
          confirmed: true,
          source: 'manual',
          notes: null,
          installments_total: numInstallments,
          installment_number: i + 1,
          profile,
        });

        const inv = invoices.find(iv => iv.id === invoiceId);
        const newAmount = (inv ? Number(inv.amount) : 0) + installmentAmount;
        await supabase.from('card_invoices').update({ amount: newAmount }).eq('id', invoiceId);
      }
    }

    setSavingExpense(false);
    setShowExpenseForm(false);
    loadData();
  }

  const cardColors = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#10b981', '#f97316'];

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-40 rounded-2xl skeleton" />)}</div>;

  const displayCard = selectedCard ? cards.find(c => c.id === selectedCard) : null;
  const displayInvoices = displayCard ? invoices.filter(i => i.card_id === displayCard.id) : [];
  const filteredInvoices = displayInvoices.filter(i => {
    if (invoiceFilter === 'open') return i.status === 'open';
    if (invoiceFilter === 'future') return i.status === 'future';
    return i.status === 'closed' || i.status === 'paid';
  });

  // Build installment schedule for the selected card
  const installmentTxns = displayCard
    ? transactions
        .filter(t => t.card_id === displayCard.id && t.installments_total > 1)
        .sort((a, b) => {
          if (a.description === b.description) return a.installment_number - b.installment_number;
          return a.date.localeCompare(b.date);
        })
    : [];

  // Group installment transactions by description base
  const installmentGroups: Record<string, Transaction[]> = {};
  installmentTxns.forEach(t => {
    const base = t.description.replace(/\s*\(\d+\/\d+\)\s*$/, '');
    if (!installmentGroups[base]) installmentGroups[base] = [];
    installmentGroups[base].push(t);
  });

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Cartões de Crédito</h1>
        <div className="flex gap-2">
          {displayCard && (
            <button onClick={() => setShowExpenseForm(true)} className="btn-ghost flex items-center gap-2 border border-[#27272a]">
              <Receipt size={18} /> <span className="hidden sm:inline">Lançar Despesa</span>
            </button>
          )}
          <button onClick={() => { setEditingCard(null); setShowCardForm(true); }} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> <span className="hidden sm:inline">Novo Cartão</span>
          </button>
        </div>
      </div>

      <DateFilterBar />

      {!displayCard ? (
        cards.length === 0 ? (
          <EmptyState
            icon={<CardIcon size={28} />}
            title="Nenhum cartão cadastrado"
            description="Cadastre seus cartões de crédito para acompanhar faturas e limites."
            action={<button onClick={() => { setEditingCard(null); setShowCardForm(true); }} className="btn-primary flex items-center gap-2"><Plus size={18} /> Adicionar Cartão</button>}
          />
        ) : (
          <div className="space-y-3">
            {cards.map(card => {
              const cardInvs = invoices.filter(i => i.card_id === card.id);
              const openInv = cardInvs.find(i => i.status === 'open');
              const futureInvs = cardInvs.filter(i => i.status === 'future');
              const usedLimit = [...cardInvs.filter(i => i.status === 'open'), ...futureInvs].reduce((s, i) => s + Number(i.amount), 0);
              const available = Number(card.limit_total) - usedLimit;
              const usedPct = card.limit_total > 0 ? (usedLimit / Number(card.limit_total)) * 100 : 0;
              return (
                <div key={card.id} className="card overflow-hidden card-hover" onClick={() => setSelectedCard(card.id)}>
                  <div className="p-5" style={{ background: `linear-gradient(135deg, ${card.color}15, transparent)` }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${card.color}30` }}>
                          <CardIcon size={22} style={{ color: card.color }} />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-white">{card.name}</p>
                          <p className="text-xs text-[#71717a]">{card.institution}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setEditingCard(card); setShowCardForm(true); }} className="p-2 hover:bg-[#27272a] rounded-lg">
                          <Pencil size={14} className="text-[#a1a1aa]" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteCardId(card.id); }} className="p-2 hover:bg-[#ef4444]/10 rounded-lg">
                          <Trash2 size={14} className="text-[#ef4444]" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-[#71717a]">Fatura Atual</p>
                        <p className="text-lg font-bold text-white">{formatCurrency(Number(openInv?.amount || 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#71717a]">Limite Disponível</p>
                        <p className="text-lg font-bold text-[#10b981]">{formatCurrency(available)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#71717a]">Limite usado: {usedPct.toFixed(0)}%</span>
                        <span className="text-[#71717a]">{formatCurrency(usedLimit)} / {formatCurrency(Number(card.limit_total))}</span>
                      </div>
                      <div className="h-2 bg-[#0a0a0b] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${usedPct}%`, background: usedPct > 80 ? '#ef4444' : card.color }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex border-t border-[#27272a]">
                    <div className="flex-1 px-4 py-2.5 text-center text-xs text-[#71717a]">Fecha dia {card.closing_day}</div>
                    <div className="w-px bg-[#27272a]" />
                    <div className="flex-1 px-4 py-2.5 text-center text-xs text-[#71717a]">Vence dia {card.due_day}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <button onClick={() => setSelectedCard(null)} className="flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-white">
            <ChevronRight size={16} className="rotate-180" /> Voltar
          </button>

          {/* Card header with sync indicator */}
          <div className="card p-5" style={{ background: `linear-gradient(135deg, ${displayCard.color}15, transparent)` }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${displayCard.color}30` }}>
                  <CardIcon size={22} style={{ color: displayCard.color }} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">{displayCard.name}</p>
                  <p className="text-xs text-[#71717a]">{displayCard.institution}</p>
                </div>
              </div>
              <button onClick={() => setShowExpenseForm(true)} className="btn-primary flex items-center gap-2 text-sm">
                <Receipt size={16} /> Lançar Despesa
              </button>
            </div>
            {/* Detailed summary */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#27272a]">
              <div>
                <p className="text-xs text-[#71717a]">Fatura Atual</p>
                <p className="text-base font-bold text-white">
                  {formatCurrency(Number(displayInvoices.find(i => i.status === 'open')?.amount || 0))}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#71717a]">Limite Total</p>
                <p className="text-base font-bold text-white">{formatCurrency(Number(displayCard.limit_total))}</p>
              </div>
              <div>
                <p className="text-xs text-[#71717a]">Disponível</p>
                <p className="text-base font-bold text-[#10b981]">
                  {formatCurrency(Number(displayCard.limit_total) - displayInvoices.filter(i => i.status === 'open' || i.status === 'future').reduce((s, i) => s + Number(i.amount), 0))}
                </p>
              </div>
            </div>
          </div>

          {/* Installment Schedule */}
          {Object.keys(installmentGroups).length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Layers size={16} className="text-[#8b5cf6]" /> Cronograma de Parcelas
              </h3>
              <div className="space-y-3">
                {Object.entries(installmentGroups).map(([base, txns]) => {
                  const total = txns[0].installments_total;
                  const paid = txns.filter(t => {
                    const inv = displayInvoices.find(i => i.id === t.invoice_id);
                    return inv?.status === 'paid' || inv?.status === 'closed';
                  }).length;
                  const remaining = total - paid;
                  return (
                    <div key={base} className="p-3 rounded-xl bg-[#0a0a0b] border border-[#27272a]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-white truncate">{base}</p>
                        <span className="text-xs text-[#a1a1aa] flex-shrink-0 ml-2">
                          {paid}/{total} pagas
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="flex-1 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#8b5cf6] rounded-full transition-all"
                            style={{ width: `${(paid / total) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#71717a]">{formatCurrency(Math.abs(Number(txns[0].amount)))}/x</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {txns.map(t => {
                          const inv = displayInvoices.find(i => i.id === t.invoice_id);
                          const isPaid = inv?.status === 'paid' || inv?.status === 'closed';
                          const isFuture = inv?.status === 'future';
                          return (
                            <span
                              key={t.id}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                isPaid
                                  ? 'bg-[#10b981]/15 text-[#10b981]'
                                  : isFuture
                                    ? 'bg-[#3b82f6]/15 text-[#3b82f6]'
                                    : 'bg-[#f59e0b]/15 text-[#f59e0b]'
                              }`}
                            >
                              {t.installment_number}/{total}
                            </span>
                          );
                        })}
                      </div>
                      {remaining > 0 && (
                        <p className="text-xs text-[#71717a] mt-2 flex items-center gap-1">
                          <CalendarClock size={11} />
                          {remaining} parcela{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''} • Total: {formatCurrency(Math.abs(Number(txns[0].amount)) * remaining)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Invoice tabs */}
          <div className="flex gap-2">
            {([
              { key: 'open', label: 'Fatura Atual' },
              { key: 'future', label: 'Futuras' },
              { key: 'closed', label: 'Fechadas/Pagas' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setInvoiceFilter(tab.key)}
                className={`chip whitespace-nowrap ${invoiceFilter === tab.key ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#27272a] text-[#a1a1aa]'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredInvoices.length === 0 ? (
            <div className="card p-8 text-center">
              <Calendar size={28} className="text-[#71717a] mx-auto mb-2" />
              <p className="text-sm text-[#71717a]">Nenhuma fatura {invoiceFilter === 'open' ? 'aberta' : invoiceFilter === 'future' ? 'futura' : 'fechada'}.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInvoices.map(inv => {
                const invTxns = transactions.filter(t => t.invoice_id === inv.id);
                const isPaid = inv.status === 'paid';
                return (
                  <div key={inv.id} className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-white">{inv.reference_month}</p>
                        <p className="text-xs text-[#71717a]">Vencimento: {formatDate(inv.due_date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-white">{formatCurrency(Number(inv.amount))}</p>
                        <span className={`chip ${isPaid ? 'bg-[#10b981]/15 text-[#10b981]' : inv.status === 'open' ? 'bg-[#f59e0b]/15 text-[#f59e0b]' : 'bg-[#3b82f6]/15 text-[#3b82f6]'}`}>
                          {isPaid ? <><CheckCircle2 size={12} /> Paga</> : inv.status === 'open' ? <><Clock size={12} /> Aberta</> : 'Fechada'}
                        </span>
                      </div>
                    </div>
                    {invTxns.length > 0 && (
                      <div className="border-t border-[#27272a] pt-2 space-y-1">
                        {invTxns.map(t => (
                          <div key={t.id} className="flex justify-between items-center text-xs group">
                            <span className="text-[#a1a1aa] flex-1 min-w-0 truncate">
                              {t.description}
                              {t.installments_total > 1 && (
                                <span className="text-[#71717a] ml-1">({t.installment_number}/{t.installments_total})</span>
                              )}
                            </span>
                            <span className="text-[#ef4444] flex-shrink-0">{formatCurrency(Math.abs(Number(t.amount)))}</span>
                            {!isPaid && (
                              <div className="flex gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button onClick={() => { setEditingTxn(t); setShowTxnForm(true); }} className="p-1 hover:bg-[#27272a] rounded">
                                  <Pencil size={11} className="text-[#a1a1aa]" />
                                </button>
                                <button onClick={() => setDeleteTxnId(t.id)} className="p-1 hover:bg-[#ef4444]/10 rounded">
                                  <Trash2 size={11} className="text-[#ef4444]" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {!isPaid && inv.status === 'open' && Number(inv.amount) > 0 && (
                      <button onClick={() => payInvoice(inv)} className="w-full mt-3 btn-primary text-sm">
                        Marcar como Paga
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Card Form Modal */}
      <Modal open={showCardForm} onClose={() => { setShowCardForm(false); setEditingCard(null); }} title={editingCard ? 'Editar Cartão' : 'Novo Cartão'}>
        <form onSubmit={saveCard} className="space-y-4">
          <div>
            <label className="label">Nome do Cartão</label>
            <input className="input mt-1" value={cardForm.name} onChange={e => setCardForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Nubank Mastercard" autoFocus required />
          </div>
          <div>
            <label className="label">Instituição</label>
            <input className="input mt-1" value={cardForm.institution} onChange={e => setCardForm(f => ({ ...f, institution: e.target.value }))} placeholder="Ex: Nubank" required />
          </div>
          <div>
            <label className="label">Limite Total (R$)</label>
            <input type="number" step="0.01" className="input mt-1" value={cardForm.limit_total} onChange={e => setCardForm(f => ({ ...f, limit_total: e.target.value }))} placeholder="0,00" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dia de Fechamento</label>
              <input type="number" min="1" max="31" className="input mt-1" value={cardForm.closing_day} onChange={e => setCardForm(f => ({ ...f, closing_day: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Dia de Vencimento</label>
              <input type="number" min="1" max="31" className="input mt-1" value={cardForm.due_day} onChange={e => setCardForm(f => ({ ...f, due_day: e.target.value }))} required />
            </div>
          </div>
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2 mt-1">
              {cardColors.map(c => (
                <button key={c} type="button" onClick={() => setCardForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-transform ${cardForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#18181b] scale-110' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setShowCardForm(false); setEditingCard(null); }} className="flex-1 btn-ghost border border-[#27272a]">Cancelar</button>
            <button type="submit" className="flex-1 btn-primary">Salvar</button>
          </div>
        </form>
      </Modal>

      {/* Card Expense Form Modal */}
      <Modal open={showExpenseForm} onClose={() => setShowExpenseForm(false)} title="Lançar Despesa no Cartão">
        <form onSubmit={saveExpense} className="space-y-4">
          <div>
            <label className="label">Descrição</label>
            <input
              className="input mt-1"
              value={expenseForm.description}
              onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ex: Mercado, Eletrônico, Combustível..."
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor Total (R$)</label>
              <input
                type="number"
                step="0.01"
                className="input mt-1"
                value={expenseForm.amount}
                onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
                required
              />
            </div>
            <div>
              <label className="label">Data da Compra</label>
              <input
                type="date"
                className="input mt-1"
                value={expenseForm.date}
                onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Tipo de Pagamento</label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setExpenseForm(f => ({ ...f, paymentType: 'cash' }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  expenseForm.paymentType === 'cash'
                    ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                    : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'
                }`}
              >
                À Vista
              </button>
              <button
                type="button"
                onClick={() => setExpenseForm(f => ({ ...f, paymentType: 'installment' }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  expenseForm.paymentType === 'installment'
                    ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30'
                    : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'
                }`}
              >
                Parcelado
              </button>
            </div>
          </div>

          {expenseForm.paymentType === 'installment' && (
            <div>
              <label className="label">Número de Parcelas</label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {[2, 3, 4, 6, 10, 12].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setExpenseForm(f => ({ ...f, installments: String(n) }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      expenseForm.installments === String(n)
                        ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30'
                        : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'
                    }`}
                  >
                    {n}x
                  </button>
                ))}
                <input
                  type="number"
                  min="2"
                  max="48"
                  className="input w-20"
                  value={expenseForm.installments}
                  onChange={e => setExpenseForm(f => ({ ...f, installments: e.target.value }))}
                  placeholder="Outro"
                />
              </div>
            </div>
          )}

          {/* Recurrence option - only for cash (à vista) payments */}
          {expenseForm.paymentType === 'cash' && (
            <div className="rounded-xl border border-[#27272a] overflow-hidden">
              <button
                type="button"
                onClick={() => setIsRecurringExpense(!isRecurringExpense)}
                className={`w-full flex items-center gap-3 p-3 transition-colors ${isRecurringExpense ? 'bg-[#8b5cf6]/10' : 'bg-[#0a0a0b]'}`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isRecurringExpense ? 'bg-[#8b5cf6]/20' : 'bg-[#27272a]'}`}>
                  <Repeat size={16} className={isRecurringExpense ? 'text-[#8b5cf6]' : 'text-[#71717a]'} />
                </div>
                <div className="text-left flex-1">
                  <p className={`text-sm font-medium ${isRecurringExpense ? 'text-[#8b5cf6]' : 'text-white'}`}>Despesa Fixa Recorrente</p>
                  <p className="text-xs text-[#71717a]">Repete automaticamente todos os meses na fatura</p>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors ${isRecurringExpense ? 'bg-[#8b5cf6]' : 'bg-[#27272a]'} relative`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${isRecurringExpense ? 'left-[18px]' : 'left-0.5'}`} />
                </div>
              </button>

              {isRecurringExpense && (
                <div className="p-3 space-y-3 bg-[#0a0a0b] border-t border-[#27272a]">
                  <div>
                    <label className="label">Periodicidade</label>
                    <div className="flex gap-2 mt-1">
                      {(['weekly', 'monthly', 'yearly'] as const).map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setRecurringExpense(r => ({ ...r, periodicity: p }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium ${recurringExpense.periodicity === p ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30' : 'bg-[#27272a] text-[#71717a] border border-[#27272a]'}`}
                        >
                          {p === 'weekly' ? 'Semanal' : p === 'monthly' ? 'Mensal' : 'Anual'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label">Término</label>
                    <div className="flex gap-2 mt-1">
                      {([
                        { v: 'never', l: 'Sem término' },
                        { v: 'count', l: 'Nº de vezes' },
                        { v: 'date', l: 'Data limite' },
                      ] as const).map(o => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setRecurringExpense(r => ({ ...r, end_type: o.v }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium ${recurringExpense.end_type === o.v ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30' : 'bg-[#27272a] text-[#71717a] border border-[#27272a]'}`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {recurringExpense.end_type === 'count' && (
                    <div>
                      <label className="label">Número de Repetições</label>
                      <input
                        type="number"
                        min="1"
                        className="input mt-1"
                        value={recurringExpense.max_occurrences}
                        onChange={e => setRecurringExpense(r => ({ ...r, max_occurrences: e.target.value }))}
                      />
                    </div>
                  )}

                  {recurringExpense.end_type === 'date' && (
                    <div>
                      <label className="label">Data Limite</label>
                      <input
                        type="date"
                        className="input mt-1"
                        value={recurringExpense.end_date}
                        onChange={e => setRecurringExpense(r => ({ ...r, end_date: e.target.value }))}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-[#f59e0b] bg-[#f59e0b]/10 rounded-lg p-2">
                    <AlertCircle size={12} />
                    <span>Cada ocorrência será vinculada à fatura do mês correspondente.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {expenseForm.amount && (
            <div className="p-3 rounded-xl bg-[#0a0a0b] border border-[#27272a] space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#71717a]">Valor total</span>
                <span className="text-white font-medium">{formatCurrency(parseFloat(expenseForm.amount) || 0)}</span>
              </div>
              {expenseForm.paymentType === 'installment' && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#71717a]">Nº de parcelas</span>
                    <span className="text-white font-medium">{expenseForm.installments}x</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#71717a]">Valor por parcela</span>
                    <span className="text-[#3b82f6] font-medium">
                      {formatCurrency((parseFloat(expenseForm.amount) || 0) / (parseInt(expenseForm.installments) || 1))}
                    </span>
                  </div>
                  <p className="text-xs text-[#71717a] pt-1 border-t border-[#27272a]">
                    A 1ª parcela será lançada na fatura atual. As demais serão projetadas nos meses seguintes.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowExpenseForm(false)} className="flex-1 btn-ghost border border-[#27272a]">Cancelar</button>
            <button type="submit" disabled={savingExpense} className="flex-1 btn-primary disabled:opacity-50">
              {savingExpense ? 'Lançando...' : 'Lançar Despesa'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteCardId}
        title="Excluir cartão?"
        message="Todas as faturas e lançamentos vinculados serão removidos."
        onConfirm={deleteCard}
        onCancel={() => setDeleteCardId(null)}
      />

      {/* Edit Transaction Modal */}
      <Modal open={showTxnForm} onClose={() => { setShowTxnForm(false); setEditingTxn(null); }} title="Editar Lançamento" size="sm">
        <form onSubmit={saveTxn} className="space-y-4">
          <div>
            <label className="label">Descrição</label>
            <input
              className="input mt-1"
              value={txnForm.description}
              onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))}
              autoFocus
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                className="input mt-1"
                value={txnForm.amount}
                onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">Data</label>
              <input
                type="date"
                className="input mt-1"
                value={txnForm.date}
                onChange={e => setTxnForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setShowTxnForm(false); setEditingTxn(null); }} className="flex-1 btn-ghost border border-[#27272a]">Cancelar</button>
            <button type="submit" className="flex-1 btn-primary">Salvar</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTxnId}
        title="Excluir lançamento?"
        message="O valor será removido da fatura e o limite será recalculado."
        onConfirm={handleDeleteTxn}
        onCancel={() => setDeleteTxnId(null)}
      />
    </div>
  );
}
