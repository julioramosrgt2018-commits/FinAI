import { useState, useEffect } from 'react';
import { Modal } from '@/components/Modal';
import { Building2, Shield, Loader2, CheckCircle2, Lock, ExternalLink, KeyRound, Zap } from 'lucide-react';

type Institution = {
  id: string;
  name: string;
  color: string;
  logo: string;
  status: 'available' | 'beta';
};

const institutions: Institution[] = [
  { id: 'itau', name: 'Itaú', color: '#ec7000', logo: 'Itaú', status: 'available' },
  { id: 'bradesco', name: 'Bradesco', color: '#cc092f', logo: 'Bradesco', status: 'available' },
  { id: 'santander', name: 'Santander', color: '#ec0000', logo: 'Santander', status: 'available' },
  { id: 'bb', name: 'Banco do Brasil', color: '#ffdd00', logo: 'BB', status: 'available' },
  { id: 'nubank', name: 'Nubank', color: '#820ad1', logo: 'Nubank', status: 'available' },
  { id: 'inter', name: 'Inter', color: '#ff7a00', logo: 'Inter', status: 'available' },
  { id: 'c6', name: 'C6 Bank', color: '#111111', logo: 'C6', status: 'available' },
  { id: 'caixa', name: 'Caixa', color: '#0066b3', logo: 'Caixa', status: 'available' },
  { id: 'xp', name: 'XP Investimentos', color: '#1e1e1e', logo: 'XP', status: 'beta' },
  { id: 'btg', name: 'BTG Pactual', color: '#0a3d62', logo: 'BTG', status: 'beta' },
  { id: 'picpay', name: 'PicPay', color: '#21c25e', logo: 'PicPay', status: 'available' },
  { id: 'mercadopago', name: 'Mercado Pago', color: '#009ee3', logo: 'MP', status: 'available' },
];

type Step = 'select' | 'auth' | 'connecting' | 'consent' | 'success';

type Props = {
  open: boolean;
  onClose: () => void;
  onConnected: (institution: Institution) => void;
};

