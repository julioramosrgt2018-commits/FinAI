import { useState, useEffect } from 'react';
import { supabase, type Category, type Account, type CreditCard, type Transaction } from '@/lib/supabase';
import { Modal } from './Modal';

type TransactionFormProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingTransaction?: Transaction | null;
};

export function TransactionForm({ open, onClose, onSaved, editingTransaction }: TransactionFormProps) {
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
    }
  }, [open, editingTransaction]);

  async function loadData() {
    const [cats, accs, cds] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('accounts').select('*').order('name'),
      supabase.from('credit_cards').select('*').order('name'),
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

    const data = {
      description: form.description,
      amount: signedAmount,
      type: form.type,
      category_id: form.category_id || null,
      account_id: form.account_id || null,
      card_id: form.card_id || null,
      date: form.date,
      notes: form.notes || null,
    };

    if (editingTransaction) {
      await supabase.from('transactions').update(data).eq('id', editingTransaction.id);
    } else {
      await supabase.from('transactions').insert(data);
    }

    if (form.account_id && form.type !== 'transfer') {
      const acc = accounts.find(a => a.id === form.account_id);
      if (acc) {
        const newBalance = form.type === 'expense'
          ? acc.balance - amount
          : acc.balance + amount;
        await supabase.from('accounts').update({ balance: newBalance }).eq('id', form.account_id);
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
