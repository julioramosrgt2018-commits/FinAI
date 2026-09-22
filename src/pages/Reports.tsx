import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, formatCurrency, type Transaction, type Category, type Account, type CreditCard } from '@/lib/supabase';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { Calendar, Download, TrendingUp, TrendingDown, BarChart3, PieChart as PieIcon, LineChart as LineIcon } from 'lucide-react';

type PeriodType = 'day' | 'week' | 'month' | 'year';

export function Reports() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const loadData = useCallback(async () => {
    const [txns, cats, accs, cds] = await Promise.all([
      supabase.from('transactions').select('*').order('date'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('accounts').select('*').order('name'),
      supabase.from('credit_cards').select('*').order('name'),
    ]);
    setTransactions(txns.data || []);
    setCategories(cats.data || []);
    setAccounts(accs.data || []);
    setCards(cds.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (customStart && customEnd) {
      return { startDate: new Date(customStart), endDate: new Date(customEnd) };
    }
    if (period === 'day') {
      return { startDate: now, endDate: now };
    }
    if (period === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { startDate: start, endDate: now };
    }
    if (period === 'month') {
      return { startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
    }
    return { startDate: new Date(now.getFullYear(), 0, 1), endDate: new Date(now.getFullYear(), 11, 31) };
  }, [period, customStart, customEnd]);

  const filteredTxns = useMemo(() => {
    return transactions.filter(t => {
      const d = new Date(t.date);
      return d >= startDate && d <= endDate;
    });
  }, [transactions, startDate, endDate]);

  // Expenses by category
  const expensesByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filteredTxns.filter(t => t.type === 'expense').forEach(t => {
      const catName = categories.find(c => c.id === t.category_id)?.name || 'Sem categoria';
      map[catName] = (map[catName] || 0) + Math.abs(Number(t.amount));
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredTxns, categories]);

  // Income by category
  const incomeByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filteredTxns.filter(t => t.type === 'income').forEach(t => {
      const catName = categories.find(c => c.id === t.category_id)?.name || 'Sem categoria';
      map[catName] = (map[catName] || 0) + Math.abs(Number(t.amount));
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredTxns, categories]);

  // Expenses by account/card
  const expensesByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    filteredTxns.filter(t => t.type === 'expense').forEach(t => {
      let name = 'Sem conta';
      if (t.account_id) name = accounts.find(a => a.id === t.account_id)?.name || name;
      else if (t.card_id) name = cards.find(c => c.id === t.card_id)?.name || name;
      map[name] = (map[name] || 0) + Math.abs(Number(t.amount));
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredTxns, accounts, cards]);

  // Income by account
  const incomeByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    filteredTxns.filter(t => t.type === 'income').forEach(t => {
      const name = accounts.find(a => a.id === t.account_id)?.name || 'Sem conta';
      map[name] = (map[name] || 0) + Math.abs(Number(t.amount));
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredTxns, accounts]);

  // Balance evolution
  const balanceEvolution = useMemo(() => {
    const sorted = [...filteredTxns].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    return sorted.map(t => {
      running += Number(t.amount);
      return { date: new Date(t.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), saldo: running };
    });
  }, [filteredTxns]);

  // Fixed vs Variable
  const fixedVsVariable = useMemo(() => {
    let fixedExp = 0, variableExp = 0, fixedInc = 0, variableInc = 0;
    filteredTxns.forEach(t => {
      const cat = categories.find(c => c.id === t.category_id);
      if (!cat) return;
      const amt = Math.abs(Number(t.amount));
      if (t.type === 'expense') {
        if (cat.classification === 'fixed') fixedExp += amt;
        else variableExp += amt;
      } else {
        if (cat.classification === 'fixed') fixedInc += amt;
        else variableInc += amt;
      }
    });
    return [
      { name: 'Receitas Fixas', value: fixedInc, color: '#10b981' },
      { name: 'Receitas Variáveis', value: variableInc, color: '#34d399' },
      { name: 'Despesas Fixas', value: fixedExp, color: '#ef4444' },
      { name: 'Despesas Variáveis', value: variableExp, color: '#f87171' },
    ];
  }, [filteredTxns, categories]);

  const totalIncome = filteredTxns.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalExpense = filteredTxns.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const pieColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#14b8a6'];

  function exportCSV() {
    const headers = ['Data', 'Descrição', 'Tipo', 'Valor', 'Categoria'];
    const rows = filteredTxns.map(t => [
      t.date, t.description, t.type, String(Math.abs(Number(t.amount))),
      categories.find(c => c.id === t.category_id)?.name || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-finai-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-64 rounded-2xl skeleton" />)}</div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Relatórios & Análises</h1>
        <button onClick={exportCSV} className="btn-ghost flex items-center gap-2 border border-[#27272a]">
          <Download size={16} /> <span className="hidden sm:inline">CSV</span>
        </button>
      </div>

      {/* Period filter */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={16} className="text-[#a1a1aa]" />
          <span className="label">Período</span>
        </div>
        <div className="flex gap-2 mb-3">
          {(['day', 'week', 'month', 'year'] as PeriodType[]).map(p => (
            <button key={p} onClick={() => { setPeriod(p); setCustomStart(''); setCustomEnd(''); }}
              className={`chip ${period === p && !customStart ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#27272a] text-[#a1a1aa]'}`}>
              {p === 'day' ? 'Dia' : p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : 'Ano'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">De</label>
            <input type="date" className="input mt-1" value={customStart} onChange={e => { setCustomStart(e.target.value); setPeriod('month'); }} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" className="input mt-1" value={customEnd} onChange={e => { setCustomEnd(e.target.value); setPeriod('month'); }} />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <TrendingUp size={16} className="text-[#10b981] mx-auto mb-1" />
          <p className="text-xs text-[#71717a]">Receitas</p>
          <p className="text-sm font-bold text-[#10b981]">{formatCurrency(totalIncome)}</p>
        </div>
        <div className="card p-3 text-center">
          <TrendingDown size={16} className="text-[#ef4444] mx-auto mb-1" />
          <p className="text-xs text-[#71717a]">Despesas</p>
          <p className="text-sm font-bold text-[#ef4444]">{formatCurrency(totalExpense)}</p>
        </div>
        <div className="card p-3 text-center">
          <BarChart3 size={16} className="text-[#3b82f6] mx-auto mb-1" />
          <p className="text-xs text-[#71717a]">Saldo</p>
          <p className={`text-sm font-bold ${totalIncome - totalExpense >= 0 ? 'text-[#3b82f6]' : 'text-[#ef4444]'}`}>{formatCurrency(totalIncome - totalExpense)}</p>
        </div>
      </div>

      {/* Expenses by Category - Donut */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <PieIcon size={16} className="text-[#ef4444]" /> Despesas por Categoria
        </h3>
        {expensesByCategory.length === 0 ? (
          <p className="text-sm text-[#71717a] text-center py-8">Nenhuma despesa no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={expensesByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {expensesByCategory.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, color: '#fff' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Expenses by Account/Card - Bar */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-[#3b82f6]" /> Despesas por Conta/Cartão
        </h3>
        {expensesByAccount.length === 0 ? (
          <p className="text-sm text-[#71717a] text-center py-8">Nenhuma despesa no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={expensesByAccount} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} stroke="#71717a" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="#a1a1aa" fontSize={11} width={80} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, color: '#fff' }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Income by Category */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <PieIcon size={16} className="text-[#10b981]" /> Receitas por Categoria
        </h3>
        {incomeByCategory.length === 0 ? (
          <p className="text-sm text-[#71717a] text-center py-8">Nenhuma receita no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={incomeByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} paddingAngle={2}>
                {incomeByCategory.map((_, i) => <Cell key={i} fill={pieColors[(i + 2) % pieColors.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, color: '#fff' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Balance Evolution */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <LineIcon size={16} className="text-[#06b6d4]" /> Evolução de Saldos
        </h3>
        {balanceEvolution.length === 0 ? (
          <p className="text-sm text-[#71717a] text-center py-8">Sem dados no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={balanceEvolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} stroke="#71717a" fontSize={11} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, color: '#fff' }} />
              <Line type="monotone" dataKey="saldo" stroke="#06b6d4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Fixed vs Variable */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-[#8b5cf6]" /> Fixas x Variáveis
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={fixedVsVariable}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="name" stroke="#a1a1aa" fontSize={10} />
            <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} stroke="#71717a" fontSize={11} />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, color: '#fff' }} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]}>
              {fixedVsVariable.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
