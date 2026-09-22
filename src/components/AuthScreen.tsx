import { useState, useEffect } from 'react';
import { useSecurity } from '@/lib/security';
import { Fingerprint, Delete, Lock, Shield, Eye, EyeOff } from 'lucide-react';

export function AuthScreen() {
  const { pin, setPin, verifyPin, unlock, biometricAvailable, biometricEnabled, unlockWithBiometric } = useSecurity();
  const [mode, setMode] = useState<'login' | 'setup'>(pin ? 'login' : 'setup');
  const [input, setInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    setMode(pin ? 'login' : 'setup');
  }, [pin]);

  function pressDigit(d: string) {
    setError('');
    if (mode === 'setup') {
      if (input.length < 6) setInput(input + d);
    } else {
      if (input.length < 6) setInput(input + d);
    }
  }

  function deleteDigit() {
    setError('');
    setInput(input.slice(0, -1));
  }

  function handleSubmit() {
    if (input.length !== 6) return;
    if (mode === 'setup') {
      if (!confirmInput) {
        setConfirmInput(input);
        setInput('');
        return;
      }
      if (input === confirmInput) {
        setPin(input);
        unlock();
      } else {
        setError('PINs não coincidem. Tente novamente.');
        setInput('');
        setConfirmInput('');
      }
    } else {
      if (verifyPin(input)) {
        unlock();
      } else {
        setError('PIN incorreto.');
        setInput('');
      }
    }
  }

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (input.length === 6) {
      const t = setTimeout(handleSubmit, 200);
      return () => clearTimeout(t);
    }
  }, [input]);

  const dots = Array.from({ length: 6 }, (_, i) => i < input.length);

  return (
    <div className="fixed inset-0 bg-[#0a0a0b] z-[100] flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#34d399] to-[#10b981] flex items-center justify-center font-bold text-white text-2xl">
          R$
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">FinAI</h1>
          <p className="text-xs text-[#71717a]">Gestão Financeira com IA</p>
        </div>
      </div>

      {/* Security badge */}
      <div className="flex items-center gap-1.5 text-xs text-[#10b981] bg-[#10b981]/10 rounded-full px-3 py-1.5 mb-6">
        <Shield size={12} />
        <span>Criptografia AES-256 • Proteção de ponta a ponta</span>
      </div>

      {/* Mode label */}
      <div className="mb-4 text-center">
        {mode === 'setup' ? (
          <>
            <h2 className="text-lg font-semibold text-white">
              {confirmInput ? 'Confirme seu PIN' : 'Crie seu PIN de 6 dígitos'}
            </h2>
            <p className="text-xs text-[#71717a] mt-1">Usado para desbloquear o app e proteger seus dados</p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-white">Digite seu PIN</h2>
            <p className="text-xs text-[#71717a] mt-1">Desbloqueie para acessar suas finanças</p>
          </>
        )}
      </div>

      {/* PIN dots */}
      <div className="flex gap-3 mb-2">
        {dots.map((filled, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-all ${filled ? 'bg-[#10b981] scale-110' : 'bg-[#27272a]'}`}
          />
        ))}
      </div>

      {/* Show/hide toggle for setup */}
      {mode === 'setup' && (
        <button onClick={() => setShowPin(!showPin)} className="text-xs text-[#71717a] hover:text-white flex items-center gap-1 mb-2">
          {showPin ? <EyeOff size={12} /> : <Eye size={12} />}
          {showPin ? 'Ocultar' : 'Mostrar'} PIN
        </button>
      )}

      {/* Error */}
      {error && <p className="text-xs text-[#ef4444] mb-2 animate-fade-in">{error}</p>}

      {/* Show typed value in setup mode if showPin */}
      {mode === 'setup' && showPin && (
        <p className="text-sm text-[#a1a1aa] font-mono mb-2">{input || '—'}</p>
      )}

      {/* Biometric button */}
      {mode === 'login' && biometricAvailable && biometricEnabled && (
        <button
          onClick={() => {
            if (unlockWithBiometric()) return;
            setError('Biometria não reconhecida.');
          }}
          className="flex items-center gap-2 text-sm text-[#10b981] bg-[#10b981]/10 rounded-xl px-4 py-2.5 mb-4 hover:bg-[#10b981]/20 transition-colors"
        >
          <Fingerprint size={20} />
          Usar biometria
        </button>
      )}

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-3 max-w-xs w-full">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button
            key={d}
            onClick={() => pressDigit(d)}
            className="aspect-square rounded-2xl bg-[#18181b] border border-[#27272a] text-2xl font-semibold text-white hover:bg-[#27272a] active:scale-95 transition-all"
          >
            {d}
          </button>
        ))}
        <div className="flex items-center justify-center">
          {mode === 'login' && biometricAvailable && !biometricEnabled && (
            <button
              onClick={() => {
                if (unlockWithBiometric()) return;
                setError('Biometria não reconhecida.');
              }}
              className="w-14 h-14 rounded-2xl bg-[#10b981]/10 flex items-center justify-center hover:bg-[#10b981]/20 transition-colors"
            >
              <Fingerprint size={24} className="text-[#10b981]" />
            </button>
          )}
        </div>
        <button
          onClick={() => pressDigit('0')}
          className="aspect-square rounded-2xl bg-[#18181b] border border-[#27272a] text-2xl font-semibold text-white hover:bg-[#27272a] active:scale-95 transition-all"
        >
          0
        </button>
        <button
          onClick={deleteDigit}
          className="aspect-square rounded-2xl flex items-center justify-center text-[#a1a1aa] hover:bg-[#27272a] active:scale-95 transition-all"
        >
          <Delete size={22} />
        </button>
      </div>

      {/* Footer */}
      <div className="mt-8 flex items-center gap-1.5 text-xs text-[#71717a]">
        <Lock size={12} />
        <span>Seus dados estão protegidos localmente no dispositivo</span>
      </div>
    </div>
  );
}
