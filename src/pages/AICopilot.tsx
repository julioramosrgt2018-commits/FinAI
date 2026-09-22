import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, formatCurrency, type AIConversation, type Transaction, type Account, type CreditCard, type Category, type Loan, type Benefit, type Investment } from '@/lib/supabase';
import { Sparkles, Send, Bot, User, TrendingUp, TrendingDown, Lightbulb, AlertTriangle } from 'lucide-react';

export function AICopilot() {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [financialData, setFinancialData] = useState({
    transactions: [] as Transaction[],
    accounts: [] as Account[],
    cards: [] as CreditCard[],
    categories: [] as Category[],
    loans: [] as Loan[],
    benefits: [] as Benefit[],
    investments: [] as Investment[],
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    const [convs, txns, accs, cds, cats, lns, bens, invs] = await Promise.all([
      supabase.from('ai_conversations').select('*').order('created_at'),
      supabase.from('transactions').select('*').order('date', { ascending: false }).limit(50),
      supabase.from('accounts').select('*'),
      supabase.from('credit_cards').select('*'),
      supabase.from('categories').select('*'),
      supabase.from('loans').select('*'),
      supabase.from('benefits').select('*'),
      supabase.from('investments').select('*'),
    ]);
    setConversations(convs.data || []);
    setFinancialData({
      transactions: txns.data || [],
      accounts: accs.data || [],
      cards: cds.data || [],
      categories: cats.data || [],
      loans: lns.data || [],
      benefits: bens.data || [],
      investments: invs.data || [],
    });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversations, thinking]);

  function generateAIResponse(question: string): string {
    const { transactions, accounts, cards, categories, loans, benefits, investments } = financialData;
    const q = question.toLowerCase();

    const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
    const now = new Date();
    const monthTxns = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthIncome = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const monthExpense = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const totalDebt = loans.reduce((s, l) => s + Number(l.remaining_balance), 0);
    const totalBenefits = benefits.reduce((s, b) => s + Number(b.balance), 0);
    const totalInvested = investments.reduce((s, i) => s + Number(i.current_value), 0);

    if (q.includes('saldo') || q.includes('resumo') || q.includes('visão') || q.includes('visao')) {
      return `Aqui está seu resumo financeiro atual:\n\n• Saldo Total em Contas: ${formatCurrency(totalBalance)}\n• Receitas deste mês: ${formatCurrency(monthIncome)}\n• Despesas deste mês: ${formatCurrency(monthExpense)}\n• Saldo do mês: ${formatCurrency(monthIncome - monthExpense)}\n• Benefícios (VA/VR): ${formatCurrency(totalBenefits)}\n• Dívidas pendentes: ${formatCurrency(totalDebt)}\n• Patrimônio investido: ${formatCurrency(totalInvested)}\n\n${monthIncome - monthExpense < 0 ? '⚠️ Atenção: suas despesas superaram suas receitas este mês. Considere revisar gastos não essenciais.' : '✓ Você está com saldo positivo este mês. Continue assim!'}`;
    }

    if (q.includes('gasto') || q.includes('despesa') || q.includes('corte') || q.includes('economiz')) {
      const byCategory: Record<string, number> = {};
      monthTxns.filter(t => t.type === 'expense').forEach(t => {
        const cat = categories.find(c => c.id === t.category_id)?.name || 'Sem categoria';
        byCategory[cat] = (byCategory[cat] || 0) + Math.abs(Number(t.amount));
      });
      const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
      const top3 = sorted.slice(0, 3);
      const variableCats = sorted.filter(([name]) => {
        const cat = categories.find(c => c.name === name);
        return cat?.classification === 'variable';
      });
      let response = `Análise dos seus gastos deste mês:\n\n`;
      response += `Total gasto: ${formatCurrency(monthExpense)}\n\nMaiores categorias:\n`;
      top3.forEach(([name, val]) => { response += `• ${name}: ${formatCurrency(val)}\n`; });
      if (variableCats.length > 0) {
        response += `\nOportunidades de corte (despesas variáveis):\n`;
        variableCats.slice(0, 3).forEach(([name, val]) => {
          response += `• ${name}: ${formatCurrency(val)} — reduzir 20% economizaria ${formatCurrency(val * 0.2)}\n`;
        });
      }
      response += `\nDica: tente reduzir 15% das despesas variáveis para economizar ${formatCurrency(variableCats.reduce((s, [, v]) => s + v * 0.15, 0))} por mês.`;
      return response;
    }

    if (q.includes('cart') || q.includes('fatura') || q.includes('crédito') || q.includes('credito')) {
      if (cards.length === 0) return 'Você não possui cartões de crédito cadastrados. Adicione seus cartões para que eu possa analisar suas faturas.';
      let response = `Análise dos seus cartões de crédito:\n\n`;
      cards.forEach(card => {
        response += `• ${card.name} (${card.institution}):\n  Limite: ${formatCurrency(Number(card.limit_total))}\n`;
      });
      response += `\nRecomendação: mantenha o uso do cartão abaixo de 30% do limite total para preservar seu score de crédito.`;
      return response;
    }

    if (q.includes('invest') || q.includes('aplica') || q.includes('rendimento')) {
      if (investments.length === 0) return 'Você ainda não cadastrou investimentos. Adicione sua carteira na aba de Investimentos para que eu possa analisar sua alocação e rentabilidade.';
      const totalInv = investments.reduce((s, i) => s + Number(i.invested_amount), 0);
      const totalCur = investments.reduce((s, i) => s + Number(i.current_value), 0);
      const ret = totalCur - totalInv;
      const retPct = totalInv > 0 ? (ret / totalInv) * 100 : 0;
      let response = `Sua carteira de investimentos:\n\n• Total investido: ${formatCurrency(totalInv)}\n• Valor atual: ${formatCurrency(totalCur)}\n• Retorno: ${formatCurrency(ret)} (${retPct.toFixed(2)}%)\n\n`;
      const byType: Record<string, number> = {};
      investments.forEach(inv => { byType[inv.type] = (byType[inv.type] || 0) + Number(inv.current_value); });
      response += 'Alocação:\n';
      Object.entries(byType).forEach(([type, val]) => {
        const pct = totalCur > 0 ? (val / totalCur) * 100 : 0;
        const labels: Record<string, string> = { fixed_income: 'Renda Fixa', stocks: 'Ações', fiis: 'FIIs', crypto: 'Cripto', funds: 'Fundos', other: 'Outros' };
        response += `• ${labels[type] || type}: ${formatCurrency(val)} (${pct.toFixed(1)}%)\n`;
      });
      return response;
    }

    if (q.includes('dívid') || q.includes('emprest') || q.includes('financi') || q.includes('parcela')) {
      if (loans.length === 0) return 'Você não possui empréstimos ou financiamentos cadastrados.';
      let response = `Suas dívidas:\n\n`;
      loans.forEach(loan => {
        const remaining = loan.installments_total - loan.installments_paid;
        response += `• ${loan.name} (${loan.institution}):\n  Saldo devedor: ${formatCurrency(Number(loan.remaining_balance))}\n  Parcela: ${formatCurrency(Number(loan.installment_amount))} (${remaining}x restantes)\n  Taxa: ${Number(loan.interest_rate).toFixed(2)}% a.m.\n`;
      });
      response += `\nDica: ${totalDebt > totalBalance * 0.5 ? 'Suas dívidas representam mais da metade do seu saldo. Priorize quitar as de maior taxa de juros.' : 'Suas dívidas estão sob controle. Continue pagando em dia.'}`;
      return response;
    }

    if (q.includes('benef') || q.includes('vale') || q.includes('vr') || q.includes('va')) {
      if (benefits.length === 0) return 'Você não possui benefícios (VA/VR) cadastrados.';
      let response = `Seus benefícios:\n\n`;
      benefits.forEach(b => { response += `• ${b.name}: ${formatCurrency(Number(b.balance))}\n`; });
      response += `\nTotal disponível: ${formatCurrency(totalBenefits)}`;
      return response;
    }

    if (q.includes('receit') || q.includes('ganho') || q.includes('entrada')) {
      const byCategory: Record<string, number> = {};
      monthTxns.filter(t => t.type === 'income').forEach(t => {
        const cat = categories.find(c => c.id === t.category_id)?.name || 'Sem categoria';
        byCategory[cat] = (byCategory[cat] || 0) + Math.abs(Number(t.amount));
      });
      let response = `Suas receitas deste mês:\n\nTotal: ${formatCurrency(monthIncome)}\n\nPor categoria:\n`;
      Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([name, val]) => {
        response += `• ${name}: ${formatCurrency(val)}\n`;
      });
      return response;
    }

    if (q.includes('prev') || q.includes('fluxo') || q.includes('futuro') || q.includes('próximo') || q.includes('proximo')) {
      const monthlyExpense = monthExpense;
      const fixedExpenses = monthTxns.filter(t => {
        const cat = categories.find(c => c.id === t.category_id);
        return t.type === 'expense' && cat?.classification === 'fixed';
      }).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
      const projectedEnd = totalBalance + monthIncome - monthlyExpense;
      const loanMonthly = loans.reduce((s, l) => s + Number(l.installment_amount), 0);
      let response = `Previsão de fluxo de caixa:\n\n`;
      response += `• Saldo atual: ${formatCurrency(totalBalance)}\n`;
      response += `• Receitas previstas: ${formatCurrency(monthIncome)}\n`;
      response += `• Despesas previstas: ${formatCurrency(monthExpense)}\n`;
      response += `• Parcelas de empréstimos: ${formatCurrency(loanMonthly)}\n`;
      response += `• Saldo projetado: ${formatCurrency(projectedEnd - loanMonthly)}\n\n`;
      response += projectedEnd - loanMonthly < 0 ? '⚠️ Atenção: seu saldo projetado é negativo. Considere reduzir despesas variáveis.' : '✓ Seu fluxo de caixa está saudável para o período.';
      return response;
    }

    return `Olá! Sou seu copiloto financeiro. Posso ajudar com:\n\n• "Qual meu saldo?" — resumo financeiro completo\n• "Onde estou gastando mais?" — análise de despesas\n• "Como posso economizar?" — sugestões de cortes\n• "Como estão meus investimentos?" — análise da carteira\n• "Previsão de fluxo de caixa" — projeção futura\n• "Situação das minhas dívidas" — status de empréstimos\n\nPergunte qualquer coisa sobre suas finanças!`;
  }

  async function sendMessage() {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput('');
    setThinking(true);

    await supabase.from('ai_conversations').insert({ role: 'user', content: userMsg });

    const response = generateAIResponse(userMsg);
    await new Promise(r => setTimeout(r, 800));
    await supabase.from('ai_conversations').insert({ role: 'assistant', content: response });

    setThinking(false);
    loadData();
  }

  const suggestions = [
    { icon: TrendingUp, text: 'Qual meu saldo atual?', color: '#10b981' },
    { icon: TrendingDown, text: 'Onde estou gastando mais?', color: '#ef4444' },
    { icon: Lightbulb, text: 'Como posso economizar?', color: '#f59e0b' },
    { icon: AlertTriangle, text: 'Previsão de fluxo de caixa', color: '#3b82f6' },
  ];

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl skeleton" />)}</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] pb-20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-[#10b981]/15 flex items-center justify-center">
          <Sparkles size={18} className="text-[#10b981]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Copiloto Financeiro IA</h1>
          <p className="text-xs text-[#71717a]">Análise inteligente das suas finanças</p>
        </div>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 no-scrollbar">
        {conversations.length === 0 && (
          <div className="card p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#10b981]/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles size={28} className="text-[#10b981]" />
            </div>
            <p className="text-sm text-[#a1a1aa] mb-4">Olá! Sou seu copiloto financeiro. Posso analisar seus gastos, sugerir cortes, prever fluxo de caixa e muito mais.</p>
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => setInput(s.text)} className="card p-3 card-hover text-left">
                  <s.icon size={16} style={{ color: s.color }} className="mb-1" />
                  <p className="text-xs text-white">{s.text}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {conversations.map(conv => (
          <div key={conv.id} className={`flex gap-2 ${conv.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {conv.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-[#10b981]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={16} className="text-[#10b981]" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${conv.role === 'user' ? 'bg-[#10b981] text-white' : 'card text-white'}`}>
              <p className="text-sm whitespace-pre-line">{conv.content}</p>
            </div>
            {conv.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-[#27272a] flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={16} className="text-[#a1a1aa]" />
              </div>
            )}
          </div>
        ))}

        {thinking && (
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#10b981]/15 flex items-center justify-center flex-shrink-0">
              <Bot size={16} className="text-[#10b981]" />
            </div>
            <div className="card px-4 py-3 flex gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="pt-3">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Pergunte sobre suas finanças..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          />
          <button onClick={sendMessage} disabled={!input.trim() || thinking} className="btn-primary px-4 disabled:opacity-50">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
