import { useState, useEffect, useCallback } from 'react';
import { supabase, formatCurrency, type Account, type CreditCard as CreditCardType, type CardInvoice } from '@/lib/supabase';
import { Building2, Plus, Pencil, Trash2, CreditCard, Shield, Fingerprint, Lock, Eye, EyeOff, Clock, SlidersHorizontal, ScanFace, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState } from '@/components/Shared';
import { useSecurity } from '@/lib/security';
import { useProfile } from '@/lib/profile';

export function Settings() {
  const { profile } = useProfile();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCardType[]>([]);
  const [invoices, setInvoices] = useState<CardInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ invoiceId: '', amount: '' });
  const [accForm, setAccForm] = useState({
    name: '', institution: '', type: 'checking', balance: '', agency: '', account_number: '', color: '#3b82f6',
  });

  const { pin, setPin, lock, biometricAvailable, biometricEnabled, enrollBiometric, disableBiometric, lockTimeout, setLockTimeout, maskValues, setMaskValues } = useSecurity();
  const [bioLoading, setBioLoading] = useState(false);
  const [bioStatus, setBioStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');

  const loadData = useCallback(async () => {
    const [accs, cds, invs] = await Promise.all([
      supabase.from('accounts').select('*').eq('profile', profile).order('name'),
      supabase.from('credit_cards').select('*').eq('profile', profile).order('name'),
      supabase.from('card_invoices').select('*').eq('profile', profile).order('due_date'),
    ]);
    setAccounts(accs.data || []);
    setCards(cds.data || []);
    setInvoices(invs.data || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (editing) {
      setAccForm({
        name: editing.name, institution: editing.institution, type: editing.type,
        balance: String(editing.balance), agency: editing.agency || '', account_number: editing.account_number || '',
        color: editing.color,
      });
    } else {
      setAccForm({ name: '', institution: '', type: 'checking', balance: '', agency: '', account_number: '', color: '#3b82f6' });
    }
  }, [editing]);

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: accForm.name, institution: accForm.institution, type: accForm.type as Account['type'],
      balance: parseFloat(accForm.balance) || 0, agency: accForm.agency || null,
      account_number: accForm.account_number || null, color: accForm.color, profile,
    };
    if (editing) {
      await supabase.from('accounts').update(data).eq('id', editing.id);
    } else {
      await supabase.from('accounts').insert(data);
    }
    setShowForm(false);
    setEditing(null);
    loadData();
  }

  async function deleteAccount() {
    if (!deleteId) return;
    await supabase.from('transactions').update({ account_id: null }).eq('account_id', deleteId);
    await supabase.from('accounts').delete().eq('id', deleteId);
    setDeleteId(null);
    loadData();
  }

  function handleSetPin() {
    if (pinInput.length !== 6) { setPinError('PIN deve ter 6 dígitos.'); return; }
    if (pinInput !== pinConfirm) { setPinError('PINs não coincidem.'); return; }
    setPin(pinInput);
    setShowPinSetup(false);
    setPinInput('');
    setPinConfirm('');
    setPinError('');
  }

  async function adjustInvoice(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(adjustForm.amount);
    if (isNaN(amount) || !adjustForm.invoiceId) return;
    await supabase.from('card_invoices').update({ amount }).eq('id', adjustForm.invoiceId);
    setShowAdjustModal(false);
    setAdjustForm({ invoiceId: '', amount: '' });
    loadData();
  }

  const colors = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];
  const institutions = ['Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Nubank', 'Inter', 'C6 Bank', 'XP', 'BTG Pactual', 'Caixa', 'PicPay', 'Mercado Pago', 'Outro'];

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl skeleton" />)}</div>;

  return (
    <div className="space-y-4 pb-24">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>

      {/* Security & Privacy Section */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/15 flex items-center justify-center">
            <Lock size={20} className="text-[#3b82f6]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Segurança e Privacidade</h2>
            <p className="text-xs text-[#71717a]">Proteção do app e dados sensíveis</p>
          </div>
        </div>

        {/* PIN status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a0a0b] border border-[#27272a]">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-[#10b981]" />
              <div>
                <p className="text-sm text-white">PIN de 6 dígitos</p>
                <p className="text-xs text-[#71717a]">{pin ? 'PIN configurado' : 'Não configurado'}</p>
              </div>
            </div>
            <button onClick={() => setShowPinSetup(true)} className="btn-ghost text-xs border border-[#27272a] px-3 py-1.5">
              {pin ? 'Alterar' : 'Configurar'}
            </button>
          </div>

          {/* Biometric */}
          <div className="p-3 rounded-lg bg-[#0a0a0b] border border-[#27272a]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {biometricAvailable ? <ScanFace size={16} className="text-[#10b981]" /> : <Fingerprint size={16} className="text-[#71717a]" />}
                <div>
                  <p className="text-sm text-white">Biometria (Face ID / Digital)</p>
                  <p className="text-xs text-[#71717a]">
                    {biometricAvailable
                      ? biometricEnabled ? 'Ativada — toque para desativar' : 'Toque para ativar e registrar'
                      : 'Nao disponível neste dispositivo'}
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!biometricAvailable) return;
                  if (biometricEnabled) {
                    disableBiometric();
                    setBioStatus({ type: 'success', msg: 'Biometria desativada.' });
                  } else {
                    setBioLoading(true);
                    setBioStatus(null);
                    const success = await enrollBiometric();
                    setBioLoading(false);
                    if (success) {
                      setBioStatus({ type: 'success', msg: 'Biometria ativada com sucesso! Você já pode usá-la para desbloquear.' });
                    } else {
                      setBioStatus({ type: 'error', msg: 'Nao foi possível registrar a biometria. Verifique se seu dispositivo suporta e tente novamente.' });
                    }
                  }
                  setTimeout(() => setBioStatus(null), 5000);
                }}
                disabled={!biometricAvailable || bioLoading}
                className={`w-11 h-6 rounded-full transition-colors ${biometricEnabled ? 'bg-[#10b981]' : 'bg-[#27272a]'} disabled:opacity-40 relative flex-shrink-0`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${biometricEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {bioLoading && (
              <div className="flex items-center gap-2 mt-2 text-xs text-[#10b981]">
                <Loader2 size={12} className="animate-spin" />
                <span>Aguardando leitura biométrica do dispositivo...</span>
              </div>
            )}
            {bioStatus && (
              <div className={`flex items-center gap-1.5 mt-2 text-xs rounded-lg px-2.5 py-2 ${bioStatus.type === 'success' ? 'text-[#10b981] bg-[#10b981]/10' : 'text-[#f59e0b] bg-[#f59e0b]/10'}`}>
                {bioStatus.type === 'success' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                <span>{bioStatus.msg}</span>
              </div>
            )}
          </div>

          {/* Auto-lock timeout */}
          <div className="p-3 rounded-lg bg-[#0a0a0b] border border-[#27272a]">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-[#f59e0b]" />
              <div>
                <p className="text-sm text-white">Bloqueio automático por inatividade</p>
                <p className="text-xs text-[#71717a]">Bloqueia o app após período sem uso</p>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              {[1, 5, 15, 30].map(t => (
                <button
                  key={t}
                  onClick={() => setLockTimeout(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${lockTimeout === t ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#27272a] text-[#a1a1aa]'}`}
                >
                  {t}min
                </button>
              ))}
            </div>
          </div>

          {/* Value masking */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a0a0b] border border-[#27272a]">
            <div className="flex items-center gap-2">
              {maskValues ? <EyeOff size={16} className="text-[#3b82f6]" /> : <Eye size={16} className="text-[#a1a1aa]" />}
              <div>
                <p className="text-sm text-white">Ocultar valores na tela inicial</p>
                <p className="text-xs text-[#71717a]">Mascara saldos e valores sensíveis</p>
              </div>
            </div>
            <button
              onClick={() => setMaskValues(!maskValues)}
              className={`w-11 h-6 rounded-full transition-colors ${maskValues ? 'bg-[#10b981]' : 'bg-[#27272a]'} relative`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${maskValues ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Lock now */}
          {pin && (
            <button onClick={lock} className="w-full btn-ghost border border-[#27272a] flex items-center justify-center gap-2 text-sm">
              <Lock size={14} /> Bloquear agora
            </button>
          )}
        </div>
      </div>

      {/* Bank Accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Building2 size={16} className="text-[#3b82f6]" />
            Contas Bancárias
          </h2>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nova Conta
          </button>
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            icon={<Building2 size={28} />}
            title="Nenhuma conta cadastrada"
            description="Adicione suas contas bancárias para acompanhar saldos e lançamentos."
            action={<button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary flex items-center gap-2"><Plus size={18} /> Adicionar Conta</button>}
          />
        ) : (
          <div className="space-y-2">
            {accounts.map(acc => (
              <div key={acc.id} className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${acc.color}20` }}>
                    <Building2 size={18} style={{ color: acc.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{acc.name}</p>
                    <p className="text-xs text-[#71717a]">{acc.institution} • {acc.type === 'checking' ? 'Conta Corrente' : acc.type === 'savings' ? 'Poupança' : 'Investimento'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">{formatCurrency(Number(acc.balance))}</p>
                  </div>
                </div>
                <div className="flex gap-1 mt-2 pt-2 border-t border-[#27272a]">
                  <div className="flex-1" />
                  <button onClick={() => { setEditing(acc); setShowForm(true); }} className="btn-ghost text-xs flex items-center gap-1">
                    <Pencil size={12} /> Editar
                  </button>
                  <button onClick={() => setDeleteId(acc.id)} className="btn-danger text-xs flex items-center gap-1">
                    <Trash2 size={12} /> Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credit Cards Quick Link */}
      <div>
        <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <CreditCard size={16} className="text-[#ef4444]" />
          Cartões de Crédito ({cards.length})
        </h2>
        {cards.length === 0 ? (
          <div className="card p-4">
            <p className="text-sm text-[#71717a]">Gerencie seus cartões na aba Cartões.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cards.map(card => (
              <div key={card.id} className="card p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${card.color}20` }}>
                  <CreditCard size={16} style={{ color: card.color }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{card.name}</p>
                  <p className="text-xs text-[#71717a]">{card.institution} • Limite: {formatCurrency(Number(card.limit_total))}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoice Balance Adjustment */}
      {invoices.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-[#f59e0b]" />
              Ajuste de Faturas
            </h2>
            <button onClick={() => { setAdjustForm({ invoiceId: '', amount: '' }); setShowAdjustModal(true); }} className="btn-ghost text-xs flex items-center gap-1 border border-[#27272a]">
              <Pencil size={12} /> Ajustar
            </button>
          </div>
          <div className="space-y-2">
            {invoices.filter(i => i.status === 'open' || i.status === 'future').map(inv => {
              const card = cards.find(c => c.id === inv.card_id);
              return (
                <div key={inv.id} className="card p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${card?.color || '#71717a'}20` }}>
                    <CreditCard size={14} style={{ color: card?.color || '#71717a' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{card?.name || 'Cartão'} — {inv.reference_month}</p>
                    <p className="text-xs text-[#71717a]">{inv.status === 'open' ? 'Aberta' : 'Futura'} • Venc: {inv.due_date}</p>
                  </div>
                  <p className="text-sm font-bold text-white">{formatCurrency(Number(inv.amount))}</p>
                  <button onClick={() => { setAdjustForm({ invoiceId: inv.id, amount: String(inv.amount) }); setShowAdjustModal(true); }} className="p-1.5 hover:bg-[#27272a] rounded-lg">
                    <Pencil size={12} className="text-[#a1a1aa]" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Account Form */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Editar Conta' : 'Nova Conta Bancária'}>
        <form onSubmit={saveAccount} className="space-y-4">
          <div>
            <label className="label">Nome da Conta</label>
            <input className="input mt-1" value={accForm.name} onChange={e => setAccForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Conta Principal" autoFocus required />
          </div>
          <div>
            <label className="label">Instituição</label>
            <select className="input mt-1" value={accForm.institution} onChange={e => setAccForm(f => ({ ...f, institution: e.target.value }))} required>
              <option value="">Selecione...</option>
              {institutions.map(inst => <option key={inst} value={inst}>{inst}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipo de Conta</label>
            <select className="input mt-1" value={accForm.type} onChange={e => setAccForm(f => ({ ...f, type: e.target.value }))}>
              <option value="checking">Conta Corrente</option>
              <option value="savings">Poupança</option>
              <option value="investment">Conta Investimento</option>
            </select>
          </div>
          <div>
            <label className="label">Saldo Atual (R$)</label>
            <input type="number" step="0.01" className="input mt-1" value={accForm.balance} onChange={e => setAccForm(f => ({ ...f, balance: e.target.value }))} placeholder="0,00" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Agência</label>
              <input className="input mt-1" value={accForm.agency} onChange={e => setAccForm(f => ({ ...f, agency: e.target.value }))} placeholder="0001" />
            </div>
            <div>
              <label className="label">Número da Conta</label>
              <input className="input mt-1" value={accForm.account_number} onChange={e => setAccForm(f => ({ ...f, account_number: e.target.value }))} placeholder="12345-6" />
            </div>
          </div>
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2 mt-1">
              {colors.map(c => (
                <button key={c} type="button" onClick={() => setAccForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-transform ${accForm.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#18181b] scale-110' : ''}`}
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
        title="Excluir conta?"
        message="Lançamentos vinculados serão mantidos, mas ficarão sem conta associada."
        onConfirm={deleteAccount}
        onCancel={() => setDeleteId(null)}
      />

      {/* PIN Setup Modal */}
      <Modal open={showPinSetup} onClose={() => { setShowPinSetup(false); setPinInput(''); setPinConfirm(''); setPinError(''); }} title={pin ? 'Alterar PIN' : 'Configurar PIN'} size="sm">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-[#10b981] bg-[#10b981]/10 rounded-lg p-2.5">
            <Shield size={14} />
            <span>Seu PIN é armazenado localmente e protegido com criptografia</span>
          </div>
          <div>
            <label className="label">Novo PIN (6 dígitos)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="input mt-1 text-center text-2xl tracking-[0.5em]"
              value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Confirmar PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="input mt-1 text-center text-2xl tracking-[0.5em]"
              value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
              placeholder="•••••••"
            />
          </div>
          {pinError && <p className="text-xs text-[#ef4444]">{pinError}</p>}
          <button onClick={handleSetPin} className="w-full btn-primary">Salvar PIN</button>
        </div>
      </Modal>
      {/* Invoice Adjustment Modal */}
      <Modal open={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Ajustar Saldo da Fatura" size="sm">
        <form onSubmit={adjustInvoice} className="space-y-4">
          <div>
            <label className="label">Fatura</label>
            <select
              className="input mt-1"
              value={adjustForm.invoiceId}
              onChange={e => setAdjustForm(f => ({ ...f, invoiceId: e.target.value }))}
              required
            >
              <option value="">Selecione...</option>
              {invoices.map(inv => {
                const card = cards.find(c => c.id === inv.card_id);
                return (
                  <option key={inv.id} value={inv.id}>
                    {card?.name || 'Cartão'} — {inv.reference_month} ({inv.status})
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="label">Valor Correto (R$)</label>
            <input
              type="number"
              step="0.01"
              className="input mt-1"
              value={adjustForm.amount}
              onChange={e => setAdjustForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0,00"
              required
            />
            <p className="text-xs text-[#71717a] mt-1">Digite o valor correto da fatura para corrigir distorções.</p>
          </div>
          <button type="submit" className="w-full btn-primary">Aplicar Ajuste</button>
        </form>
      </Modal>
    </div>
  );
}
