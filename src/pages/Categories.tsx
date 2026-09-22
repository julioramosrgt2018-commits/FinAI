import { useState, useEffect, useCallback } from 'react';
import { supabase, type Category } from '@/lib/supabase';
import { Plus, Pencil, Trash2, Tag, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState } from '@/components/Shared';

const iconOptions = ['Tag', 'Home', 'UtensilsCrossed', 'Car', 'HeartPulse', 'GraduationCap', 'Gamepad2', 'ShoppingBag', 'Wallet', 'TrendingUp', 'Briefcase', 'Plane', 'Gift', 'Dumbbell', 'Coffee', 'Smartphone'];

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [catForm, setCatForm] = useState({
    name: '', type: 'expense' as 'expense' | 'income', classification: 'variable' as 'fixed' | 'variable', color: '#10b981', icon: 'Tag',
  });

  const loadData = useCallback(async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    setCategories(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (editing) {
      setCatForm({ name: editing.name, type: editing.type, classification: editing.classification, color: editing.color, icon: editing.icon });
    } else {
      setCatForm({ name: '', type: 'expense', classification: 'variable', color: '#10b981', icon: 'Tag' });
    }
  }, [editing]);

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: catForm.name, type: catForm.type, classification: catForm.classification,
      color: catForm.color, icon: catForm.icon,
    };
    if (editing) {
      await supabase.from('categories').update(data).eq('id', editing.id);
    } else {
      await supabase.from('categories').insert(data);
    }
    setShowForm(false);
    setEditing(null);
    loadData();
  }

  async function deleteCategory() {
    if (!deleteId) return;
    await supabase.from('transactions').update({ category_id: null }).eq('category_id', deleteId);
    await supabase.from('categories').delete().eq('id', deleteId);
    setDeleteId(null);
    loadData();
  }

  const colors = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#14b8a6'];
  const expenseCats = categories.filter(c => c.type === 'expense');
  const incomeCats = categories.filter(c => c.type === 'income');

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl skeleton" />)}</div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Categorias</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> <span className="hidden sm:inline">Nova</span>
        </button>
      </div>

      {/* Expenses */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <ArrowDownCircle size={16} className="text-[#ef4444]" /> Despesas
        </h2>
        <div className="space-y-2">
          {expenseCats.length === 0 ? (
            <p className="card p-4 text-sm text-[#71717a] text-center">Nenhuma categoria de despesa.</p>
          ) : expenseCats.map(cat => (
            <div key={cat.id} className="card p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${cat.color}20` }}>
                <Tag size={16} style={{ color: cat.color }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{cat.name}</p>
                <span className={`chip ${cat.classification === 'fixed' ? 'bg-[#3b82f6]/15 text-[#3b82f6]' : 'bg-[#f59e0b]/15 text-[#f59e0b]'}`}>
                  {cat.classification === 'fixed' ? 'Fixa' : 'Variável'}
                </span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(cat); setShowForm(true); }} className="p-2 hover:bg-[#27272a] rounded-lg">
                  <Pencil size={14} className="text-[#a1a1aa]" />
                </button>
                <button onClick={() => setDeleteId(cat.id)} className="p-2 hover:bg-[#ef4444]/10 rounded-lg">
                  <Trash2 size={14} className="text-[#ef4444]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Income */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <ArrowUpCircle size={16} className="text-[#10b981]" /> Receitas
        </h2>
        <div className="space-y-2">
          {incomeCats.length === 0 ? (
            <p className="card p-4 text-sm text-[#71717a] text-center">Nenhuma categoria de receita.</p>
          ) : incomeCats.map(cat => (
            <div key={cat.id} className="card p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${cat.color}20` }}>
                <Tag size={16} style={{ color: cat.color }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{cat.name}</p>
                <span className={`chip ${cat.classification === 'fixed' ? 'bg-[#3b82f6]/15 text-[#3b82f6]' : 'bg-[#f59e0b]/15 text-[#f59e0b]'}`}>
                  {cat.classification === 'fixed' ? 'Fixa' : 'Variável'}
                </span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(cat); setShowForm(true); }} className="p-2 hover:bg-[#27272a] rounded-lg">
                  <Pencil size={14} className="text-[#a1a1aa]" />
                </button>
                <button onClick={() => setDeleteId(cat.id)} className="p-2 hover:bg-[#ef4444]/10 rounded-lg">
                  <Trash2 size={14} className="text-[#ef4444]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Editar Categoria' : 'Nova Categoria'}>
        <form onSubmit={saveCategory} className="space-y-4">
          <div>
            <label className="label">Nome</label>
            <input className="input mt-1" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Mercado" autoFocus required />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCatForm(f => ({ ...f, type: 'expense' }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${catForm.type === 'expense' ? 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30' : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'}`}>
              Despesa
            </button>
            <button type="button" onClick={() => setCatForm(f => ({ ...f, type: 'income' }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${catForm.type === 'income' ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'}`}>
              Receita
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCatForm(f => ({ ...f, classification: 'fixed' }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${catForm.classification === 'fixed' ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30' : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'}`}>
              Fixa
            </button>
            <button type="button" onClick={() => setCatForm(f => ({ ...f, classification: 'variable' }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${catForm.classification === 'variable' ? 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30' : 'bg-[#0a0a0b] text-[#71717a] border border-[#27272a]'}`}>
              Variável
            </button>
          </div>
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2 mt-1">
              {colors.map(c => (
                <button key={c} type="button" onClick={() => setCatForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-transform ${catForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#18181b] scale-110' : ''}`}
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
        title="Excluir categoria?"
        message="Lançamentos vinculados ficarão sem categoria. Esta ação não pode ser desfeita."
        onConfirm={deleteCategory}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
