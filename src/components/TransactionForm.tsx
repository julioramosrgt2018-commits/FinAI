import { useState, useEffect } from 'react';
import { supabase, formatCurrency, type Category, type Account, type CreditCard, type Transaction } from '@/lib/supabase';
import { useProfile } from '@/lib/profile';
import { reverseAccountEffect, applyAccountEffect, recalcInvoiceAmount, isFutureDate } from '@/lib/transactionHelpers';
import { createRecurringSeries, deleteSingleOccurrence, deleteRecurringSeries } from '@/lib/recurrence';
import { Modal } from './Modal';
import { Repeat, AlertCircle, Layers } from 'lucide-react';

type TransactionFormProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingTransaction?: Transaction | null;
};

export function TransactionForm({ open, onClose, onSaved, editingTransaction }: TransactionFormProps) {
  const { profile } = useProfile();
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    category_id: '',
    account_id: '',
    card_id: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState({
    periodicity: 'monthly' as 'weekly' | 'monthly' | 'yearly',
    end_type: 'never' as 'never' | 'date' | 'count',
    end_date: '',
    max_occurrences: '12',
  });
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState('3');

  useEffect(() => {
    if (open) loadData();
    if (editingTransaction) {
      setForm({
        description: editingTransaction.description,
        amount: String(Math.abs(editingTransaction.amount)),
        type: editingTransaction.type,
        category_id: editingTransaction.category_id || '',
        account_id: editingTransaction.account_id || '',
        card_id: editingTransaction.card_id || '',
        date: editingTransaction.date,
        notes: editingTransaction.notes || '',
      });
    } else {
      setForm({
        description: '', amount: '', type: 'expense', category_id: '',
        account_id: '', card_id: '', date: new Date().toISOString().slice(0, 10), notes: '',
      });
      setIsRecurring(false);
      setIsInstallment(false);
      setInstallmentCount('3');
      setRecurrence({ periodicity: 'monthly', end_type: 'never', end_date: '', max_occurrences: '12' });
    }
  }, [open, editingTransaction]);

  async function loadData() {
    const [cats, accs, cds] = await Promise.all([
      supabase.from('categories').select('*').eq('profile', profile).order('name'),
      supabase.from('accounts').select('*').eq('profile', profile).order('name'),
      supabase.from('credit_cards').select('*').eq('profile', profile).order('name'),
    ]);
    setCategories(cats.data || []);
    setAccounts(accs.data || []);
    setCards(cds.data || []);
  }

  const filteredCategories = categories.filter(c => {
    if (form.type === 'transfer') return false;
    return form.type === 'income' ? c.type === 'income' : c.type === 'expense';
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    setSaving(true);
    const amount = parseFloat(form.amount);
    const signedAmount = form.type === 'expense' ? -Math.abs(amount) : Math.abs(amount);

    if (editingTransaction) {
      // REVERSE old effects: account balance + card invoice
      await reverseAccountEffect(editingTransaction.account_id, Number(editingTransaction.amount), editingTransaction.type, editingTransaction.date, editingTransaction.confirmed);

      // UPDATE the transaction
      const updateData = {
        description: form.description,
        amount: signedAmount,
        type: form.type,
        category_id: form.category_id || null,
        account_id: form.account_id || null,
        card_id: form.card_id || null,
        invoice_id: null,
        date: form.date,
        notes: form.notes || null,
        installments_total: 1,
        installment_number: 1,
        confirmed: !isFutureDate(form.date),
        profile,
      };
      await supabase.from('transactions').update(updateData).eq('id', editingTransaction.id);

      if (editingTransaction.invoice_id) {
        await recalcInvoiceAmount(editingTransaction.invoice_id);
      }

      await applyAccountEffect(form.account_id || null, amount, form.type, form.date);
    } else {
      if (isInstallment && form.type === 'expense' && form.account_id) {
        // Create installment transactions on checking account
        const numInstallments = parseInt(installmentCount) || 1;
        const installmentAmount = amount / numInstallments;
        const baseDate = new Date(form.date + 'T00:00:00');

        for (let i = 0; i < numInstallments; i++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
          const dateStr = d.toISOString().slice(0, 10);
          const desc = numInstallments > 1
            ? `${form.description} (${i + 1}/${numInstallments})`
            : form.description;
          const future = isFutureDate(dateStr);

          await supabase.from('transactions').insert({
            description: desc,
            amount: -Math.abs(installmentAmount),
            type: 'expense',
            category_id: form.category_id || null,
            account_id: form.account_id || null,
            card_id: null,
            date: dateStr,
            confirmed: !future,
            notes: form.notes || null,
            installments_total: numInstallments,
            installment_number: i + 1,
            profile,
          });

          // Only deduct from account balance if the installment date has arrived
          if (!future) {
            await applyAccountEffect(form.account_id, installmentAmount, 'expense', dateStr);
          }
        }
      } else if (isRecurring) {
        // Create recurring series instead of single transaction
        await createRecurringSeries({
          description: form.description,
          amount,
          type: form.type,
          category_id: form.category_id || null,
          account_id: form.account_id || null,
          card_id: form.card_id || null,
          periodicity: recurrence.periodicity,
          end_type: recurrence.end_type,
          end_date: recurrence.end_type === 'date' ? recurrence.end_date || null : null,
          max_occurrences: recurrence.end_type === 'count' ? parseInt(recurrence.max_occurrences) || null : null,
          start_date: form.date,
          profile,
        });
      } else {
        // INSERT single transaction
        const data = {
          description: form.description,
          amount: signedAmount,
          type: form.type,
          category_id: form.category_id || null,
          account_id: form.account_id || null,
          card_id: form.card_id || null,
          date: form.date,
          confirmed: !isFutureDate(form.date),
          notes: form.notes || null,
          installments_total: 1,
          installment_number: 1,
          profile,
        };
        await supabase.from('transactions').insert(data);
        await applyAccountEffect(form.account_id || null, amount, form.type, form.date);
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={editingTransaction ? 'Editar Lançamento' : 'Novo Lançamento'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          {(['expense', 'income', 'transfer'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setForm(f => ({ ...f, type: t, category_id: '' }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                form.type === t
                  ? t === 'expense' ? 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30'
                  : t === 'income' ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                  : 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30'
                  : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'
              }`}
            >
              {t === 'expense' ? 'Despesa' : t === 'income' ? 'Receita' : 'Transferência'}
            </button>
          ))}
        </div>

        <div>
          <label className="label">Descrição</label>
          <input
            className="input mt-1"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Ex: Supermercado, Salário..."
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              className="input mt-1"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="label">Data</label>
            <input
              type="date"
              className="input mt-1"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="label">Categoria</label>
          <select
            className="input mt-1"
            value={form.category_id}
            onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
          >
            <option value="">Sem categoria</option>
            {filteredCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Conta</label>
          <select
            className="input mt-1"
            value={form.account_id}
            onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}
          >
            <option value="">Nenhuma</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} — {a.institution}</option>
            ))}
          </select>
        </div>

        {form.type === 'expense' && (
          <div>
            <label className="label">Cartão de Crédito</label>
            <select
              className="input mt-1"
              value={form.card_id}
              onChange={e => setForm(f => ({ ...f, card_id: e.target.value }))}
            >
              <option value="">Nenhum</option>
              {cards.map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.institution}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Observações</label>
          <textarea
            className="input mt-1 resize-none"
            rows={2}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Opcional..."
          />
        </div>

        {/* Installment option for account-based expenses */}
        {!editingTransaction && form.type === 'expense' && form.account_id && !form.card_id && (
          <div className="rounded-xl border border-[#27272a] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsInstallment(!isInstallment)}
              className={`w-full flex items-center gap-3 p-3 transition-colors ${isInstallment ? 'bg-[#3b82f6]/10' : 'bg-[#0a0a0b]'}`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isInstallment ? 'bg-[#3b82f6]/20' : 'bg-[#27272a]'}`}>
                <Layers size={16} className={isInstallment ? 'text-[#3b82f6]' : 'text-[#71717a]'} />
              </div>
              <div className="text-left flex-1">
                <p className={`text-sm font-medium ${isInstallment ? 'text-[#3b82f6]' : 'text-white'}`}>Compra Parcelada sem Cartão</p>
                <p className="text-xs text-[#71717a]">Divide o valor em parcelas mensais na conta</p>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors ${isInstallment ? 'bg-[#3b82f6]' : 'bg-[#27272a]'} relative`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${isInstallment ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
            </button>

            {isInstallment && (
              <div className="p-3 space-y-3 bg-[#0a0a0b] border-t border-[#27272a]">
                <div>
                  <label className="label">Número de Parcelas</label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {[2, 3, 5, 6, 10, 12].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setInstallmentCount(String(n))}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${installmentCount === String(n) ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30' : 'bg-[#27272a] text-[#71717a] border border-[#27272a]'}`}
                      >
                        {n}x
                      </button>
                    ))}
                    <input
                      type="number"
                      min="2"
                      max="48"
                      className="input w-20"
                      value={installmentCount}
                      onChange={e => setInstallmentCount(e.target.value)}
                      placeholder="Outro"
                    />
                  </div>
                </div>

                {form.amount && (
                  <div className="p-3 rounded-lg bg-[#0a0a0b] border border-[#27272a] space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#71717a]">Valor total</span>
                      <span className="text-white font-medium">{formatCurrency(parseFloat(form.amount) || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#71717a]">Nº de parcelas</span>
                      <span className="text-white font-medium">{installmentCount}x</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#71717a]">Valor por parcela</span>
                      <span className="text-[#3b82f6] font-medium">
                        {formatCurrency((parseFloat(form.amount) || 0) / (parseInt(installmentCount) || 1))}
                      </span>
                    </div>
                    <p className="text-xs text-[#71717a] pt-1 border-t border-[#27272a]">
                      Cada parcela será lanada no mês correspondente, respeitando o fluxo de caixa.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Recurrence toggle - only for new transactions */}
        {!editingTransaction && form.type !== 'transfer' && (
          <div className="rounded-xl border border-[#27272a] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsRecurring(!isRecurring)}
              className={`w-full flex items-center gap-3 p-3 transition-colors ${isRecurring ? 'bg-[#8b5cf6]/10' : 'bg-[#0a0a0b]'}`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isRecurring ? 'bg-[#8b5cf6]/20' : 'bg-[#27272a]'}`}>
                <Repeat size={16} className={isRecurring ? 'text-[#8b5cf6]' : 'text-[#71717a]'} />
              </div>
              <div className="text-left flex-1">
                <p className={`text-sm font-medium ${isRecurring ? 'text-[#8b5cf6]' : 'text-white'}`}>Lançamento Recorrente (Gasto Fixo)</p>
                <p className="text-xs text-[#71717a]">Repete automaticamente nos meses seguintes</p>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors ${isRecurring ? 'bg-[#8b5cf6]' : 'bg-[#27272a]'} relative`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${isRecurring ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
            </button>

            {isRecurring && (
              <div className="p-3 space-y-3 bg-[#0a0a0b] border-t border-[#27272a]">
                <div>
                  <label className="label">Periodicidade</label>
                  <div className="flex gap-2 mt-1">
                    {(['weekly', 'monthly', 'yearly'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setRecurrence(r => ({ ...r, periodicity: p }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium ${recurrence.periodicity === p ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30' : 'bg-[#27272a] text-[#71717a] border border-[#27272a]'}`}
                      >
                        {p === 'weekly' ? 'Semanal' : p === 'monthly' ? 'Mensal' : 'Anual'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">Término</label>
                  <div className="flex gap-2 mt-1">
                    {([
                      { v: 'never', l: 'Sem término' },
                      { v: 'count', l: 'Nº de vezes' },
                      { v: 'date', l: 'Data limite' },
                    ] as const).map(o => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setRecurrence(r => ({ ...r, end_type: o.v }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium ${recurrence.end_type === o.v ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30' : 'bg-[#27272a] text-[#71717a] border border-[#27272a]'}`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                {recurrence.end_type === 'count' && (
                  <div>
                    <label className="label">Número de Repetições</label>
                    <input
                      type="number"
                      min="1"
                      className="input mt-1"
                      value={recurrence.max_occurrences}
                      onChange={e => setRecurrence(r => ({ ...r, max_occurrences: e.target.value }))}
                    />
                  </div>
                )}

                {recurrence.end_type === 'date' && (
                  <div>
                    <label className="label">Data Limite</label>
                    <input
                      type="date"
                      className="input mt-1"
                      value={recurrence.end_date}
                      onChange={e => setRecurrence(r => ({ ...r, end_date: e.target.value }))}
                    />
                  </div>
                )}

                {isRecurring && form.card_id && (
                  <div className="flex items-center gap-2 text-xs text-[#f59e0b] bg-[#f59e0b]/10 rounded-lg p-2">
                    <AlertCircle size={12} />
                    <span>Cada ocorrência será vinculada à fatura do mês correspondente.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 btn-ghost border border-[#27272a]">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 btn-primary disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
