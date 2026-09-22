import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, formatDate, type Account, type CreditCard as CreditCardType, type CardInvoice, type Transaction, type Alert, type Category, type Benefit, type Loan } from '@/lib/supabase';
import { TrendingUp, TrendingDown, Wallet, CreditCard, Bell, ArrowUpRight, ArrowDownRight, Plus, Building2, AlertTriangle, Clock, Eye, EyeOff } from 'lucide-react';
import { TransactionForm } from '@/components/TransactionForm';
import { EmptyState } from '@/components/Shared';
import { useSecurity } from '@/lib/security';

type DashboardProps = {
  onNavigate: (page: string) => void;
};

export function Dashboard({ onNavigate }: DashboardProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCardType[]>([]);
  const [invoices, setInvoices] = useState<CardInvoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const { maskValues, toggleMask } = useSecurity();

  const fmt = (v: number) => maskValues ? 'R$ ••••••' : formatCurrency(v);

  const loadData = useCallback(async () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const [accs, cds, invs, txns, cats, alts, bens, lns] = await Promise.all([
      supabase.from('accounts').select('*').order('name'),
      supabase.from('credit_cards').select('*').order('name'),
      supabase.from('card_invoices').select('*').order('due_date'),
      supabase.from('transactions').select('*, category:categories(*), account:accounts(*), card:credit_cards(*)').gte('date', firstDay).lte('date', lastDay).order('date', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('benefits').select('*').order('name'),
      supabase.from('loans').select('*').order('name'),
    ]);

    setAccounts(accs.data || []);
    setCards(cds.data || []);
    setInvoices(invs.data || []);
    setTransactions(txns.data || []);
    setCategories(cats.data || []);
    setAlerts(alts.data || []);
    setBenefits(bens.data || []);
    setLoans(lns.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalBenefits = benefits.reduce((s, b) => s + Number(b.balance), 0);
  const totalLoanDebt = loans.reduce((s, l) => s + Number(l.remaining_balance), 0);

  const openInvoices = invoices.filter(i => i.status === 'open');
  const upcomingInvoices = invoices.filter(i => i.status === 'future');
  const paidInvoices = invoices.filter(i => i.status === 'paid' || i.status === 'closed');

  const recentTransactions = transactions.slice(0, 8);

  const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 rounded-2xl skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[#71717a] capitalize">{monthName}</p>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMask} className="p-2 rounded-lg text-[#a1a1aa] hover:text-white hover:bg-[#27272a] transition-colors">
            {maskValues ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <button onClick={() => setShowTransactionForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            <span className="hidden sm:inline">Novo Lançamento</span>
          </button>
        </div>
      </div>

      {/* Unified Balance */}
      <div className="card p-5 animate-pulse-glow">
        <div className="flex items-center gap-2 mb-2">
          <Wallet size={16} className="text-[#10b981]" />
          <span className="label">Saldo Geral Unificado</span>
        </div>
        <p className="text-3xl font-bold text-white">{fmt(totalBalance)}</p>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#27272a]">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <ArrowUpRight size={14} className="text-[#10b981]" />
              <span className="text-xs text-[#71717a]">Receitas</span>
            </div>
            <p className="text-lg font-semibold text-[#10b981]">{fmt(totalIncome)}</p>
          </div>
          <div className="w-px h-10 bg-[#27272a]" />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <ArrowDownRight size={14} className="text-[#ef4444]" />
              <span className="text-xs text-[#71717a]">Despesas</span>
            </div>
            <p className="text-lg font-semibold text-[#ef4444]">{fmt(totalExpense)}</p>
          </div>
          <div className="w-px h-10 bg-[#27272a] hidden sm:block" />
          <div className="flex-1 hidden sm:block">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TrendingUp size={14} className="text-[#3b82f6]" />
              <span className="text-xs text-[#71717a]">Saldo</span>
            </div>
            <p className={`text-lg font-semibold ${totalIncome - totalExpense >= 0 ? 'text-[#3b82f6]' : 'text-[#ef4444]'}`}>
              {fmt(totalIncome - totalExpense)}
            </p>
          </div>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 card-hover" onClick={() => onNavigate('benefits')}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/15 flex items-center justify-center">
              <Wallet size={14} className="text-[#f59e0b]" />
            </div>
            <span className="text-xs text-[#71717a]">VA/VR</span>
          </div>
          <p className="text-lg font-bold text-white">{fmt(totalBenefits)}</p>
        </div>
        <div className="card p-4 card-hover" onClick={() => onNavigate('loans')}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/15 flex items-center justify-center">
              <TrendingDown size={14} className="text-[#8b5cf6]" />
            </div>
            <span className="text-xs text-[#71717a]">Dívidas</span>
          </div>
          <p className="text-lg font-bold text-white">{fmt(totalLoanDebt)}</p>
        </div>
      </div>

      {/* Alerts Center */}
      <div>
        <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <Bell size={16} className="text-[#f59e0b]" />
          Central de Pendências e Alertas
        </h2>
        {alerts.length === 0 && openInvoices.length === 0 && upcomingInvoices.length === 0 ? (
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 flex items-center justify-center">
              <span className="text-[#10b981] text-lg">✓</span>
            </div>
            <p className="text-sm text-[#a1a1aa]">Tudo em dia! Nenhuma pendência no momento.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {openInvoices.map(inv => {
              const card = cards.find(c => c.id === inv.card_id);
              const daysLeft = Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000);
              return (
                <div key={inv.id} className="card p-3 flex items-center gap-3 card-hover" onClick={() => onNavigate('cards')}>
                  <div className="w-10 h-10 rounded-xl bg-[#f59e0b]/15 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={16} className="text-[#f59e0b]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">Fatura {card?.name || 'Cartão'} vence em {daysLeft} dias</p>
                    <p className="text-xs text-[#71717a]">{fmt(Number(inv.amount))} • Venc: {formatDate(inv.due_date)}</p>
                  </div>
                  <span className={`chip ${daysLeft <= 3 ? 'bg-[#ef4444]/15 text-[#ef4444]' : 'bg-[#f59e0b]/15 text-[#f59e0b]'}`}>
                    {daysLeft <= 0 ? 'Vencida' : `${daysLeft}d`}
                  </span>
                </div>
              );
            })}
            {alerts.map(alt => (
              <div key={alt.id} className="card p-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  alt.severity === 'critical' ? 'bg-[#ef4444]/15' : alt.severity === 'warning' ? 'bg-[#f59e0b]/15' : 'bg-[#3b82f6]/15'
                }`}>
                  <Bell size={16} className={
                    alt.severity === 'critical' ? 'text-[#ef4444]' : alt.severity === 'warning' ? 'text-[#f59e0b]' : 'text-[#3b82f6]'
                  } />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{alt.title}</p>
                  {alt.message && <p className="text-xs text-[#71717a] truncate">{alt.message}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bank Accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Building2 size={16} className="text-[#3b82f6]" />
            Contas Bancárias
          </h2>
          <button onClick={() => onNavigate('settings')} className="text-xs text-[#10b981] hover:underline">Gerenciar</button>
        </div>
        {accounts.length === 0 ? (
          <div className="card p-4">
            <p className="text-sm text-[#71717a] text-center">Nenhuma conta cadastrada. <button onClick={() => onNavigate('settings')} className="text-[#10b981]">Adicionar conta</button></p>
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map(acc => (
              <div key={acc.id} className="card p-4 card-hover flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${acc.color}20` }}>
                  <Building2 size={18} style={{ color: acc.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{acc.name}</p>
                  <p className="text-xs text-[#71717a]">{acc.institution} • {acc.type === 'checking' ? 'Conta Corrente' : acc.type === 'savings' ? 'Poupança' : 'Investimento'}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-white">{fmt(Number(acc.balance))}</p>
                  {acc.sync_enabled && <span className="text-xs text-[#10b981]">Sincronizado</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credit Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <CreditCard size={16} className="text-[#ef4444]" />
            Cartões de Crédito
          </h2>
          <button onClick={() => onNavigate('cards')} className="text-xs text-[#10b981] hover:underline">Ver faturas</button>
        </div>
        {cards.length === 0 ? (
          <div className="card p-4">
            <p className="text-sm text-[#71717a] text-center">Nenhum cartão cadastrado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cards.map(card => {
              const cardInvs = invoices.filter(i => i.card_id === card.id);
              const openInv = cardInvs.find(i => i.status === 'open');
              const usedLimit = cardInvs.filter(i => i.status === 'open' || i.status === 'future').reduce((s, i) => s + Number(i.amount), 0);
              const available = Number(card.limit_total) - usedLimit;
              const usedPct = card.limit_total > 0 ? (usedLimit / Number(card.limit_total)) * 100 : 0;
              return (
                <div key={card.id} className="card p-4 card-hover" onClick={() => onNavigate('cards')}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${card.color}20` }}>
                      <CreditCard size={18} style={{ color: card.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{card.name}</p>
                      <p className="text-xs text-[#71717a]">{card.institution}</p>
                    </div>
                    {openInv && (
                      <div className="text-right">
                        <p className="text-xs text-[#71717a]">Fatura atual</p>
                        <p className="text-sm font-bold text-white">{fmt(Number(openInv.amount))}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#71717a]">Limite disponível: {fmt(available)}</span>
                      <span className="text-[#71717a]">{usedPct.toFixed(0)}% usado</span>
                    </div>
                    <div className="h-2 bg-[#0a0a0b] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${usedPct}%`, background: usedPct > 80 ? '#ef4444' : card.color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Clock size={16} className="text-[#a1a1aa]" />
            Lançamentos Recentes
          </h2>
          <button onClick={() => onNavigate('transactions')} className="text-xs text-[#10b981] hover:underline">Ver extrato</button>
        </div>
        {recentTransactions.length === 0 ? (
          <EmptyState
            icon={<Plus size={28} />}
            title="Nenhum lançamento neste mês"
            description="Adicione receitas e despesas para acompanhar suas finanças."
          />
        ) : (
          <div className="card divide-y divide-[#27272a]">
            {recentTransactions.map(t => {
              const cat = categories.find(c => c.id === t.category_id);
              const isIncome = t.type === 'income';
              return (
                <div key={t.id} className="flex items-center gap-3 p-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cat ? `${cat.color}20` : '#27272a' }}>
                    {isIncome ? <ArrowUpRight size={16} className="text-[#10b981]" /> : <ArrowDownRight size={16} className="text-[#ef4444]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{t.description}</p>
                    <p className="text-xs text-[#71717a]">{cat?.name || 'Sem categoria'} • {formatDate(t.date)}</p>
                  </div>
                  <p className={`text-sm font-semibold ${isIncome ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                    {isIncome ? '+' : '-'}{fmt(Math.abs(Number(t.amount)))}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TransactionForm open={showTransactionForm} onClose={() => setShowTransactionForm(false)} onSaved={loadData} />
    </div>
  );
}
