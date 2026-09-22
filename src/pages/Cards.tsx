import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, formatDate, type CreditCard, type CardInvoice, type Transaction } from '@/lib/supabase';
import { CreditCard as CardIcon, Plus, Pencil, Trash2, Calendar, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState } from '@/components/Shared';

export function Cards() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [invoices, setInvoices] = useState<CardInvoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<'open' | 'future' | 'closed'>('open');

  const loadData = useCallback(async () => {
    const [cds, invs, txns] = await Promise.all([
      supabase.from('credit_cards').select('*').order('name'),
      supabase.from('card_invoices').select('*').order('due_date'),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
    ]);
    setCards(cds.data || []);
    setInvoices(invs.data || []);
    setTransactions(txns.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const [cardForm, setCardForm] = useState({
    name: '', institution: '', limit_total: '', closing_day: '1', due_day: '10', color: '#ef4444',
  });

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

  async function saveCard(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: cardForm.name, institution: cardForm.institution,
      limit_total: parseFloat(cardForm.limit_total) || 0,
      closing_day: parseInt(cardForm.closing_day), due_day: parseInt(cardForm.due_day),
      color: cardForm.color,
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

  async function payInvoice(inv: CardInvoice) {
    await supabase.from('card_invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', inv.id);
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

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Cartões de Crédito</h1>
        <button onClick={() => { setEditingCard(null); setShowCardForm(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> <span className="hidden sm:inline">Novo Cartão</span>
        </button>
      </div>

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

          <div className="card p-5" style={{ background: `linear-gradient(135deg, ${displayCard.color}15, transparent)` }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${displayCard.color}30` }}>
                <CardIcon size={22} style={{ color: displayCard.color }} />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{displayCard.name}</p>
                <p className="text-xs text-[#71717a]">{displayCard.institution}</p>
              </div>
            </div>
          </div>

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
                        {invTxns.slice(0, 5).map(t => (
                          <div key={t.id} className="flex justify-between text-xs">
                            <span className="text-[#a1a1aa]">{t.description}</span>
                            <span className="text-[#ef4444]">{formatCurrency(Math.abs(Number(t.amount)))}</span>
                          </div>
                        ))}
                        {invTxns.length > 5 && <p className="text-xs text-[#71717a]">+{invTxns.length - 5} lançamentos</p>}
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

      <ConfirmDialog
        open={!!deleteCardId}
        title="Excluir cartão?"
        message="Todas as faturas e lançamentos vinculados serão removidos."
        onConfirm={deleteCard}
        onCancel={() => setDeleteCardId(null)}
      />
    </div>
  );
}