export function OpenFinanceModal({ open, onClose, onConnected }: Props) {
  const [step, setStep] = useState<Step>('select');
  const [selected, setSelected] = useState<Institution | null>(null);
  const [credentials, setCredentials] = useState({ user: '', password: '' });
  const [consentItems, setConsentItems] = useState({
    balances: true,
    transactions: true,
    cards: true,
    loans: false,
  investments: false,
  benefits: false,
  sharing: true,
  ninetyDays: true,
  autoRefresh: true,
  encryption: true,
  revocable: true,
  regulatoryNotice: true,
  dataMinimization: true,
    auditLog: true,
  secureChannel: true,
  tokenRotation: true,
  revokeAnyTime: true,
    privacyPolicy: true,
    termsAccepted: false,
  biometricAuth: false,
    twoFactor: false,
    transactionAlerts: false,
    fraudDetection: true,
    sessionTimeout: true,
    deviceBinding: false,
    anonymizedAnalytics: true,
    backupEncryption: true,
    keyRotation90d: true,
    incidentNotification: true,
    dataPortability: true,
    consentHistory: true,
    thirdPartySharing: false,
  });

  useEffect(() => {
    if (open) {
      setStep('select');
      setSelected(null);
      setCredentials({ user: '', password: '' });
    }
  }, [open]);

  function handleConnect() {
    if (!selected) return;
    setStep('auth');
  }

  function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep('connecting');
    setTimeout(() => {
      setStep('consent');
    }, 2500);
  }

  function handleConsentApprove() {
    setStep('connecting');
    setTimeout(() => {
      setStep('success');
    }, 2000);
  }

  function handleFinish() {
    if (selected) onConnected(selected);
    onClose();
  }

  const consentKeys = Object.keys(consentItems) as (keyof typeof consentItems)[];

  return (
    <Modal open={open} onClose={onClose} title="Conectar Banco — Open Finance" size="lg">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5">
        {(['select', 'auth', 'consent', 'success'] as Step[]).map((s, i) => {
          const active = step === s || (step === 'connecting' && s === (step === 'connecting' ? 'consent' : ''));
          const done = (['select', 'auth', 'consent', 'success'] as Step[]).indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                active || done ? 'bg-[#10b981] text-white' : 'bg-[#27272a] text-[#71717a]'
              }`}>
                {done ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              {i < 3 && <div className={`flex-1 h-0.5 ${done ? 'bg-[#10b981]' : 'bg-[#27272a]'}`} />}
            </div>
          );
        })}
      </div>

      {step === 'select' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[#10b981] bg-[#10b981]/10 rounded-lg p-2.5">
            <Shield size={14} />
            <span>Conexão segura via padrão Open Finance Brasil (DIREX Resolução 32)</span>
          </div>
          <p className="text-sm text-[#a1a1aa]">Selecione a instituição financeira que deseja conectar:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {institutions.map(inst => (
              <button
                key={inst.id}
                onClick={() => setSelected(inst)}
                className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                  selected?.id === inst.id
                    ? 'border-[#10b981] bg-[#10b981]/10'
                    : 'border-[#27272a] bg-[#0a0a0b] hover:border-[#3f3f46]'
                }`}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: inst.color }}>
                  {inst.logo}
                </div>
                <span className="text-xs font-medium text-white text-center leading-tight">{inst.name}</span>
                {inst.status === 'beta' && <span className="text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 px-1.5 rounded">Beta</span>}
              </button>
            ))}
          </div>
          <button onClick={handleConnect} disabled={!selected} className="w-full btn-primary disabled:opacity-50 flex items-center justify-center gap-2">
            <KeyRound size={16} /> Continuar
          </button>
        </div>
      )}

      {step === 'auth' && selected && (
        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#0a0a0b] border border-[#27272a]">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{ background: selected.color }}>
              {selected.logo}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{selected.name}</p>
              <p className="text-xs text-[#71717a]">Autenticação segura • Criptografia AES-256</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#a1a1aa] bg-[#27272a]/50 rounded-lg p-2.5">
            <Lock size={14} className="text-[#10b981]" />
            <span>Você será redirecionado ao ambiente seguro da instituição. Suas credenciais não são armazenadas.</span>
          </div>
          <div>
            <label className="label">Agência / CPF</label>
            <input className="input mt-1" value={credentials.user} onChange={e => setCredentials(c => ({ ...c, user: e.target.value }))} placeholder="0001 / 123.456.789-00" autoFocus required />
          </div>
          <div>
            <label className="label">Senha / Chave de Acesso</label>
            <input type="password" className="input mt-1" value={credentials.password} onChange={e => setCredentials(c => ({ ...c, password: e.target.value }))} placeholder="••••••" required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep('select')} className="flex-1 btn-ghost border border-[#27272a]">Voltar</button>
            <button type="submit" className="flex-1 btn-primary flex items-center justify-center gap-2">
              <ExternalLink size={16} /> Autorizar Acesso
            </button>
          </div>
        </form>
      )}

      {step === 'connecting' && (
        <div className="py-12 flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-[#10b981]" />
          <div className="text-center">
            <p className="text-sm font-medium text-white">Estabelecendo conexão segura...</p>
            <p className="text-xs text-[#71717a] mt-1">Gerando token de autorização e criptografando credenciais</p>
          </div>
          <div className="w-full max-w-xs space-y-1.5">
            <ProgressLine label="Conexão TLS 1.3" delay={0} />
            <ProgressLine label="Autenticação OAuth 2.0" delay={400} />
            <ProgressLine label="Geração de token AES-256" delay={900} />
            <ProgressLine label="Sincronização inicial" delay={1500} />
          </div>
        </div>
      )}

      {step === 'consent' && selected && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-[#f59e0b] bg-[#f59e0b]/10 rounded-lg p-2.5">
            <Shield size={14} />
            <span>Revise e autorize o escopo de dados que serão compartilhados</span>
          </div>
          <div className="space-y-2">
            {consentKeys.map(key => (
              <label key={key} className="flex items-center gap-3 p-2.5 rounded-lg bg-[#0a0a0b] border border-[#27272a] cursor-pointer hover:border-[#3f3f46]">
                <input
                  type="checkbox"
                  checked={consentItems[key]}
                  onChange={e => setConsentItems(c => ({ ...c, [key]: e.target.checked }))}
                  className="w-4 h-4 rounded accent-[#10b981]"
                />
                <span className="text-xs text-[#a1a1aa] flex-1">{consentLabel(key)}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('auth')} className="flex-1 btn-ghost border border-[#27272a]">Voltar</button>
            <button onClick={handleConsentApprove} className="flex-1 btn-primary flex items-center justify-center gap-2">
              <Shield size={16} /> Aprovar e Conectar
            </button>
          </div>
        </div>
      )}

      {step === 'success' && selected && (
        <div className="py-8 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-[#10b981]/15 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-[#10b981]" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">Conexão estabelecida!</p>
            <p className="text-sm text-[#71717a] mt-1">{selected.name} foi conectado via Open Finance.</p>
          </div>
          <div className="w-full space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-[#10b981]">
              <Zap size={12} /> Saldos importados automaticamente
            </div>
            <div className="flex items-center gap-2 text-xs text-[#10b981]">
              <Zap size={12} /> Extratos sincronizados (últimos 90 dias)
            </div>
            <div className="flex items-center gap-2 text-xs text-[#10b981]">
              <Zap size={12} /> Cartões de crédito vinculados
            </div>
          </div>
          <button onClick={handleFinish} className="w-full btn-primary">Concluir</button>
        </div>
      )}
    </Modal>
  );
}

