import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const PIN_STORAGE_KEY = 'finai_pin';
const LOCK_TIMEOUT_KEY = 'finai_lock_timeout';
const MASK_KEY = 'finai_mask_values';
const LAST_ACTIVE_KEY = 'finai_last_active';

const DEFAULT_TIMEOUT = 5; // minutes

type SecurityContextType = {
  isAuthed: boolean;
  pin: string | null;
  setPin: (pin: string) => void;
  verifyPin: (pin: string) => boolean;
  unlock: () => void;
  lock: () => void;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  setBiometricEnabled: (v: boolean) => void;
  unlockWithBiometric: () => boolean;
  lockTimeout: number;
  setLockTimeout: (v: number) => void;
  maskValues: boolean;
  setMaskValues: (v: boolean) => void;
  toggleMask: () => void;
  resetActivity: () => void;
};

const SecurityContext = createContext<SecurityContextType | null>(null);

export function SecurityProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(false);
  const [pin, setPinState] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [lockTimeout, setLockTimeoutState] = useState(DEFAULT_TIMEOUT);
  const [maskValues, setMaskValuesState] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Load saved state on mount
  useEffect(() => {
    const savedPin = localStorage.getItem(PIN_STORAGE_KEY);
    const savedTimeout = localStorage.getItem(LOCK_TIMEOUT_KEY);
    const savedMask = localStorage.getItem(MASK_KEY);
    if (savedPin) setPinState(savedPin);
    if (savedTimeout) setLockTimeoutState(parseInt(savedTimeout));
    if (savedMask === 'true') setMaskValuesState(true);

    // Check for WebAuthn / biometric support
    if (typeof window !== 'undefined' && 'credentials' in navigator) {
      navigator.credentials?.get({ password: false as never }).catch(() => {});
      // PublicKeyCredential is the standard for platform authenticators
      if (typeof PublicKeyCredential !== 'undefined') {
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().then(setBiometricAvailable).catch(() => setBiometricAvailable(false));
      }
    }
  }, []);

  // Auto-lock on inactivity
  useEffect(() => {
    if (!isAuthed || !pin) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivity;
      if (elapsed > lockTimeout * 60 * 1000) {
        setIsAuthed(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isAuthed, pin, lastActivity, lockTimeout]);

  // Lock on visibility change (app backgrounded)
  useEffect(() => {
    if (!isAuthed || !pin) return;
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        setLastActivity(0);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [isAuthed, pin]);

  const setPin = useCallback((newPin: string) => {
    localStorage.setItem(PIN_STORAGE_KEY, newPin);
    setPinState(newPin);
  }, []);

  const verifyPin = useCallback((input: string) => {
    return pin !== null && input === pin;
  }, [pin]);

  const unlock = useCallback(() => {
    setIsAuthed(true);
    setLastActivity(Date.now());
  }, []);

  const lock = useCallback(() => {
    setIsAuthed(false);
  }, []);

  const setBiometricEnabled = useCallback((v: boolean) => {
    setBiometricEnabledState(v);
  }, []);

  const unlockWithBiometric = useCallback(() => {
    if (!biometricAvailable) return false;
    setIsAuthed(true);
    setLastActivity(Date.now());
    return true;
  }, [biometricAvailable]);

  const setLockTimeout = useCallback((v: number) => {
    localStorage.setItem(LOCK_TIMEOUT_KEY, String(v));
    setLockTimeoutState(v);
  }, []);

  const setMaskValues = useCallback((v: boolean) => {
    localStorage.setItem(MASK_KEY, String(v));
    setMaskValuesState(v);
  }, []);

  const toggleMask = useCallback(() => {
    setMaskValuesState(prev => {
      const next = !prev;
      localStorage.setItem(MASK_KEY, String(next));
      return next;
    });
  }, []);

  const resetActivity = useCallback(() => {
    setLastActivity(Date.now());
  }, []);

  return (
    <SecurityContext.Provider value={{
      isAuthed, pin, setPin, verifyPin, unlock, lock,
      biometricAvailable, biometricEnabled, setBiometricEnabled, unlockWithBiometric,
      lockTimeout, setLockTimeout,
      maskValues, setMaskValues, toggleMask, resetActivity,
    }}>
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within SecurityProvider');
  return ctx;
}

export function maskValue(value: string): string {
  return 'R$ ••••••';
}
