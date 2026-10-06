import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, formatDate, type Transaction, type Category, type Account, type CreditCard as CreditCardType, type Benefit, type CardInvoice } from '@/lib/supabase';
import { Search, Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Filter, Download, Layers, Building2, CreditCard, Wallet, Repeat } from 'lucide-react';
import { TransactionForm } from '@/components/TransactionForm';
import { ConfirmDialog, EmptyState } from '@/components/Shared';
import { DateFilterBar } from '@/components/DateFilterBar';
import { useDateFilter } from '@/lib/dateFilter';
import { useProfile } from '@/lib/profile';
import { deleteTransactionWithReversal } from '@/lib/transactionHelpers';
import { deleteRecurringSeries, deleteSingleOccurrence } from '@/lib/recurrence';

type ViewMode = 'unified' | 'by_institution';

export function Transactions() {
  const { profile } = useProfile();
  const { startDate, endDate } = useDateFilter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCardType[]>([]);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [invoices, setInvoices] = useState<CardInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('unified');
  const [selectedInstitution, setSelectedInstitution] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSeriesChoice, setDeleteSeriesChoice] = useState<'single' | 'series' | null>(null);

  const loadData = useCallback(async () => {
    const [txns, cats, accs, cds, bens, invs] = await Promise.all([
      supabase.from('transactions').select('*, category:categories(*), account:accounts(*), card:credit_cards(*)').eq('profile', profile).order('date', { ascending: false }),
      supabase.from('categories').select('*').eq('profile', profile).order('name'),
      supabase.from('accounts').select('*').eq('profile', profile).order('name'),
      supabase.from('credit_cards').select('*').eq('profile', profile).order('name'),
      supabase.from('benefits').select('*').eq('profile', profile).order('name'),
      supabase.from('card_invoices').select('*').eq('profile', profile),
    ]);
    setTransactions(txns.data || []);
    setCategories(cats.data || []);
    setAccounts(accs.data || []);
    setCards(cds.data || []);
    setBenefits(bens.data || []);
    setInvoices(invs.data || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  // Competency-based filtering: for card transactions linked to invoices,
  // use the invoice's due_date as the competency month instead of the purchase date.
  // This ensures each installment appears only in its corresponding month.
  const txnWithCompetency = transactions.map(t => {
    if (t.invoice_id) {
      const inv = invoices.find(i => i.id === t.invoice_id);
      if (inv) return { ...t, competencyDate: inv.due_date };
    }
    return { ...t, competencyDate: t.date };
  });

  const filtered = txnWithCompetency.filter(t => {
    // Apply date range filter using competency date
    if (t.competencyDate < startDate || t.competencyDate > endDate) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (viewMode === 'by_institution' && selectedInstitution !== 'all') {
      if (t.account_id !== selectedInstitution && t.card_id !== selectedInstitution) return false;
    }
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  type OriginInfo = { label: string; institution: string; icon: typeof Building2; color: string };
  function getOrigin(t: Transaction): OriginInfo {
    if (t.account) {
      return { label: 'Conta Corrente', institution: t.account.institution, icon: Building2, color: t.account.color };
    }
    if (t.card) {
      return { label: 'Cartão de Crédito', institution: t.card.institution, icon: CreditCard, color: t.card.color };
    }
    const benefit = benefits.find(b => b.id === t.account_id);
    if (benefit) {
      return { label: benefit.type === 'food' ? 'Vale-Alimentação' : benefit.type === 'meal' ? 'Vale-Refeição' : 'Benefício', institution: benefit.provider, icon: Wallet, color: benefit.color };
    }
    return { label: 'Manual', institution: '', icon: Building2, color: '#71717a' };
  }

  const grouped = filtered.reduce((acc, t) => {
    const dateKey = t.competencyDate;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(t);
    return acc;
  }, {} as Record<string, typeof filtered>);

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  async function handleDelete() {
    if (!deleteId) return;
    const txn = transactions.find(t => t.id === deleteId);
    if (!txn) {
      await supabase.from('transactions').delete().eq('id', deleteId);
      setDeleteId(null);
      loadData();
      return;
    }

    if (txn.recurring_series_id && deleteSeriesChoice === 'series') {
      await deleteRecurringSeries(txn.recurring_series_id);
    } else if (txn.recurring_series_id && deleteSeriesChoice === 'single') {
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
    setDeleteId(null);
    setDeleteSeriesChoice(null);
    loadData();
  }

  function exportCSV() {
    const headers = ['Data', 'Descrição', 'Tipo', 'Valor', 'Categoria', 'Conta', 'Cartão'];
    const rows = filtered.map(t => [
      t.competencyDate, t.description, t.type, String(Math.abs(Number(t.amount))),
      categories.find(c => c.id === t.category_id)?.name || '',
      accounts.find(a => a.id === t.account_id)?.name || '',
      cards.find(c => c.id === t.card_id)?.name || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato-finai-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 rounded-xl skeleton" />)}</div>;
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Extrato</h1>
        <button onClick={exportCSV} className="btn-ghost flex items-center gap-2 border border-[#27272a]">
          <Download size={16} /> CSV
        </button>
      </div>

      <DateFilterBar />

      {/* View toggle: Unificada vs Por Instituição */}
      <div className="flex gap-2">
        <button
          onClick={() => { setViewMode('unified'); setSelectedInstitution('all'); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            viewMode === 'unified' ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#27272a] text-[#a1a1aa] border border-[#27272a]'
          }`}
        >
          <Layers size={16} /> Visão Unificada
        </button>
        <button
          onClick={() => setViewMode('by_institution')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            viewMode === 'by_institution' ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30' : 'bg-[#27272a] text-[#a1a1aa] border border-[#27272a]'
          }`}
        >
          <Building2 size={16} /> Por Instituição
        </button>
      </div>

      {/* Institution selector (only in by_institution mode) */}
      {viewMode === 'by_institution' && (
        <select className="input" value={selectedInstitution} onChange={e => setSelectedInstitution(e.target.value)}>
          <option value="all">Todas as instituições</option>
          <optgroup label="Contas Bancárias">
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.institution}</option>)}
          </optgroup>
          <optgroup label="Cartões de Crédito">
            {cards.map(c => <option key={c.id} value={c.id}>{c.name} — {c.institution}</option>)}
          </optgroup>
        </select>
      )}

      {/* Search & Type Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717a]" />
          <input
            className="input pl-10"
            placeholder="Buscar lançamentos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'income', 'expense', 'transfer'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`chip whitespace-nowrap ${filterType === t ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#27272a] text-[#a1a1aa]'}`}
            >
              {t === 'all' ? 'Tudo' : t === 'income' ? 'Receitas' : t === 'expense' ? 'Despesas' : 'Transferências'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary (competency-based) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <p className="text-xs text-[#71717a]">Receitas</p>
          <p className="text-sm font-bold text-[#10b981]">{formatCurrency(filtered.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(Number(t.amount)), 0))}</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xs text-[#71717a]">Despesas</p>
          <p className="text-sm font-bold text-[#ef4444]">{formatCurrency(filtered.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount)), 0))}</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xs text-[#71717a]">Saldo</p>
          <p className="text-sm font-bold text-white">{formatCurrency(filtered.reduce((s, t) => s + Number(t.amount), 0))}</p>
        </div>
      </div>

      {/* Institution header (by_institution mode) */}
      {viewMode === 'by_institution' && selectedInstitution !== 'all' && (() => {
        const acc = accounts.find(a => a.id === selectedInstitution);
        const card = cards.find(c => c.id === selectedInstitution);
        const name = acc ? `${acc.name} — ${acc.institution}` : card ? `${card.name} — ${card.institution}` : '';
        return (
          <div className="card p-3 flex items-center gap-2">
            <Building2 size={16} className="text-[#3b82f6]" />
            <span className="text-sm text-white font-medium">{name}</span>
          </div>
        );
      })()}

      {/* Transaction list */}
      {sortedDates.length === 0 ? (
        <EmptyState
          icon={<Filter size={28} />}
          title="Nenhum lançamento encontrado"
          description="Ajuste os filtros ou adicione um novo lançamento."
          action={<button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2"><Plus size={18} /> Novo Lançamento</button>}
        />
      ) : (
        <div className="space-y-4">
          {sortedDates.map(date => (
            <div key={date}>
              <p className="text-xs text-[#71717a] font-medium mb-2 px-1">{formatDate(date)}</p>
              <div className="card divide-y divide-[#27272a]">
                {grouped[date].map(t => {
                  const cat = categories.find(c => c.id === t.category_id);
                  const isIncome = t.type === 'income';
                  const origin = getOrigin(t);
                  const OriginIcon = origin.icon;
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-3 group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cat ? `${cat.color}20` : '#27272a' }}>
                        {isIncome ? <ArrowUpRight size={16} className="text-[#10b981]" /> : <ArrowDownRight size={16} className="text-[#ef4444]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{t.description}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          {cat && (
                            <span className="text-xs text-[#71717a]">{cat.name}</span>
                          )}
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: `${origin.color}15`, color: origin.color }}>
                            <OriginIcon size={10} />
                            {origin.label}
                          </span>
                          {origin.institution && (
                            <span className="text-[10px] text-[#71717a] flex-shrink-0">{origin.institution}</span>
                          )}
                          {t.installments_total > 1 && (
                            <span className="text-[10px] text-[#3b82f6] flex-shrink-0">{t.installment_number}/{t.installments_total}x</span>
                          )}
                          {t.recurring_series_id && (
                            <span className="text-[10px] text-[#8b5cf6] flex-shrink-0 flex items-center gap-0.5">
                              <Repeat size={9} /> Recorrente
                            </span>
                          )}
                          {!t.confirmed && (
                            <span className="text-[10px] text-[#f59e0b] flex-shrink-0">Pendente</span>
                          )}
                        </div>
                      </div>
                      <p className={`text-sm font-semibold ${isIncome ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(Math.abs(Number(t.amount)))}
                      </p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditing(t); setShowForm(true); }} className="p-1.5 hover:bg-[#27272a] rounded-lg">
                          <Pencil size={14} className="text-[#a1a1aa]" />
                        </button>
                        <button onClick={() => setDeleteId(t.id)} className="p-1.5 hover:bg-[#ef4444]/10 rounded-lg">
                          <Trash2 size={14} className="text-[#ef4444]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => { setEditing(null); setShowForm(true); }}
        className="fixed bottom-20 right-4 sm:right-6 w-14 h-14 rounded-full bg-[#10b981] hover:bg-[#059669] text-white flex items-center justify-center shadow-lg shadow-[#10b981]/30 transition-colors z-30"
      >
        <Plus size={24} />
      </button>

      <TransactionForm open={showForm} onClose={() => setShowForm(false)} onSaved={loadData} editingTransaction={editing} />

      {deleteId && (() => {
        const txn = transactions.find(t => t.id === deleteId);
        const isRecurring = !!txn?.recurring_series_id;
        if (isRecurring && !deleteSeriesChoice) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setDeleteId(null); }}>
              <div className="card p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-semibold text-white mb-2">Excluir lançamento recorrente</h3>
                <p className="text-sm text-[#a1a1aa] mb-4">Este lançamento faz parte de uma série recorrente. O que deseja fazer?</p>
                <div className="space-y-2">
                  <button
                    onClick={() => { setDeleteSeriesChoice('single'); handleDelete(); }}
                    className="w-full p-3 rounded-xl bg-[#0a0a0b] border border-[#27272a] hover:border-[#f59e0b]/30 text-left transition-colors"
                  >
                    <p className="text-sm font-medium text-white">Excluir apenas esta ocorrência</p>
                    <p className="text-xs text-[#71717a]">As demais continuam sendo geradas normalmente</p>
                  </button>
                  <button
                    onClick={() => { setDeleteSeriesChoice('series'); handleDelete(); }}
                    className="w-full p-3 rounded-xl bg-[#0a0a0b] border border-[#27272a] hover:border-[#ef4444]/30 text-left transition-colors"
                  >
                    <p className="text-sm font-medium text-[#ef4444]">Excluir toda a série recorrente</p>
                    <p className="text-xs text-[#71717a]">Remove todas as ocorrências passadas e futuras</p>
                  </button>
                </div>
                <button onClick={() => { setDeleteId(null); }} className="w-full mt-3 btn-ghost border border-[#27272a] text-sm">Cancelar</button>
              </div>
            </div>
          );
        }
        return (
          <ConfirmDialog
            open={!!deleteId}
            title="Excluir lançamento?"
            message="Esta ação não pode ser desfeita. O valor será removido e o saldo da conta será ajustado."
            onConfirm={handleDelete}
            onCancel={() => { setDeleteId(null); setDeleteSeriesChoice(null); }}
          />
        );
      })()}
    </div>
  );
}
