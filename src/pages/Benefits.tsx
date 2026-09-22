import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, formatDate, type Benefit, type BenefitTransaction } from '@/lib/supabase';
import { Wallet, Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, UtensilsCrossed, Fuel, Gift, ShoppingBasket } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState } from '@/components/Shared';

const benefitTypeLabels: Record<string, string> = {
  food: 'Vale Alimentação',
  meal: 'Vale Refeição',
  fuel: 'Vale Combustível',
  other: 'Outros',
};

const benefitIcons: Record<string, typeof UtensilsCrossed> = {
  food: ShoppingBasket,
  meal: UtensilsCrossed,
  fuel: Fuel,
  other: Gift,
};

type BenefitTab = 'food' | 'meal' | 'fuel' | 'other';

const tabConfig: { key: BenefitTab; label: string; color: string }[] = [
  { key: 'food', label: 'Vale Alimentação', color: '#f59e0b' },
  { key: 'meal', label: 'Vale Refeição', color: '#10b981' },
  { key: 'fuel', label: 'Combustível', color: '#3b82f6' },
  { key: 'other', label: 'Outros', color: '#8b5cf6' },
];

export function Benefits() {
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [transactions, setTransactions] = useState<BenefitTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<BenefitTab>('food');
  const [showForm, setShowForm] = useState(false);
  const [showTxnForm, setShowTxnForm] = useState(false);
  const [editing, setEditing] = useState<Benefit | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedBenefit, setSelectedBenefit] = useState<string | null>(null);
  const [txnForm, setTxnForm] = useState({ description: '', amount: '', type: 'debit' as 'credit' | 'debit', date: new Date().toISOString().slice(0, 10) });
  const [benefitForm, setBenefitForm] = useState({ name: '', provider: 'Manual', type: 'food', balance: '', card_number: '', color: '#f59e0b' });

  const loadData = useCallback(async () => {
    const [bens, txns] = await Promise.all([
      supabase.from('benefits').select('*').order('name'),
      supabase.from('benefit_transactions').select('*').order('date', { ascending: false }),
    ]);
    setBenefits(bens.data || []);
    setTransactions(txns.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (editing) {
      setBenefitForm({ name: editing.name, provider: editing.provider, type: editing.type, balance: String(editing.balance), card_number: editing.card_number || '', color: editing.color });
    } else {
      const tc = tabConfig.find(t => t.key === activeTab)!;
      setBenefitForm({ name: '', provider: 'Manual', type: activeTab, balance: '', card_number: '', color: tc.color });
    }
  }, [editing, activeTab]);

  async function saveBenefit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: benefitForm.name, provider: benefitForm.provider, type: benefitForm.type as Benefit['type'],
      balance: parseFloat(benefitForm.balance) || 0, card_number: benefitForm.card_number || null, color: benefitForm.color,
    };
    if (editing) {
      await supabase.from('benefits').update(data).eq('id', editing.id);
    } else {
      await supabase.from('benefits').insert(data);
    }
    setShowForm(false);
    setEditing(null);
    loadData();
  }

  async function deleteBenefit() {
    if (!deleteId) return;
    await supabase.from('benefit_transactions').delete().eq('benefit_id', deleteId);
    await supabase.from('benefits').delete().eq('id', deleteId);
    setDeleteId(null);
    loadData();
  }

  async function saveTxn(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBenefit) return;
    const amount = parseFloat(txnForm.amount);
    const signedAmount = txnForm.type === 'debit' ? -Math.abs(amount) : Math.abs(amount);
    await supabase.from('benefit_transactions').insert({
      benefit_id: selectedBenefit, description: txnForm.description, amount: signedAmount, type: txnForm.type, date: txnForm.date,
    });
    const benefit = benefits.find(b => b.id === selectedBenefit);
    if (benefit) {
      const newBalance = Number(benefit.balance) + signedAmount;
      await supabase.from('benefits').update({ balance: newBalance }).eq('id', selectedBenefit);
    }
    setShowTxnForm(false);
    setTxnForm({ description: '', amount: '', type: 'debit', date: new Date().toISOString().slice(0, 10) });
    loadData();
  }

  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

  const tabBenefits = benefits.filter(b => b.type === activeTab);
  const tabBalance = tabBenefits.reduce((s, b) => s + Number(b.balance), 0);
  const tabEntry = tabConfig.find(t => t.key === activeTab)!;

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl skeleton" />)}</div>;

  const displayBenefit = selectedBenefit ? benefits.find(b => b.id === selectedBenefit) : null;
  const displayTxns = displayBenefit ? transactions.filter(t => t.benefit_id === displayBenefit.id) : [];

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Benefícios (VA / VR)</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> <span className="hidden sm:inline">Novo</span>
        </button>
      </div>

      {/* Tab selector separating VA, VR, Fuel, Other */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {tabConfig.map(tab => {
          const count = benefits.filter(b => b.type === tab.key).length;
          const tabTotal = benefits.filter(b => b.type === tab.key).reduce((s, b) => s + Number(b.balance), 0);
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedBenefit(null); }}
              className="chip whitespace-nowrap border"
              style={activeTab === tab.key
                ? { background: `${tab.color}20`, color: tab.color, borderColor: `${tab.color}30` }
                : { background: '#27272a', color: '#a1a1aa', borderColor: '#27272a' }}
            >
              {tab.label} {count > 0 && `• ${formatCurrency(tabTotal)}`}
            </button>
          );
        })}
      </div>

      {/* Balance card for active tab */}
      <div className="card p-5" style={{ background: `linear-gradient(135deg, ${tabEntry.color}15, transparent)` }}>
        <div className="flex items-center gap-2 mb-1">
          <Wallet size={16} style={{ color: tabEntry.color }} />
          <span className="label">Saldo Total — {tabEntry.label}</span>
        </div>
        <p className="text-3xl font-bold text-white">{formatCurrency(tabBalance)}</p>
        <p className="text-xs text-[#71717a] mt-1">{tabBenefits.length} {tabBenefits.length === 1 ? 'cartão cadastrado' : 'cartões cadastrados'}</p>
      </div>

      {/* Content for active tab */}
      {tabBenefits.length === 0 ? (
        <EmptyState
          icon={<Wallet size={28} />}
          title={`Nenhum ${tabEntry.label} cadastrado`}
          description="Cadastre seu cartão de benefício para acompanhar saldo e extrato."
          action={<button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2"><Plus size={18} /> Adicionar</button>}
        />
      ) : !displayBenefit ? (
        <div className="space-y-3">
          {tabBenefits.map(b => {
            const Icon = benefitIcons[b.type] || Gift;
            const bTxns = transactions.filter(t => t.benefit_id === b.id);
            return (
              <div key={b.id} className="card p-4 card-hover" onClick={() => setSelectedBenefit(b.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${b.color}20` }}>
                    <Icon size={20} style={{ color: b.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{b.name}</p>
                    <p className="text-xs text-[#71717a]">{benefitTypeLabels[b.type]} • {b.provider}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-white">{formatCurrency(Number(b.balance))}</p>
                    <p className="text-xs text-[#71717a]">{bTxns.length} movimentações</p>
                  </div>
                </div>
                <div className="flex gap-1 mt-2">
                  <button onClick={(e) => { e.stopPropagation(); setEditing(b); setShowForm(true); }} className="btn-ghost text-xs flex items-center gap-1"><Pencil size={12} /> Editar</button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteId(b.id); }} className="btn-danger text-xs flex items-center gap-1"><Trash2 size={12} /> Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setSelectedBenefit(null)} className="text-sm text-[#a1a1aa] hover:text-white">← Voltar</button>
          <div className="card p-5" style={{ background: `linear-gradient(135deg, ${displayBenefit.color}15, transparent)` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-white">{displayBenefit.name}</p>
                <p className="text-xs text-[#71717a]">{benefitTypeLabels[displayBenefit.type]} • {displayBenefit.provider}</p>
              </div>
              <p className="text-2xl font-bold text-white">{formatCurrency(Number(displayBenefit.balance))}</p>
            </div>
          </div>
          <button onClick={() => setShowTxnForm(true)} className="w-full btn-primary flex items-center justify-center gap-2">
            <Plus size={18} /> Registrar Movimentação
          </button>
          <div className="card divide-y divide-[#27272a]">
            {displayTxns.length === 0 ? (
              <p className="p-6 text-center text-sm text-[#71717a]">Nenhuma movimentação registrada.</p>
            ) : displayTxns.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${t.type === 'credit' ? 'bg-[#10b981]/15' : 'bg-[#ef4444]/15'}`}>
                  {t.type === 'credit' ? <ArrowUpRight size={15} className="text-[#10b981]" /> : <ArrowDownRight size={15} className="text-[#ef4444]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.description}</p>
                  <p className="text-xs text-[#71717a]">{formatDate(t.date)}</p>
                </div>
                <p className={`text-sm font-semibold ${t.type === 'credit' ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  {t.type === 'credit' ? '+' : '-'}{formatCurrency(Math.abs(Number(t.amount)))}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Benefit Form */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Editar Benefício' : 'Novo Benefício'}>
        <form onSubmit={saveBenefit} className="space-y-4">
          <div>
            <label className="label">Nome</label>
            <input className="input mt-1" value={benefitForm.name} onChange={e => setBenefitForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Alelo Alimentação" autoFocus required />
          </div>
          <div>
            <label className="label">Provedor</label>
            <select className="input mt-1" value={benefitForm.provider} onChange={e => setBenefitForm(f => ({ ...f, provider: e.target.value }))}>
              <option value="Manual">Manual</option>
              <option value="Alelo">Alelo</option>
              <option value="Sodexo">Sodexo</option>
              <option value="Swile">Swile</option>
              <option value="Caixa Pré-Pagos">Caixa Pré-Pagos</option>
              <option value="Ticket">Ticket</option>
              <option value="VR">VR</option>
            </select>
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input mt-1" value={benefitForm.type} onChange={e => setBenefitForm(f => ({ ...f, type: e.target.value }))}>
              <option value="food">Vale Alimentação</option>
              <option value="meal">Vale Refeição</option>
              <option value="fuel">Vale Combustível</option>
              <option value="other">Outros</option>
            </select>
          </div>
          <div>
            <label className="label">Saldo Atual (R$)</label>
            <input type="number" step="0.01" className="input mt-1" value={benefitForm.balance} onChange={e => setBenefitForm(f => ({ ...f, balance: e.target.value }))} placeholder="0,00" />
          </div>
          <div>
            <label className="label">Número do Cartão (opcional)</label>
            <input className="input mt-1" value={benefitForm.card_number} onChange={e => setBenefitForm(f => ({ ...f, card_number: e.target.value }))} placeholder="**** ****" />
          </div>
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2 mt-1">
              {colors.map(c => (
                <button key={c} type="button" onClick={() => setBenefitForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-transform ${benefitForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#18181b] scale-110' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 btn-ghost border border-[#27272a]">Cancelar</button>
            <button type="submit" className="flex-1 btn-primary">Salvar</button>
          </div>
        </form>
      </Modal>

      {/* Transaction Form */}
      <Modal open={showTxnForm} onClose={() => setShowTxnForm(false)} title="Registrar Movimentação" size="sm">
        <form onSubmit={saveTxn} className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setTxnForm(f => ({ ...f, type: 'debit' }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${txnForm.type === 'debit' ? 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30' : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'}`}>
              Gasto
            </button>
            <button type="button" onClick={() => setTxnForm(f => ({ ...f, type: 'credit' }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${txnForm.type === 'credit' ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'}`}>
              Recarga
            </button>
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input mt-1" value={txnForm.description} onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Almoço, Recarga mensal..." autoFocus required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$)</label>
              <input type="number" step="0.01" className="input mt-1" value={txnForm.amount} onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" required />
            </div>
            <div>
              <label className="label">Data</label>
              <input type="date" className="input mt-1" value={txnForm.date} onChange={e => setTxnForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <button type="submit" className="w-full btn-primary">Salvar</button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Excluir benefício?"
        message="Todas as movimentações vinculadas serão removidas."
        onConfirm={deleteBenefit}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
