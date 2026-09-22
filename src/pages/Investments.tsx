import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, type Investment } from '@/lib/supabase';
import { TrendingUp, Plus, Pencil, Trash2, Landmark, Coins, Building2, Bitcoin, PieChart, Layers, List } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState } from '@/components/Shared';

const invTypeLabels: Record<string, string> = {
  fixed_income: 'Renda Fixa',
  stocks: 'Ações',
  fiis: 'FIIs',
  crypto: 'Cripto',
  funds: 'Fundos',
  other: 'Outros',
};

const invIcons: Record<string, typeof Landmark> = {
  fixed_income: Landmark,
  stocks: Building2,
  fiis: Building2,
  crypto: Bitcoin,
  funds: PieChart,
  other: Coins,
};

type ViewMode = 'unified' | 'detailed';

export function Investments() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('unified');
  const [filterInstitution, setFilterInstitution] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [invForm, setInvForm] = useState({
    name: '', type: 'fixed_income', institution: '', quantity: '', avg_price: '', current_price: '', color: '#06b6d4',
  });

  const loadData = useCallback(async () => {
    const { data } = await supabase.from('investments').select('*').order('name');
    setInvestments(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (editing) {
      setInvForm({
        name: editing.name, type: editing.type, institution: editing.institution || '',
        quantity: String(editing.quantity), avg_price: String(editing.avg_price),
        current_price: String(editing.current_price), color: editing.color,
      });
    } else {
      setInvForm({ name: '', type: 'fixed_income', institution: '', quantity: '', avg_price: '', current_price: '', color: '#06b6d4' });
    }
  }, [editing]);

  async function saveInv(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(invForm.quantity) || 0;
    const avg = parseFloat(invForm.avg_price) || 0;
    const cur = parseFloat(invForm.current_price) || 0;
    const data = {
      name: invForm.name, type: invForm.type as Investment['type'], institution: invForm.institution || null,
      quantity: qty, avg_price: avg, current_price: cur,
      invested_amount: qty * avg, current_value: qty * cur, color: invForm.color,
    };
    if (editing) {
      await supabase.from('investments').update(data).eq('id', editing.id);
    } else {
      await supabase.from('investments').insert(data);
    }
    setShowForm(false);
    setEditing(null);
    loadData();
  }

  async function deleteInv() {
    if (!deleteId) return;
    await supabase.from('investment_transactions').delete().eq('investment_id', deleteId);
    await supabase.from('investments').delete().eq('id', deleteId);
    setDeleteId(null);
    loadData();
  }

  const colors = ['#06b6d4', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];
  const totalInvested = investments.reduce((s, i) => s + Number(i.invested_amount), 0);
  const totalCurrent = investments.reduce((s, i) => s + Number(i.current_value), 0);
  const totalReturn = totalCurrent - totalInvested;
  const returnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  const byType = investments.reduce((acc, inv) => {
    const type = inv.type;
    if (!acc[type]) acc[type] = { total: 0, count: 0 };
    acc[type].total += Number(inv.current_value);
    acc[type].count++;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  // Unique institutions and types for filters
  const institutions = Array.from(new Set(investments.map(i => i.institution).filter(Boolean))) as string[];
  const types = Array.from(new Set(investments.map(i => i.type)));

  // Filtered investments for detailed view
  const filteredInv = investments.filter(inv => {
    if (filterInstitution !== 'all' && inv.institution !== filterInstitution) return false;
    if (filterType !== 'all' && inv.type !== filterType) return false;
    return true;
  });

  // Summary for filtered
  const filteredInvested = filteredInv.reduce((s, i) => s + Number(i.invested_amount), 0);
  const filteredCurrent = filteredInv.reduce((s, i) => s + Number(i.current_value), 0);
  const filteredReturn = filteredCurrent - filteredInvested;
  const filteredReturnPct = filteredInvested > 0 ? (filteredReturn / filteredInvested) * 100 : 0;

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl skeleton" />)}</div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Investimentos</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> <span className="hidden sm:inline">Novo</span>
        </button>
      </div>

      {/* View toggle: Unificada vs Detalhada */}
      <div className="flex gap-2">
        <button
          onClick={() => { setViewMode('unified'); setFilterInstitution('all'); setFilterType('all'); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            viewMode === 'unified' ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#27272a] text-[#a1a1aa] border border-[#27272a]'
          }`}
        >
          <Layers size={16} /> Visão Unificada
        </button>
        <button
          onClick={() => setViewMode('detailed')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            viewMode === 'detailed' ? 'bg-[#06b6d4]/20 text-[#06b6d4] border border-[#06b6d4]/30' : 'bg-[#27272a] text-[#a1a1aa] border border-[#27272a]'
          }`}
        >
          <List size={16} /> Visão Detalhada
        </button>
      </div>

      {/* Unified view: consolidated patrimony + allocation */}
      {viewMode === 'unified' ? (
        <>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-[#06b6d4]" />
              <span className="label">Patrimônio Consolidado</span>
            </div>
            <p className="text-3xl font-bold text-white">{formatCurrency(totalCurrent)}</p>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#27272a]">
              <div>
                <p className="text-xs text-[#71717a]">Investido</p>
                <p className="text-sm font-semibold text-white">{formatCurrency(totalInvested)}</p>
              </div>
              <div className="w-px h-8 bg-[#27272a]" />
              <div>
                <p className="text-xs text-[#71717a]">Retorno</p>
                <p className={`text-sm font-semibold ${totalReturn >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  {totalReturn >= 0 ? '+' : ''}{formatCurrency(totalReturn)} ({returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%)
                </p>
              </div>
            </div>
          </div>

          {/* Allocation by type */}
          {Object.keys(byType).length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Distribuição de Ativos</h3>
              <div className="space-y-2">
                {Object.entries(byType).map(([type, info]) => {
                  const pct = totalCurrent > 0 ? (info.total / totalCurrent) * 100 : 0;
                  const color = investments.find(i => i.type === type)?.color || '#06b6d4';
                  return (
                    <div key={type}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#a1a1aa]">{invTypeLabels[type]} ({info.count})</span>
                        <span className="text-[#a1a1aa]">{formatCurrency(info.total)} • {pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-[#0a0a0b] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All investments list */}
          {investments.length === 0 ? (
            <EmptyState
              icon={<TrendingUp size={28} />}
              title="Nenhum investimento cadastrado"
              description="Cadastre sua carteira de investimentos para acompanhar rentabilidade e alocação."
              action={<button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2"><Plus size={18} /> Adicionar</button>}
            />
          ) : (
            <div className="space-y-2">
              {investments.map(inv => {
                const Icon = invIcons[inv.type] || Coins;
                const ret = Number(inv.current_value) - Number(inv.invested_amount);
                const retPct = Number(inv.invested_amount) > 0 ? (ret / Number(inv.invested_amount)) * 100 : 0;
                return (
                  <div key={inv.id} className="card p-4 card-hover">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${inv.color}20` }}>
                        <Icon size={18} style={{ color: inv.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{inv.name}</p>
                        <p className="text-xs text-[#71717a]">{invTypeLabels[inv.type]} {inv.institution && `• ${inv.institution}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-white">{formatCurrency(Number(inv.current_value))}</p>
                        <p className={`text-xs font-medium ${ret >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                          {ret >= 0 ? '+' : ''}{retPct.toFixed(2)}%
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(inv); setShowForm(true); }} className="p-1.5 hover:bg-[#27272a] rounded-lg">
                          <Pencil size={14} className="text-[#a1a1aa]" />
                        </button>
                        <button onClick={() => setDeleteId(inv.id)} className="p-1.5 hover:bg-[#ef4444]/10 rounded-lg">
                          <Trash2 size={14} className="text-[#ef4444]" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Detailed view: filter by institution and type */
        <>
          {/* Filters */}
          <div className="space-y-3">
            <div>
              <label className="label">Instituição / Corretora</label>
              <select className="input mt-1" value={filterInstitution} onChange={e => setFilterInstitution(e.target.value)}>
                <option value="all">Todas as instituições</option>
                {institutions.map(inst => <option key={inst} value={inst}>{inst}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo de Ativo</label>
              <div className="flex gap-2 overflow-x-auto no-scrollbar mt-1">
                <button
                  onClick={() => setFilterType('all')}
                  className={`chip whitespace-nowrap ${filterType === 'all' ? 'bg-[#06b6d4]/20 text-[#06b6d4] border border-[#06b6d4]/30' : 'bg-[#27272a] text-[#a1a1aa]'}`}
                >
                  Todos
                </button>
                {types.map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`chip whitespace-nowrap ${filterType === t ? 'bg-[#06b6d4]/20 text-[#06b6d4] border border-[#06b6d4]/30' : 'bg-[#27272a] text-[#a1a1aa]'}`}
                  >
                    {invTypeLabels[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filtered summary */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-[#06b6d4]" />
              <span className="label">Patrimônio Filtrado</span>
            </div>
            <p className="text-2xl font-bold text-white">{formatCurrency(filteredCurrent)}</p>
            <div className="flex items-center gap-4 mt-2 pt-2 border-t border-[#27272a]">
              <div>
                <p className="text-xs text-[#71717a]">Investido</p>
                <p className="text-sm font-semibold text-white">{formatCurrency(filteredInvested)}</p>
              </div>
              <div className="w-px h-8 bg-[#27272a]" />
              <div>
                <p className="text-xs text-[#71717a]">Retorno</p>
                <p className={`text-sm font-semibold ${filteredReturn >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  {filteredReturn >= 0 ? '+' : ''}{formatCurrency(filteredReturn)} ({filteredReturnPct >= 0 ? '+' : ''}{filteredReturnPct.toFixed(2)}%)
                </p>
              </div>
            </div>
          </div>

          {/* Filtered investment list */}
          {filteredInv.length === 0 ? (
            <EmptyState
              icon={<TrendingUp size={28} />}
              title="Nenhum ativo encontrado"
              description="Ajuste os filtros para ver seus investimentos."
            />
          ) : (
            <div className="space-y-2">
              {filteredInv.map(inv => {
                const Icon = invIcons[inv.type] || Coins;
                const ret = Number(inv.current_value) - Number(inv.invested_amount);
                const retPct = Number(inv.invested_amount) > 0 ? (ret / Number(inv.invested_amount)) * 100 : 0;
                return (
                  <div key={inv.id} className="card p-4 card-hover">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${inv.color}20` }}>
                        <Icon size={18} style={{ color: inv.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{inv.name}</p>
                        <p className="text-xs text-[#71717a]">{invTypeLabels[inv.type]} {inv.institution && `• ${inv.institution}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-white">{formatCurrency(Number(inv.current_value))}</p>
                        <p className={`text-xs font-medium ${ret >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                          {ret >= 0 ? '+' : ''}{retPct.toFixed(2)}%
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(inv); setShowForm(true); }} className="p-1.5 hover:bg-[#27272a] rounded-lg">
                          <Pencil size={14} className="text-[#a1a1aa]" />
                        </button>
                        <button onClick={() => setDeleteId(inv.id)} className="p-1.5 hover:bg-[#ef4444]/10 rounded-lg">
                          <Trash2 size={14} className="text-[#ef4444]" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Editar Investimento' : 'Novo Investimento'}>
        <form onSubmit={saveInv} className="space-y-4">
          <div>
            <label className="label">Nome</label>
            <input className="input mt-1" value={invForm.name} onChange={e => setInvForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Tesouro Selic 2029" autoFocus required />
          </div>
          <div>
            <label className="label">Classe</label>
            <select className="input mt-1" value={invForm.type} onChange={e => setInvForm(f => ({ ...f, type: e.target.value }))}>
              <option value="fixed_income">Renda Fixa</option>
              <option value="stocks">Ações</option>
              <option value="fiis">FIIs</option>
              <option value="crypto">Cripto</option>
              <option value="funds">Fundos</option>
              <option value="other">Outros</option>
            </select>
          </div>
          <div>
            <label className="label">Instituição</label>
            <input className="input mt-1" value={invForm.institution} onChange={e => setInvForm(f => ({ ...f, institution: e.target.value }))} placeholder="Ex: XP, BTG, Nubank..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantidade</label>
              <input type="number" step="0.0001" className="input mt-1" value={invForm.quantity} onChange={e => setInvForm(f => ({ ...f, quantity: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Preço Médio (R$)</label>
              <input type="number" step="0.01" className="input mt-1" value={invForm.avg_price} onChange={e => setInvForm(f => ({ ...f, avg_price: e.target.value }))} required />
            </div>
          </div>
          <div>
            <label className="label">Preço Atual (R$)</label>
            <input type="number" step="0.01" className="input mt-1" value={invForm.current_price} onChange={e => setInvForm(f => ({ ...f, current_price: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2 mt-1">
              {colors.map(c => (
                <button key={c} type="button" onClick={() => setInvForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-transform ${invForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#18181b] scale-110' : ''}`}
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

      <ConfirmDialog
        open={!!deleteId}
        title="Excluir investimento?"
        message="Todas as movimentações vinculadas serão removidas."
        onConfirm={deleteInv}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
