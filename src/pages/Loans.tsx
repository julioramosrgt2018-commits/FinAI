import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, formatDate, type Loan, type LoanInstallment } from '@/lib/supabase';
import { Landmark, Plus, Pencil, Trash2, TrendingDown, CheckCircle2, Clock, Percent, Calendar, Layers, List } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState } from '@/components/Shared';

const loanTypeLabels: Record<string, string> = {
  loan: 'Empréstimo Pessoal',
  financing: 'Financiamento',
  financing_vehicle: 'Financiamento de Veículo',
  financing_real_estate: 'Financiamento Imobiliário',
};

type ViewMode = 'unified' | 'detailed';

export function Loans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [installments, setInstallments] = useState<LoanInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('unified');
  const [filterInstitution, setFilterInstitution] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<string | null>(null);
  const [loanForm, setLoanForm] = useState({
    name: '', institution: '', type: 'loan', total_amount: '', interest_rate: '',
    installments_total: '', installment_amount: '', due_day: '10', start_date: new Date().toISOString().slice(0, 10), color: '#8b5cf6',
  });

  const loadData = useCallback(async () => {
    const [lns, insts] = await Promise.all([
      supabase.from('loans').select('*').order('name'),
      supabase.from('loan_installments').select('*').order('number'),
    ]);
    setLoans(lns.data || []);
    setInstallments(insts.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (editing) {
      setLoanForm({
        name: editing.name, institution: editing.institution, type: editing.type,
        total_amount: String(editing.total_amount), interest_rate: String(editing.interest_rate),
        installments_total: String(editing.installments_total), installment_amount: String(editing.installment_amount),
        due_day: String(editing.due_day), start_date: editing.start_date, color: editing.color,
      });
    } else {
      setLoanForm({ name: '', institution: '', type: 'loan', total_amount: '', interest_rate: '', installments_total: '', installment_amount: '', due_day: '10', start_date: new Date().toISOString().slice(0, 10), color: '#8b5cf6' });
    }
  }, [editing]);

  async function saveLoan(e: React.FormEvent) {
    e.preventDefault();
    const total = parseFloat(loanForm.total_amount) || 0;
    const instTotal = parseInt(loanForm.installments_total) || 1;
    const instAmount = parseFloat(loanForm.installment_amount) || 0;
    const data = {
      name: loanForm.name, institution: loanForm.institution, type: loanForm.type,
      total_amount: total, interest_rate: parseFloat(loanForm.interest_rate) || 0,
      installments_total: instTotal, installment_amount: instAmount,
      due_day: parseInt(loanForm.due_day), start_date: loanForm.start_date,
      remaining_balance: editing ? editing.remaining_balance : total,
      installments_paid: editing ? editing.installments_paid : 0,
      color: loanForm.color,
    };
    if (editing) {
      await supabase.from('loans').update(data).eq('id', editing.id);
    } else {
      const { data: created } = await supabase.from('loans').insert(data).select().single();
      if (created) {
        const insts = Array.from({ length: instTotal }, (_, i) => {
          const dueDate = new Date(loanForm.start_date);
          dueDate.setMonth(dueDate.getMonth() + i);
          dueDate.setDate(parseInt(loanForm.due_day));
          return { loan_id: created.id, number: i + 1, amount: instAmount, due_date: dueDate.toISOString().slice(0, 10), paid: false };
        });
        await supabase.from('loan_installments').insert(insts);
      }
    }
    setShowForm(false);
    setEditing(null);
    loadData();
  }

  async function deleteLoan() {
    if (!deleteId) return;
    await supabase.from('loan_installments').delete().eq('loan_id', deleteId);
    await supabase.from('loans').delete().eq('id', deleteId);
    setDeleteId(null);
    loadData();
  }

  async function payInstallment(inst: LoanInstallment) {
    await supabase.from('loan_installments').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', inst.id);
    const loan = loans.find(l => l.id === inst.loan_id);
    if (loan) {
      const newPaid = loan.installments_paid + 1;
      const newBalance = Math.max(0, Number(loan.remaining_balance) - Number(inst.amount));
      await supabase.from('loans').update({ installments_paid: newPaid, remaining_balance: newBalance }).eq('id', loan.id);
    }
    loadData();
  }

  const colors = ['#8b5cf6', '#ef4444', '#f59e0b', '#3b82f6', '#06b6d4', '#ec4899', '#10b981'];
  const totalDebt = loans.reduce((s, l) => s + Number(l.remaining_balance), 0);
  const totalMonthly = loans.reduce((s, l) => s + Number(l.installment_amount), 0);

  // Unique institutions for filter
  const institutions = Array.from(new Set(loans.map(l => l.institution))).sort();

  // Filtered loans for detailed view
  const filteredLoans = filterInstitution === 'all' ? loans : loans.filter(l => l.institution === filterInstitution);

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl skeleton" />)}</div>;

  const displayLoan = selectedLoan ? loans.find(l => l.id === selectedLoan) : null;
  const displayInsts = displayLoan ? installments.filter(i => i.loan_id === displayLoan.id) : [];

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Empréstimos & Financiamentos</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> <span className="hidden sm:inline">Novo</span>
        </button>
      </div>

      {/* View toggle: Unificada vs Detalhada */}
      <div className="flex gap-2">
        <button
          onClick={() => { setViewMode('unified'); setSelectedLoan(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            viewMode === 'unified' ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#27272a] text-[#a1a1aa] border border-[#27272a]'
          }`}
        >
          <Layers size={16} /> Visão Unificada
        </button>
        <button
          onClick={() => setViewMode('detailed')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            viewMode === 'detailed' ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30' : 'bg-[#27272a] text-[#a1a1aa] border border-[#27272a]'
          }`}
        >
          <List size={16} /> Visão Detalhada
        </button>
      </div>

      {/* Unified summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={14} className="text-[#8b5cf6]" />
            <span className="text-xs text-[#71717a]">Saldo Devedor Total</span>
          </div>
          <p className="text-xl font-bold text-white">{formatCurrency(totalDebt)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-[#f59e0b]" />
            <span className="text-xs text-[#71717a]">Parcela Mensal Total</span>
          </div>
          <p className="text-xl font-bold text-white">{formatCurrency(totalMonthly)}</p>
        </div>
      </div>

      {loans.length === 0 ? (
        <EmptyState
          icon={<Landmark size={28} />}
          title="Nenhuma dívida cadastrada"
          description="Cadastre seus empréstimos e financiamentos para acompanhar parcelas e saldo devedor."
          action={<button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2"><Plus size={18} /> Adicionar</button>}
        />
      ) : viewMode === 'detailed' && !displayLoan ? (
        <div className="space-y-4">
          {/* Institution filter */}
          <select className="input" value={filterInstitution} onChange={e => setFilterInstitution(e.target.value)}>
            <option value="all">Todas as instituições</option>
            {institutions.map(inst => <option key={inst} value={inst}>{inst}</option>)}
          </select>

          {/* Per-contract cards with full details */}
          <div className="space-y-3">
            {filteredLoans.map(loan => {
              const paidPct = loan.installments_total > 0 ? (loan.installments_paid / loan.installments_total) * 100 : 0;
              const remaining = loan.installments_total - loan.installments_paid;
              return (
                <div key={loan.id} className="card p-4 card-hover" onClick={() => setSelectedLoan(loan.id)}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${loan.color}20` }}>
                      <Landmark size={20} style={{ color: loan.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{loan.name}</p>
                      <p className="text-xs text-[#71717a]">{loanTypeLabels[loan.type]} • {loan.institution}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setEditing(loan); setShowForm(true); }} className="p-2 hover:bg-[#27272a] rounded-lg">
                        <Pencil size={14} className="text-[#a1a1aa]" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteId(loan.id); }} className="p-2 hover:bg-[#ef4444]/10 rounded-lg">
                        <Trash2 size={14} className="text-[#ef4444]" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-[#0a0a0b]/50 rounded-lg p-2">
                      <p className="text-xs text-[#71717a]">Parcelas Pagas</p>
                      <p className="text-sm font-bold text-[#10b981]">{loan.installments_paid} de {loan.installments_total}</p>
                    </div>
                    <div className="bg-[#0a0a0b]/50 rounded-lg p-2">
                      <p className="text-xs text-[#71717a]">Parcelas Restantes</p>
                      <p className="text-sm font-bold text-[#f59e0b]">{remaining}x</p>
                    </div>
                    <div className="bg-[#0a0a0b]/50 rounded-lg p-2">
                      <p className="text-xs text-[#71717a]">Taxa de Juros</p>
                      <p className="text-sm font-bold text-white flex items-center gap-1"><Percent size={12} />{Number(loan.interest_rate).toFixed(2)}% a.m.</p>
                    </div>
                    <div className="bg-[#0a0a0b]/50 rounded-lg p-2">
                      <p className="text-xs text-[#71717a]">Saldo Devedor</p>
                      <p className="text-sm font-bold text-[#ef4444]">{formatCurrency(Number(loan.remaining_balance))}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#71717a]">{loan.installments_paid} de {loan.installments_total} parcelas</span>
                      <span className="text-[#71717a]">{paidPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-[#0a0a0b] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${paidPct}%`, background: loan.color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === 'unified' ? (
        <div className="space-y-3">
          {loans.map(loan => {
            const paidPct = loan.installments_total > 0 ? (loan.installments_paid / loan.installments_total) * 100 : 0;
            const remaining = loan.installments_total - loan.installments_paid;
            return (
              <div key={loan.id} className="card p-4 card-hover" onClick={() => { setViewMode('detailed'); setSelectedLoan(loan.id); }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${loan.color}20` }}>
                    <Landmark size={20} style={{ color: loan.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{loan.name}</p>
                    <p className="text-xs text-[#71717a]">{loanTypeLabels[loan.type]} • {loan.institution}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setEditing(loan); setShowForm(true); }} className="p-2 hover:bg-[#27272a] rounded-lg">
                      <Pencil size={14} className="text-[#a1a1aa]" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteId(loan.id); }} className="p-2 hover:bg-[#ef4444]/10 rounded-lg">
                      <Trash2 size={14} className="text-[#ef4444]" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <p className="text-xs text-[#71717a]">Saldo Devedor</p>
                    <p className="text-sm font-bold text-white">{formatCurrency(Number(loan.remaining_balance))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#71717a]">Parcela</p>
                    <p className="text-sm font-bold text-white">{formatCurrency(Number(loan.installment_amount))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#71717a]">Restam</p>
                    <p className="text-sm font-bold text-white">{remaining}x</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#71717a]">{loan.installments_paid} de {loan.installments_total} parcelas</span>
                    <span className="text-[#71717a]">{paidPct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-[#0a0a0b] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${paidPct}%`, background: loan.color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : displayLoan ? (
        <div className="space-y-4">
          <button onClick={() => setSelectedLoan(null)} className="text-sm text-[#a1a1aa] hover:text-white">← Voltar</button>

          <div className="card p-5" style={{ background: `linear-gradient(135deg, ${displayLoan.color}15, transparent)` }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${displayLoan.color}30` }}>
                <Landmark size={22} style={{ color: displayLoan.color }} />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{displayLoan.name}</p>
                <p className="text-xs text-[#71717a]">{loanTypeLabels[displayLoan.type]} • {displayLoan.institution}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0a0a0b]/50 rounded-xl p-3">
                <p className="text-xs text-[#71717a] mb-0.5">Valor Total</p>
                <p className="text-base font-bold text-white">{formatCurrency(Number(displayLoan.total_amount))}</p>
              </div>
              <div className="bg-[#0a0a0b]/50 rounded-xl p-3">
                <p className="text-xs text-[#71717a] mb-0.5">Taxa de Juros</p>
                <p className="text-base font-bold text-white flex items-center gap-1"><Percent size={14} />{Number(displayLoan.interest_rate).toFixed(2)}% a.m.</p>
              </div>
              <div className="bg-[#0a0a0b]/50 rounded-xl p-3">
                <p className="text-xs text-[#71717a] mb-0.5">Saldo Devedor</p>
                <p className="text-base font-bold text-[#ef4444]">{formatCurrency(Number(displayLoan.remaining_balance))}</p>
              </div>
              <div className="bg-[#0a0a0b]/50 rounded-xl p-3">
                <p className="text-xs text-[#71717a] mb-0.5">Parcela</p>
                <p className="text-base font-bold text-white">{formatCurrency(Number(displayLoan.installment_amount))}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Parcelas</h3>
            <div className="space-y-2">
              {displayInsts.map(inst => {
                const isPaid = inst.paid;
                const isOverdue = !isPaid && new Date(inst.due_date) < new Date();
                return (
                  <div key={inst.id} className={`card p-3 flex items-center gap-3 ${isPaid ? 'opacity-60' : ''}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isPaid ? 'bg-[#10b981]/15' : isOverdue ? 'bg-[#ef4444]/15' : 'bg-[#27272a]'}`}>
                      {isPaid ? <CheckCircle2 size={18} className="text-[#10b981]" /> : <Clock size={18} className={isOverdue ? 'text-[#ef4444]' : 'text-[#a1a1aa]'} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">Parcela {inst.number}/{displayLoan.installments_total}</p>
                      <p className="text-xs text-[#71717a]">Venc: {formatDate(inst.due_date)} {isOverdue && '• Vencida'}</p>
                    </div>
                    <p className="text-sm font-semibold text-white">{formatCurrency(Number(inst.amount))}</p>
                    {!isPaid && (
                      <button onClick={() => payInstallment(inst)} className="btn-primary text-xs px-3 py-1.5">Pagar</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Loan Form */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Editar Empréstimo' : 'Novo Empréstimo'}>
        <form onSubmit={saveLoan} className="space-y-4">
          <div>
            <label className="label">Nome / Contrato</label>
            <input className="input mt-1" value={loanForm.name} onChange={e => setLoanForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Financiamento do Carro" autoFocus required />
          </div>
          <div>
            <label className="label">Instituição</label>
            <input className="input mt-1" value={loanForm.institution} onChange={e => setLoanForm(f => ({ ...f, institution: e.target.value }))} placeholder="Ex: Itaú" required />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input mt-1" value={loanForm.type} onChange={e => setLoanForm(f => ({ ...f, type: e.target.value }))}>
              <option value="loan">Empréstimo Pessoal</option>
              <option value="financing">Financiamento</option>
              <option value="financing_vehicle">Financiamento de Veículo</option>
              <option value="financing_real_estate">Financiamento Imobiliário</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor Total (R$)</label>
              <input type="number" step="0.01" className="input mt-1" value={loanForm.total_amount} onChange={e => setLoanForm(f => ({ ...f, total_amount: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Taxa Juros (% a.m.)</label>
              <input type="number" step="0.01" className="input mt-1" value={loanForm.interest_rate} onChange={e => setLoanForm(f => ({ ...f, interest_rate: e.target.value }))} placeholder="1.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Qtd. Parcelas</label>
              <input type="number" min="1" className="input mt-1" value={loanForm.installments_total} onChange={e => setLoanForm(f => ({ ...f, installments_total: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Valor da Parcela (R$)</label>
              <input type="number" step="0.01" className="input mt-1" value={loanForm.installment_amount} onChange={e => setLoanForm(f => ({ ...f, installment_amount: e.target.value }))} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dia de Vencimento</label>
              <input type="number" min="1" max="31" className="input mt-1" value={loanForm.due_day} onChange={e => setLoanForm(f => ({ ...f, due_day: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Data de Início</label>
              <input type="date" className="input mt-1" value={loanForm.start_date} onChange={e => setLoanForm(f => ({ ...f, start_date: e.target.value }))} required />
            </div>
          </div>
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2 mt-1">
              {colors.map(c => (
                <button key={c} type="button" onClick={() => setLoanForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-transform ${loanForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#18181b] scale-110' : ''}`}
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
        title="Excluir empréstimo?"
        message="Todas as parcelas vinculadas serão removidas."
        onConfirm={deleteLoan}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