function ProgressLine({ label, delay }: { label: string; delay: number }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className="flex items-center gap-2 text-xs">
      {done ? <CheckCircle2 size={12} className="text-[#10b981]" /> : <Loader2 size={12} className="animate-spin text-[#71717a]" />}
      <span className={done ? 'text-[#a1a1aa]' : 'text-[#71717a]'}>{label}</span>
    </div>
  );
}

function consentLabel(key: string): string {
  const labels: Record<string, string> = {
    balances: 'Consultar saldos das contas',
    transactions: 'Consultar extratos e lançamentos',
    cards: 'Consultar cartões de crédito e faturas',
    loans: 'Consultar empréstimos e financiamentos',
    investments: 'Consultar investimentos',
    benefits: 'Consultar cartões de benefício (VA/VR)',
    sharing: 'Compartilhar dados por 12 meses (renovável)',
    ninetyDays: 'Permitir revogação a qualquer momento',
    autoRefresh: 'Sincronização automática diária',
    encryption: 'Criptografia AES-256 para tokens de acesso',
    revocable: 'Consentimento revogável a qualquer momento',
    regulatoryNotice: 'Conforme Resolução 32/2020 do BCB — Open Finance Brasil',
    dataMinimization: 'Minimização de dados: apenas o necessário',
    auditLog: 'Registro de auditoria de acessos',
    secureChannel: 'Canal seguro TLS 1.3 para transmissão',
    tokenRotation: 'Rotação automática de tokens a cada 24h',
    revokeAnyTime: 'Direito de revogação garantido por lei',
    privacyPolicy: 'Política de privacidade aceita',
    termsAccepted: 'Termos de uso do Open Finance aceitos',
    biometricAuth: 'Exigir autenticação biométrica para revalidação',
    twoFactor: 'Autenticação em dois fatores (2FA) para operações sensíveis',
    transactionAlerts: 'Alertas de transações em tempo real',
    fraudDetection: 'Detecção de fraude por análise comportamental',
    sessionTimeout: 'Bloqueio automático por inatividade (5 min)',
    deviceBinding: 'Vincular dispositivo autorizado',
    anonymizedAnalytics: 'Analytics anonimizados para melhoria do serviço',
    backupEncryption: 'Backup criptografado de tokens',
    keyRotation90d: 'Rotação de chaves a cada 90 dias',
    incidentNotification: 'Notificação de incidentes de segurança em até 72h',
    dataPortability: 'Portabilidade dos dados a qualquer momento',
    consentHistory: 'Histórico de consentimentos disponível',
    thirdPartySharing: 'Compartilhamento com terceiros parceiros',
  };
  return labels[key] || key;
}

export type { Institution as OpenFinanceInstitution };
