import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, formatDate, type Account, type CreditCard as CreditCardType, type CardInvoice, type Transaction, type Category, type Benefit, type Loan } from '@/lib/supabase';
import { TrendingUp, TrendingDown, Wallet, CreditCard, ArrowUpRight, ArrowDownRight, Plus, Building2, AlertTriangle, Clock, Eye, EyeOff, Landmark, Zap, CalendarClock } from 'lucide-react';
import { TransactionForm } from '@/components/TransactionForm';
import { EmptyState } from '@/components/Shared';
import { DateFilterBar } from '@/components/DateFilterBar';
import { useDateFilter } from '@/lib/dateFilter';
import { useSecurity } from '@/lib/security';
import { useProfile } from '@/lib/profile';
import { computeDueAlerts, payDueAlertItem, type DueAlertSummary, type DueAlertItem } from '@/lib/dueAlerts';
import { CheckCircle2, ChevronDown } from 'lucide-react';

type DashboardProps = {
  onNavigate: (page: string) => void;
};

export function Dashboard({ onNavigate }: DashboardProps) {
  const { profile, isPJ } = useProfile();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCardType[]>([]);
  const [invoices, setInvoices] = useState<CardInvoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [dueAlerts, setDueAlerts] = useState<DueAlertSummary | null>(null);
  const [futureTxns, setFutureTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const { startDate, endDate } = useDateFilter();
  const { maskValues, toggleMask } = useSecurity();

  const fmt = (v: number) => maskValues ? 'R$ ••••••' : formatCurrency(v);

  const loadData = useCallback(async () => {
    const [accs, cds, invs, txns, cats, bens, lns] = await Promise.all([
      supabase.from('accounts').select('*').eq('profile', profile).order('name'),
      supabase.from('credit_cards').select('*').eq('profile', profile).order('name'),
      supabase.from('card_invoices').select('*').eq('profile', profile).order('due_date'),
      supabase.from('transactions').select('*, category:categories(*), account:accounts(*), card:credit_cards(*)').eq('profile', profile).gte('date', startDate).lte('date', endDate).order('date', { ascending: false }),
      supabase.from('categories').select('*').eq('profile', profile).order('name'),
      supabase.from('benefits').select('*').eq('profile', profile).order('name'),
      supabase.from('loans').select('*').eq('profile', profile).order('name'),
    ]);

    setAccounts(accs.data || []);
    setCards(cds.data || []);
    setInvoices(invs.data || []);
    setTransactions(txns.data || []);
    setCategories(cats.data || []);
    setBenefits(bens.data || []);
    setLoans(lns.data || []);
    setLoading(false);

    // Load future-dated account transactions for projected balance
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: futureData } = await supabase
      .from('transactions')
      .select('*, category:categories(*), account:accounts(*), card:credit_cards(*)')
      .eq('profile', profile)
      .gt('date', todayStr)
      .order('date', { ascending: true });
    setFutureTxns(futureData || []);

    // Compute due alerts for the alerts banner
    const alertsSummary = await computeDueAlerts(profile);
    setDueAlerts(alertsSummary);
  }, [profile, startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  // Projected balance: current balance minus all future confirmed expenses plus future incomes
  // Only account-linked transactions affect the projection
  const futureAccountEffect = futureTxns
    .filter(t => t.account_id)
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const projectedBalance = totalBalance + futureAccountEffect;
  const upcomingScheduled = futureTxns
    .filter(t => t.account_id && t.type === 'expense')
    .slice(0, 5);

  // Competency-based income/expense: for installment card transactions,
  // use the invoice's due_date as the competency month instead of the purchase date.
  // This ensures each installment is counted only in its own month.
  const txnWithCompetency = transactions.map(t => {
    if (t.invoice_id) {
      const inv = invoices.find(i => i.id === t.invoice_id);
      if (inv) {
        return { ...t, competencyDate: inv.due_date };
      }
    }
    return { ...t, competencyDate: t.date };
  });

  const totalIncome = txnWithCompetency.filter(t => t.type === 'income' && t.competencyDate >= startDate && t.competencyDate <= endDate).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalExpense = txnWithCompetency.filter(t => t.type === 'expense' && t.competencyDate >= startDate && t.competencyDate <= endDate).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalBenefits = benefits.reduce((s, b) => s + Number(b.balance), 0);
  const totalLoanDebt = loans.reduce((s, l) => s + Number(l.remaining_balance), 0);


  const recentTransactions = txnWithCompetency
    .filter(t => t.competencyDate >= startDate && t.competencyDate <= endDate)
    .sort((a, b) => b.competencyDate.localeCompare(a.competencyDate))
    .slice(0, 8);

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
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
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

      <DateFilterBar />

      {/* Unified Balance */}
      <div className="card p-5 animate-pulse-glow">
        <div className="flex items-center gap-2 mb-2">
          <Wallet size={16} className="text-[#10b981]" />
          <span className="label">Saldo Atual (em caixa hoje)</span>
        </div>
        <p className="text-3xl font-bold text-white">{fmt(totalBalance)}</p>
        <p className="text-xs text-[#71717a] mt-1">Dinheiro disponível nas contas bancárias agora</p>

        {/* Projected balance */}
        <div className="mt-3 p-3 rounded-xl bg-[#0a0a0b] border border-[#27272a]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock size={14} className="text-[#3b82f6]" />
              <span className="text-xs text-[#71717a]">Saldo Projetado (com lançamentos futuros)</span>
            </div>
            <p className={`text-base font-bold ${projectedBalance >= 0 ? 'text-[#3b82f6]' : 'text-[#ef4444]'}`}>
              {fmt(projectedBalance)}
            </p>
          </div>
          {upcomingScheduled.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[#18181b] space-y-1">
              {upcomingScheduled.map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-[#a1a1aa] truncate flex-1 min-w-0 mr-2">{t.description}</span>
                  <span className="text-[#71717a] flex-shrink-0">{formatDate(t.date)}</span>
                  <span className="text-[#ef4444] flex-shrink-0 ml-2">-{formatCurrency(Math.abs(Number(t.amount)))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

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
        {!isPJ && (
        <div className="card p-4 card-hover" onClick={() => onNavigate('benefits')}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/15 flex items-center justify-center">
              <Wallet size={14} className="text-[#f59e0b]" />
            </div>
            <span className="text-xs text-[#71717a]">VA/VR</span>
          </div>
          <p className="text-lg font-bold text-white">{fmt(totalBenefits)}</p>
        </div>
        )}
        <div className={`card p-4 card-hover ${isPJ ? 'col-span-2' : ''}`} onClick={() => onNavigate('loans')}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/15 flex items-center justify-center">
              <TrendingDown size={14} className="text-[#8b5cf6]" />
            </div>
            <span className="text-xs text-[#71717a]">Dívidas</span>
          </div>
          <p className="text-lg font-bold text-white">{fmt(totalLoanDebt)}</p>
        </div>
      </div>

      {/* Due Alerts Banner */}
      <DueAlertsBanner summary={dueAlerts} onNavigate={onNavigate} accounts={accounts} onPaid={loadData} />

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
                    <p className="text-xs text-[#71717a]">{cat?.name || 'Sem categoria'} • {formatDate(t.competencyDate)}</p>
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

function DueAlertsBanner({ summary, onNavigate, accounts, onPaid }: {
  summary: DueAlertSummary | null;
  onNavigate: (page: string) => void;
  accounts: Account[];
  onPaid: () => void;
}) {
  if (!summary || summary.items.length === 0) {
    return (
      <div className="card p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 flex items-center justify-center">
          <span className="text-[#10b981] text-lg">✓</span>
        </div>
        <p className="text-sm text-[#a1a1aa]">Tudo em dia! Nenhum vencimento nos próximos dias.</p>
      </div>
    );
  }

  const { overdue, today, soon, totalOverdue, totalDueSoon } = summary;
  const hasOverdue = overdue.length > 0;

  return (
    <div className={`rounded-2xl overflow-hidden border ${hasOverdue ? 'border-[#ef4444]/30' : 'border-[#f59e0b]/30'}`}>
      {/* Banner header */}
      <div
        className="p-4 flex items-center gap-3"
        style={{
          background: hasOverdue
            ? 'linear-gradient(135deg, rgba(239,68,68,0.12), transparent)'
            : 'linear-gradient(135deg, rgba(245,158,11,0.12), transparent)'
        }}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${hasOverdue ? 'bg-[#ef4444]/20' : 'bg-[#f59e0b]/20'}`}>
          {hasOverdue ? <AlertTriangle size={20} className="text-[#ef4444]" /> : <Clock size={20} className="text-[#f59e0b]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">
            {hasOverdue
              ? `${overdue.length} ${overdue.length === 1 ? 'conta vencida' : 'contas vencidas'}`
              : today.length > 0
              ? `${today.length} ${today.length === 1 ? 'vencimento hoje' : 'vencimentos hoje'}`
              : `${soon.length} ${soon.length === 1 ? 'vencimento próximo' : 'vencimentos próximos'}`}
          </p>
          <p className="text-xs text-[#a1a1aa]">
            {hasOverdue && `Atrasado: ${formatCurrency(totalOverdue)}${totalDueSoon > 0 ? ' • ' : ''}`}
            {totalDueSoon > 0 && `A vencer: ${formatCurrency(totalDueSoon)}`}
          </p>
        </div>
        {hasOverdue && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#ef4444]/20 text-[#ef4444] text-xs font-bold animate-pulse">
            <Zap size={12} /> URGENTE
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="bg-[#0a0a0b] divide-y divide-[#18181b]">
        {overdue.map(item => (
          <DueAlertRow key={item.id} item={item} onNavigate={onNavigate} accounts={accounts} onPaid={onPaid} />
        ))}
        {today.map(item => (
          <DueAlertRow key={item.id} item={item} onNavigate={onNavigate} accounts={accounts} onPaid={onPaid} />
        ))}
        {soon.map(item => (
          <DueAlertRow key={item.id} item={item} onNavigate={onNavigate} accounts={accounts} onPaid={onPaid} />
        ))}
      </div>
    </div>
  );
}

function DueAlertRow({ item, onNavigate, accounts, onPaid }: {
  item: DueAlertItem;
  onNavigate: (page: string) => void;
  accounts: Account[];
  onPaid: () => void;
}) {
  const [showPayMenu, setShowPayMenu] = useState(false);
  const [paying, setPaying] = useState(false);
  const Icon = item.kind === 'invoice' ? CreditCard : item.kind === 'loan_installment' ? Landmark : Wallet;
  const color = item.severity === 'overdue' ? '#ef4444' : '#f59e0b';
  const label =
    item.severity === 'overdue' ? `${Math.abs(item.daysUntilDue)}d atraso`
    : item.severity === 'today' ? 'Hoje'
    : `${item.daysUntilDue}d`;

  async function handlePay(accountId: string) {
    setPaying(true);
    await payDueAlertItem(item, accountId);
    setPaying(false);
    setShowPayMenu(false);
    onPaid();
  }

  return (
    <div className="p-3 hover:bg-[#18181b] transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
          <Icon size={15} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
          if (item.kind === 'invoice') onNavigate('cards');
          else if (item.kind === 'loan_installment') onNavigate('loans');
          else onNavigate('transactions');
        }}>
          <p className="text-sm font-medium text-white truncate">{item.title}</p>
          <p className="text-xs text-[#71717a] truncate">{item.subtitle}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-white">{formatCurrency(item.amount)}</p>
          <span className="text-[10px] font-bold" style={{ color }}>{label}</span>
        </div>
      </div>
      {/* Pay button */}
      <div className="mt-2 ml-12">
        {showPayMenu ? (
          <div className="flex items-center gap-2">
            <select
              className="input flex-1 text-xs py-1.5"
              defaultValue=""
              onChange={e => { if (e.target.value) handlePay(e.target.value); }}
              disabled={paying}
            >
              <option value="" disabled>Pagar com conta...</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} — {formatCurrency(Number(a.balance))}</option>
              ))}
            </select>
            <button
              onClick={() => setShowPayMenu(false)}
              className="px-2 py-1.5 rounded-lg text-xs text-[#71717a] hover:text-white hover:bg-[#27272a]"
            >Cancelar</button>
          </div>
        ) : (
          <button
            onClick={() => setShowPayMenu(true)}
            disabled={paying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10b981]/15 text-[#10b981] text-xs font-medium hover:bg-[#10b981]/25 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            {paying ? 'Pagando...' : 'Baixar / Pagar'}
          </button>
        )}
      </div>
    </div>
  );
}
