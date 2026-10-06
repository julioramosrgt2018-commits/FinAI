import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, formatDate, type CardTerminal, type CardSale } from '@/lib/supabase';
import { Plus, Pencil, Trash2, CreditCard, ArrowUpRight, Calendar, Layers, TrendingUp, TrendingDown, Calculator, Upload } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState } from '@/components/Shared';
import { DateFilterBar } from '@/components/DateFilterBar';
import { useDateFilter } from '@/lib/dateFilter';
import { useProfile } from '@/lib/profile';

const acquirerColors: Record<string, string> = {
  Cielo: '#06b6d4',
  Rede: '#3b82f6',
  Getnet: '#8b5cf6',
  PagSeguro: '#10b981',
  Stone: '#f59e0b',
  'Mercado Pago': '#06b6d4',
  Outro: '#71717a',
};

const acquirerList = ['Cielo', 'Rede', 'Getnet', 'PagSeguro', 'Stone', 'Mercado Pago', 'Outro'];

export function Sales() {
  const { profile } = useProfile();
  const { startDate, endDate } = useDateFilter();
  const [terminals, setTerminals] = useState<CardTerminal[]>([]);
  const [sales, setSales] = useState<CardSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTerminalForm, setShowTerminalForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<CardTerminal | null>(null);
  const [deleteTerminalId, setDeleteTerminalId] = useState<string | null>(null);
  const [selectedTerminal, setSelectedTerminal] = useState<string | null>(null);
  const [saleFilter, setSaleFilter] = useState<'all' | 'pending' | 'settled'>('all');

  const [terminalForm, setTerminalForm] = useState({ name: '', acquirer: 'Cielo', terminal_id: '', color: '#06b6d4' });

  const [saleForm, setSaleForm] = useState({
    terminal_id: '',
    description: '',
    gross_amount: '',
    payment_type: 'credit' as 'debit' | 'credit',
    installments: '1',
    sale_date: new Date().toISOString().slice(0, 10),
    fee_rate: '3.99',
  });

  const [batchForm, setBatchForm] = useState({
    terminal_id: '',
    sale_date: new Date().toISOString().slice(0, 10),
    debit_total: '',
    credit_total: '',
    debit_fee: '1.99',
    credit_fee: '3.99',
  });

  const loadData = useCallback(async () => {
    const [terms, sls] = await Promise.all([
      supabase.from('card_terminals').select('*').eq('profile', profile).order('name'),
      supabase.from('card_sales').select('*').eq('profile', profile).gte('sale_date', startDate).lte('sale_date', endDate).order('sale_date', { ascending: false }),
    ]);
    setTerminals(terms.data || []);
    setSales(sls.data || []);
    setLoading(false);
  }, [profile, startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (editingTerminal) {
      setTerminalForm({ name: editingTerminal.name, acquirer: editingTerminal.acquirer, terminal_id: editingTerminal.terminal_id || '', color: editingTerminal.color });
    } else {
      setTerminalForm({ name: '', acquirer: 'Cielo', terminal_id: '', color: '#06b6d4' });
    }
  }, [editingTerminal]);

  useEffect(() => {
    if (showSaleForm && terminals.length > 0 && !saleForm.terminal_id) {
      setSaleForm(f => ({ ...f, terminal_id: selectedTerminal || terminals[0].id }));
    }
  }, [showSaleForm, terminals, selectedTerminal, saleForm.terminal_id]);

  useEffect(() => {
    if (showBatchForm && terminals.length > 0 && !batchForm.terminal_id) {
      setBatchForm(f => ({ ...f, terminal_id: selectedTerminal || terminals[0].id }));
    }
  }, [showBatchForm, terminals, selectedTerminal, batchForm.terminal_id]);

  async function saveTerminal(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: terminalForm.name, acquirer: terminalForm.acquirer,
      terminal_id: terminalForm.terminal_id || null, color: terminalForm.color, profile,
    };
    if (editingTerminal) {
      await supabase.from('card_terminals').update(data).eq('id', editingTerminal.id);
    } else {
      await supabase.from('card_terminals').insert(data);
    }
    setShowTerminalForm(false);
    setEditingTerminal(null);
    loadData();
  }

  async function deleteTerminal() {
    if (!deleteTerminalId) return;
    await supabase.from('card_sales').delete().eq('terminal_id', deleteTerminalId);
    await supabase.from('card_terminals').delete().eq('id', deleteTerminalId);
    setDeleteTerminalId(null);
    loadData();
  }

  function computeSettlementDate(paymentType: 'debit' | 'credit', saleDate: string, installments: number): string {
    const d = new Date(saleDate);
    if (paymentType === 'debit') {
      d.setDate(d.getDate() + 1);
    } else {
      d.setDate(d.getDate() + 30);
    }
    return d.toISOString().slice(0, 10);
  }

  async function saveSale(e: React.FormEvent) {
    e.preventDefault();
    const gross = parseFloat(saleForm.gross_amount);
    if (!gross || gross <= 0) return;
    const rate = parseFloat(saleForm.fee_rate) / 100;
    const fee = gross * rate;
    const net = gross - fee;
    const installments = parseInt(saleForm.installments);
    const settlementDate = computeSettlementDate(saleForm.payment_type, saleForm.sale_date, installments);

    await supabase.from('card_sales').insert({
      terminal_id: saleForm.terminal_id,
      sale_date: saleForm.sale_date,
      gross_amount: gross,
      net_amount: net,
      fee_amount: fee,
      fee_rate: rate,
      payment_type: saleForm.payment_type,
      installments,
      settlement_date: settlementDate,
      settlement_type: 'standard',
      status: 'pending',
      description: saleForm.description || null,
      source: 'manual',
      profile,
    });
    setShowSaleForm(false);
    setSaleForm(f => ({ ...f, gross_amount: '', description: '' }));
    loadData();
  }

  async function saveBatch(e: React.FormEvent) {
    e.preventDefault();
    const debitTotal = parseFloat(batchForm.debit_total) || 0;
    const creditTotal = parseFloat(batchForm.credit_total) || 0;
    if (debitTotal === 0 && creditTotal === 0) return;

    const inserts: Record<string, unknown>[] = [];

    if (debitTotal > 0) {
      const rate = parseFloat(batchForm.debit_fee) / 100;
      const fee = debitTotal * rate;
      inserts.push({
        terminal_id: batchForm.terminal_id,
        sale_date: batchForm.sale_date,
        gross_amount: debitTotal,
        net_amount: debitTotal - fee,
        fee_amount: fee,
        fee_rate: rate,
        payment_type: 'debit',
        installments: 1,
        settlement_date: computeSettlementDate('debit', batchForm.sale_date, 1),
        settlement_type: 'standard',
        status: 'pending',
        description: 'Lote débito manual',
        source: 'manual',
        profile,
      });
    }
    if (creditTotal > 0) {
      const rate = parseFloat(batchForm.credit_fee) / 100;
      const fee = creditTotal * rate;
      inserts.push({
        terminal_id: batchForm.terminal_id,
        sale_date: batchForm.sale_date,
        gross_amount: creditTotal,
        net_amount: creditTotal - fee,
        fee_amount: fee,
        fee_rate: rate,
        payment_type: 'credit',
        installments: 1,
        settlement_date: computeSettlementDate('credit', batchForm.sale_date, 1),
        settlement_type: 'standard',
        status: 'pending',
        description: 'Lote crédito manual',
        source: 'manual',
        profile,
      });
    }

    await supabase.from('card_sales').insert(inserts);
    setShowBatchForm(false);
    setBatchForm(f => ({ ...f, debit_total: '', credit_total: '' }));
    loadData();
  }

  async function settleSale(saleId: string) {
    await supabase.from('card_sales').update({ status: 'settled' }).eq('id', saleId);
    loadData();
  }

  const colors = ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];

  const displayTerminal = selectedTerminal ? terminals.find(t => t.id === selectedTerminal) : null;
  const displaySales = displayTerminal ? sales.filter(s => s.terminal_id === displayTerminal.id) : [];
  const filteredSales = displaySales.filter(s => saleFilter === 'all' || s.status === saleFilter);

  const totalGross = sales.reduce((s, sa) => s + Number(sa.gross_amount), 0);
  const totalNet = sales.reduce((s, sa) => s + Number(sa.net_amount), 0);
  const totalFees = sales.reduce((s, sa) => s + Number(sa.fee_amount), 0);
  const pendingReceivables = sales.filter(s => s.status === 'pending').reduce((s, sa) => s + Number(sa.net_amount), 0);
  const settledTotal = sales.filter(s => s.status === 'settled').reduce((s, sa) => s + Number(sa.net_amount), 0);

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl skeleton" />)}</div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Vendas & Maquininhas</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowBatchForm(true)} className="btn-ghost flex items-center gap-2 border border-[#27272a] text-sm">
            <Upload size={16} /> <span className="hidden sm:inline">Lote</span>
          </button>
          <button onClick={() => { setEditingTerminal(null); setShowTerminalForm(true); }} className="btn-ghost flex items-center gap-2 border border-[#27272a] text-sm">
            <CreditCard size={16} /> <span className="hidden sm:inline">Maquininha</span>
          </button>
          <button onClick={() => setShowSaleForm(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> <span className="hidden sm:inline">Venda</span>
          </button>
        </div>
      </div>

      <DateFilterBar />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-[#10b981]" />
            <span className="text-xs text-[#71717a]">Vendas Brutas</span>
          </div>
          <p className="text-xl font-bold text-white">{formatCurrency(totalGross)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={14} className="text-[#ef4444]" />
            <span className="text-xs text-[#71717a]">Taxas (MDR)</span>
          </div>
          <p className="text-xl font-bold text-[#ef4444]">{formatCurrency(totalFees)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calculator size={14} className="text-[#3b82f6]" />
            <span className="text-xs text-[#71717a]">Líquido a Receber</span>
          </div>
          <p className="text-xl font-bold text-[#3b82f6]">{formatCurrency(pendingReceivables)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight size={14} className="text-[#10b981]" />
            <span className="text-xs text-[#71717a]">Já Recebido</span>
          </div>
          <p className="text-xl font-bold text-[#10b981]">{formatCurrency(settledTotal)}</p>
        </div>
      </div>

      {/* Terminal list or detail */}
      {!displayTerminal ? (
        terminals.length === 0 ? (
          <EmptyState
            icon={<CreditCard size={28} />}
            title="Nenhuma maquininha cadastrada"
            description="Conecte suas maquininhas de cartão para sincronizar vendas e calcular taxas automaticamente."
            action={<button onClick={() => { setEditingTerminal(null); setShowTerminalForm(true); }} className="btn-primary flex items-center gap-2"><Plus size={18} /> Adicionar Maquininha</button>}
          />
        ) : (
          <div className="space-y-3">
            {terminals.map(term => {
              const termSales = sales.filter(s => s.terminal_id === term.id);
              const termGross = termSales.reduce((s, sa) => s + Number(sa.gross_amount), 0);
              const termNet = termSales.reduce((s, sa) => s + Number(sa.net_amount), 0);
              const termPending = termSales.filter(s => s.status === 'pending').reduce((s, sa) => s + Number(sa.net_amount), 0);
              const acquirerColor = acquirerColors[term.acquirer] || '#71717a';
              return (
                <div key={term.id} className="card overflow-hidden card-hover" onClick={() => setSelectedTerminal(term.id)}>
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${acquirerColor}20` }}>
                        <CreditCard size={20} style={{ color: acquirerColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{term.name}</p>
                        <p className="text-xs text-[#71717a]">{term.acquirer}{term.terminal_id && ` • ${term.terminal_id}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-white">{formatCurrency(termGross)}</p>
                        <p className="text-xs text-[#71717a]">{termSales.length} vendas</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#27272a]">
                      <div>
                        <p className="text-xs text-[#71717a]">Líquido</p>
                        <p className="text-sm font-bold text-[#3b82f6]">{formatCurrency(termNet)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#71717a]">A Receber</p>
                        <p className="text-sm font-bold text-[#f59e0b]">{formatCurrency(termPending)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[#27272a]">
                    <div className="flex-1" />
                    <button onClick={(e) => { e.stopPropagation(); setEditingTerminal(term); setShowTerminalForm(true); }} className="p-1.5 hover:bg-[#27272a] rounded-lg">
                      <Pencil size={12} className="text-[#a1a1aa]" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTerminalId(term.id); }} className="p-1.5 hover:bg-[#ef4444]/10 rounded-lg">
                      <Trash2 size={12} className="text-[#ef4444]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <button onClick={() => setSelectedTerminal(null)} className="text-sm text-[#a1a1aa] hover:text-white">← Voltar</button>

          {/* Terminal header */}
          <div className="card p-5" style={{ background: `linear-gradient(135deg, ${acquirerColors[displayTerminal.acquirer] || '#71717a'}15, transparent)` }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-lg font-semibold text-white">{displayTerminal.name}</p>
                <p className="text-xs text-[#71717a]">{displayTerminal.acquirer}{displayTerminal.terminal_id && ` • ${displayTerminal.terminal_id}`}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#27272a]">
              <div>
                <p className="text-xs text-[#71717a]">Bruto</p>
                <p className="text-base font-bold text-white">{formatCurrency(displaySales.reduce((s, sa) => s + Number(sa.gross_amount), 0))}</p>
              </div>
              <div>
                <p className="text-xs text-[#71717a]">Líquido</p>
                <p className="text-base font-bold text-[#3b82f6]">{formatCurrency(displaySales.reduce((s, sa) => s + Number(sa.net_amount), 0))}</p>
              </div>
              <div>
                <p className="text-xs text-[#71717a]">Taxas</p>
                <p className="text-base font-bold text-[#ef4444]">{formatCurrency(displaySales.reduce((s, sa) => s + Number(sa.fee_amount), 0))}</p>
              </div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {([
              { key: 'all', label: 'Todas' },
              { key: 'pending', label: 'A Receber' },
              { key: 'settled', label: 'Recebidas' },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setSaleFilter(tab.key)}
                className={`chip whitespace-nowrap ${saleFilter === tab.key ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30' : 'bg-[#27272a] text-[#a1a1aa]'}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sales list */}
          {filteredSales.length === 0 ? (
            <div className="card p-8 text-center">
              <Calendar size={28} className="text-[#71717a] mx-auto mb-2" />
              <p className="text-sm text-[#71717a]">Nenhuma venda {saleFilter === 'pending' ? 'pendente' : saleFilter === 'settled' ? 'recebida' : 'registrada'}.</p>
            </div>
          ) : (
            <div className="card divide-y divide-[#27272a]">
              {filteredSales.map(sale => (
                <div key={sale.id} className="p-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${sale.payment_type === 'debit' ? 'bg-[#10b981]/15' : 'bg-[#3b82f6]/15'}`}>
                    <CreditCard size={14} className={sale.payment_type === 'debit' ? 'text-[#10b981]' : 'text-[#3b82f6]'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {sale.description || `Venda ${sale.payment_type === 'debit' ? 'Débito' : 'Crédito'}`}
                      {sale.installments > 1 && ` (${sale.installments}x)`}
                    </p>
                    <p className="text-xs text-[#71717a]">
                      {formatDate(sale.sale_date)} • Recebimento: {formatDate(sale.settlement_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">{formatCurrency(Number(sale.gross_amount))}</p>
                    <p className="text-xs text-[#ef4444]">-{formatCurrency(Number(sale.fee_amount))}</p>
                    <p className="text-xs font-medium text-[#3b82f6]">Líq: {formatCurrency(Number(sale.net_amount))}</p>
                  </div>
                  {sale.status === 'pending' && (
                    <button onClick={() => settleSale(sale.id)} className="text-xs px-2 py-1 rounded-lg bg-[#10b981]/15 text-[#10b981] hover:bg-[#10b981]/25 transition-colors">
                      Receber
                    </button>
                  )}
                  {sale.status === 'settled' && (
                    <span className="chip bg-[#10b981]/15 text-[#10b981] text-xs">Recebido</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Terminal Form Modal */}
      <Modal open={showTerminalForm} onClose={() => { setShowTerminalForm(false); setEditingTerminal(null); }} title={editingTerminal ? 'Editar Maquininha' : 'Nova Maquininha'}>
        <form onSubmit={saveTerminal} className="space-y-4">
          <div>
            <label className="label">Nome</label>
            <input className="input mt-1" value={terminalForm.name} onChange={e => setTerminalForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Maquininha Cielo Lio" autoFocus required />
          </div>
          <div>
            <label className="label">Adquirente</label>
            <select className="input mt-1" value={terminalForm.acquirer} onChange={e => setTerminalForm(f => ({ ...f, acquirer: e.target.value, color: acquirerColors[e.target.value] || '#71717a' }))}>
              {acquirerList.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="label">ID do Terminal (opcional)</label>
            <input className="input mt-1" value={terminalForm.terminal_id} onChange={e => setTerminalForm(f => ({ ...f, terminal_id: e.target.value }))} placeholder="Serial ou código do terminal" />
          </div>
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2 mt-1">
              {colors.map(c => (
                <button key={c} type="button" onClick={() => setTerminalForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-transform ${terminalForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#18181b] scale-110' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setShowTerminalForm(false); setEditingTerminal(null); }} className="flex-1 btn-ghost border border-[#27272a]">Cancelar</button>
            <button type="submit" className="flex-1 btn-primary">Salvar</button>
          </div>
        </form>
      </Modal>

      {/* Sale Form Modal */}
      <Modal open={showSaleForm} onClose={() => setShowSaleForm(false)} title="Registrar Venda">
        <form onSubmit={saveSale} className="space-y-4">
          <div>
            <label className="label">Maquininha</label>
            <select className="input mt-1" value={saleForm.terminal_id} onChange={e => setSaleForm(f => ({ ...f, terminal_id: e.target.value }))} required>
              {terminals.map(t => <option key={t.id} value={t.id}>{t.name} ({t.acquirer})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Descrição (opcional)</label>
            <input className="input mt-1" value={saleForm.description} onChange={e => setSaleForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Venda balcão, Delivery..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor Bruto (R$)</label>
              <input type="number" step="0.01" className="input mt-1" value={saleForm.gross_amount} onChange={e => setSaleForm(f => ({ ...f, gross_amount: e.target.value }))} placeholder="0,00" required />
            </div>
            <div>
              <label className="label">Data da Venda</label>
              <input type="date" className="input mt-1" value={saleForm.sale_date} onChange={e => setSaleForm(f => ({ ...f, sale_date: e.target.value }))} required />
            </div>
          </div>
          <div>
            <label className="label">Tipo de Pagamento</label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setSaleForm(f => ({ ...f, payment_type: 'debit', fee_rate: '1.99', installments: '1' }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${saleForm.payment_type === 'debit' ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'}`}>
              Débito (D+1)
              </button>
              <button type="button" onClick={() => setSaleForm(f => ({ ...f, payment_type: 'credit', fee_rate: '3.99' }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${saleForm.payment_type === 'credit' ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30' : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'}`}>
              Crédito (D+30)
              </button>
            </div>
          </div>
          {saleForm.payment_type === 'credit' && (
            <div>
              <label className="label">Parcelas</label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {[1, 2, 3, 4, 6, 10, 12].map(n => (
                  <button key={n} type="button" onClick={() => setSaleForm(f => ({ ...f, installments: String(n) }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${saleForm.installments === String(n) ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30' : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'}`}>
                    {n}x
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="label">Taxa da Maquininha (%)</label>
            <input type="number" step="0.01" className="input mt-1" value={saleForm.fee_rate} onChange={e => setSaleForm(f => ({ ...f, fee_rate: e.target.value }))} placeholder="3.99" />
          </div>
          {saleForm.gross_amount && (
            <div className="p-3 rounded-xl bg-[#0a0a0b] border border-[#27272a] space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#71717a]">Valor bruto</span>
                <span className="text-white font-medium">{formatCurrency(parseFloat(saleForm.gross_amount) || 0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#71717a]">Taxa ({saleForm.fee_rate}%)</span>
                <span className="text-[#ef4444] font-medium">-{formatCurrency((parseFloat(saleForm.gross_amount) || 0) * (parseFloat(saleForm.fee_rate) || 0) / 100)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-[#27272a]">
                <span className="text-[#71717a]">Líquido a receber</span>
                <span className="text-[#3b82f6] font-bold">
                  {formatCurrency((parseFloat(saleForm.gross_amount) || 0) - (parseFloat(saleForm.gross_amount) || 0) * (parseFloat(saleForm.fee_rate) || 0) / 100)}
                </span>
              </div>
              <p className="text-xs text-[#71717a] pt-1">
                Recebimento previsto: {formatDate(computeSettlementDate(saleForm.payment_type, saleForm.sale_date, parseInt(saleForm.installments)))}
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowSaleForm(false)} className="flex-1 btn-ghost border border-[#27272a]">Cancelar</button>
            <button type="submit" className="flex-1 btn-primary">Registrar Venda</button>
          </div>
        </form>
      </Modal>

      {/* Batch Form Modal */}
      <Modal open={showBatchForm} onClose={() => setShowBatchForm(false)} title="Lançar Lote Diário">
        <form onSubmit={saveBatch} className="space-y-4">
          <div>
            <label className="label">Maquininha</label>
            <select className="input mt-1" value={batchForm.terminal_id} onChange={e => setBatchForm(f => ({ ...f, terminal_id: e.target.value }))} required>
              {terminals.map(t => <option key={t.id} value={t.id}>{t.name} ({t.acquirer})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Data</label>
            <input type="date" className="input mt-1" value={batchForm.sale_date} onChange={e => setBatchForm(f => ({ ...f, sale_date: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Total Débito (R$)</label>
              <input type="number" step="0.01" className="input mt-1" value={batchForm.debit_total} onChange={e => setBatchForm(f => ({ ...f, debit_total: e.target.value }))} placeholder="0,00" />
              <input type="number" step="0.01" className="input mt-1 mt-2" value={batchForm.debit_fee} onChange={e => setBatchForm(f => ({ ...f, debit_fee: e.target.value }))} placeholder="Taxa %" />
              <p className="text-xs text-[#71717a] mt-1">Taxa débito (%)</p>
            </div>
            <div>
              <label className="label">Total Crédito (R$)</label>
              <input type="number" step="0.01" className="input mt-1" value={batchForm.credit_total} onChange={e => setBatchForm(f => ({ ...f, credit_total: e.target.value }))} placeholder="0,00" />
              <input type="number" step="0.01" className="input mt-1 mt-2" value={batchForm.credit_fee} onChange={e => setBatchForm(f => ({ ...f, credit_fee: e.target.value }))} placeholder="Taxa %" />
              <p className="text-xs text-[#71717a] mt-1">Taxa crédito (%)</p>
            </div>
          </div>
          {(parseFloat(batchForm.debit_total) > 0 || parseFloat(batchForm.credit_total) > 0) && (
            <div className="p-3 rounded-xl bg-[#0a0a0b] border border-[#27272a] space-y-1">
              {parseFloat(batchForm.debit_total) > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-[#71717a]">Débito líquido (D+1)</span>
                  <span className="text-[#10b981] font-medium">
                    {formatCurrency((parseFloat(batchForm.debit_total) || 0) - (parseFloat(batchForm.debit_total) || 0) * (parseFloat(batchForm.debit_fee) || 0) / 100)}
                  </span>
                </div>
              )}
              {parseFloat(batchForm.credit_total) > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-[#71717a]">Crédito líquido (D+30)</span>
                  <span className="text-[#3b82f6] font-medium">
                    {formatCurrency((parseFloat(batchForm.credit_total) || 0) - (parseFloat(batchForm.credit_total) || 0) * (parseFloat(batchForm.credit_fee) || 0) / 100)}
                  </span>
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-[#71717a]">Use o lote diário quando a adquirente não estiver conectada via API. Será criada uma venda de débito e/ou crédito com as taxas informadas.</p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowBatchForm(false)} className="flex-1 btn-ghost border border-[#27272a]">Cancelar</button>
            <button type="submit" className="flex-1 btn-primary">Lançar Lote</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTerminalId}
        title="Excluir maquininha?"
        message="Todas as vendas vinculcidas serão removidas."
        onConfirm={deleteTerminal}
        onCancel={() => setDeleteTerminalId(null)}
      />
    </div>
  );
}
