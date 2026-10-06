import { useState, useEffect } from 'react';
import { AlertTriangle, Bell, Clock, X, CreditCard, Landmark, Wallet, Volume2, VolumeX, CheckCircle2 } from 'lucide-react';
import { formatCurrency, type Account } from '@/lib/supabase';
import { type DueAlertSummary, type DueAlertItem, playAlertSound, payDueAlertItem } from '@/lib/dueAlerts';

type DueAlertsModalProps = {
  summary: DueAlertSummary | null;
  onClose: () => void;
  onNavigate?: (page: string) => void;
  accounts?: Account[];
  onPaid?: () => void;
};

export function DueAlertsModal({ summary, onClose, onNavigate, accounts = [], onPaid }: DueAlertsModalProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    if (summary && summary.hasUrgent && !hasPlayed) {
      if (soundEnabled) {
        playAlertSound();
      }
      setHasPlayed(true);
    }
  }, [summary, hasPlayed, soundEnabled]);

  if (!summary || !summary.hasUrgent) return null;

  const urgentItems = [...summary.overdue, ...summary.today];
  const soonItems = summary.soon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div
        className="card max-w-md w-full overflow-hidden border border-[#27272a] shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#27272a]" style={{
          background: summary.overdue.length > 0
            ? 'linear-gradient(135deg, rgba(239,68,68,0.15), transparent)'
            : 'linear-gradient(135deg, rgba(245,158,11,0.15), transparent)'
        }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                summary.overdue.length > 0 ? 'bg-[#ef4444]/20' : 'bg-[#f59e0b]/20'
              }`}>
                <AlertTriangle size={22} className={summary.overdue.length > 0 ? 'text-[#ef4444]' : 'text-[#f59e0b]'} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  {summary.overdue.length > 0
                    ? `${summary.overdue.length} ${summary.overdue.length === 1 ? 'conta vencida' : 'contas vencidas'}!`
                    : `${summary.today.length} ${summary.today.length === 1 ? 'vencimento hoje' : 'vencimentos hoje'}`}
                </h2>
                <p className="text-xs text-[#a1a1aa]">
                  {summary.overdue.length > 0
                    ? `Total em atraso: ${formatCurrency(summary.totalOverdue)}`
                    : `Total a pagar: ${formatCurrency(summary.totalDueSoon)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-lg hover:bg-[#27272a] transition-colors"
                title={soundEnabled ? 'Som ativado' : 'Som desativado'}
              >
                {soundEnabled
                  ? <VolumeX size={16} className="text-[#71717a]" />
                  : <Volume2 size={16} className="text-[#71717a]" />}
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#27272a] transition-colors">
                <X size={18} className="text-[#71717a]" />
              </button>
            </div>
          </div>
        </div>

        {/* Items list */}
        <div className="max-h-[50vh] overflow-y-auto">
          {summary.overdue.length > 0 && (
            <div className="p-4">
              <p className="text-xs font-semibold text-[#ef4444] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Vencidas
              </p>
              <div className="space-y-2">
                {summary.overdue.map(item => (
                  <AlertRow key={item.id} item={item} onNavigate={onNavigate} accounts={accounts} onPaid={onPaid} />
                ))}
              </div>
            </div>
          )}

          {summary.today.length > 0 && (
            <div className={`p-4 ${summary.overdue.length > 0 ? 'border-t border-[#27272a]' : ''}`}>
              <p className="text-xs font-semibold text-[#f59e0b] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Clock size={12} /> Vencem Hoje
              </p>
              <div className="space-y-2">
                {summary.today.map(item => (
                  <AlertRow key={item.id} item={item} onNavigate={onNavigate} accounts={accounts} onPaid={onPaid} />
                ))}
              </div>
            </div>
          )}

          {soonItems.length > 0 && (
            <div className="p-4 border-t border-[#27272a]">
              <p className="text-xs font-semibold text-[#f59e0b] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Bell size={12} /> Próximos Vencimentos (3 dias)
              </p>
              <div className="space-y-2">
                {soonItems.map(item => (
                  <AlertRow key={item.id} item={item} onNavigate={onNavigate} accounts={accounts} onPaid={onPaid} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#27272a] flex gap-3">
          {onNavigate && (
            <button
              onClick={() => { onNavigate('cards'); onClose(); }}
              className="flex-1 btn-ghost border border-[#27272a] text-sm"
            >
              Ver Faturas
            </button>
          )}
          <button onClick={onClose} className="flex-1 btn-primary text-sm">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertRow({ item, onNavigate, accounts, onPaid }: {
  item: DueAlertItem;
  onNavigate?: (page: string) => void;
  accounts: Account[];
  onPaid?: () => void;
}) {
  const [showPay, setShowPay] = useState(false);
  const [paying, setPaying] = useState(false);
  const Icon = item.kind === 'invoice' ? CreditCard : item.kind === 'loan_installment' ? Landmark : Wallet;
  const color = item.severity === 'overdue' ? '#ef4444' : '#f59e0b';
  const bgOpacity = item.severity === 'overdue' ? '15' : '10';

  async function handlePay(accountId: string) {
    setPaying(true);
    await payDueAlertItem(item, accountId);
    setPaying(false);
    setShowPay(false);
    onPaid?.();
  }

  return (
    <div className="p-3 rounded-xl bg-[#0a0a0b] border border-[#27272a] hover:border-[#3f3f46] transition-colors">
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => {
          if (onNavigate) {
            if (item.kind === 'invoice') onNavigate('cards');
            else if (item.kind === 'loan_installment') onNavigate('loans');
            else onNavigate('transactions');
          }
        }}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0`} style={{ background: `${color}${bgOpacity}` }}>
          <Icon size={15} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{item.title}</p>
          <p className="text-xs text-[#71717a] truncate">{item.subtitle}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-white">{formatCurrency(item.amount)}</p>
          <p className="text-[10px] font-medium" style={{ color }}>
            {item.severity === 'overdue'
              ? `${Math.abs(item.daysUntilDue)}d atrás`
              : item.severity === 'today'
              ? 'Hoje'
              : `${item.daysUntilDue}d`}
          </p>
        </div>
      </div>
      {/* Pay button */}
      {accounts.length > 0 && (
        <div className="mt-2 ml-12">
          {showPay ? (
            <div className="flex items-center gap-2">
              <select
                className="input flex-1 text-xs py-1.5"
                defaultValue=""
                onChange={e => { if (e.target.value) handlePay(e.target.value); }}
                disabled={paying}
              >
                <option value="" disabled>Pagar com conta...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} — {formatCurrency(Number(a.balance))}</option>
                ))}
              </select>
              <button
                onClick={() => setShowPay(false)}
                className="px-2 py-1.5 rounded-lg text-xs text-[#71717a] hover:text-white hover:bg-[#27272a]"
              >Cancelar</button>
            </div>
          ) : (
            <button
              onClick={() => setShowPay(true)}
              disabled={paying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10b981]/15 text-[#10b981] text-xs font-medium hover:bg-[#10b981]/25 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              {paying ? 'Pagando...' : 'Baixar / Pagar'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
