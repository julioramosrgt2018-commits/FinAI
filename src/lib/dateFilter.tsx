import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export type DatePreset = 'current_month' | 'last_month' | 'last_3_months' | 'current_year' | 'custom';

type DateFilterState = {
  preset: DatePreset;
  startDate: string;
  endDate: string;
  label: string;
  setPreset: (p: DatePreset) => void;
  setCustomRange: (start: string, end: string) => void;
};

const DateFilterContext = createContext<DateFilterState | null>(null);

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeRange(preset: DatePreset, customStart?: string, customEnd?: string): { start: string; end: string; label: string } {
  const now = new Date();
  if (preset === 'custom' && customStart && customEnd) {
    const s = new Date(customStart);
    const e = new Date(customEnd);
    return {
      start: toISO(s),
      end: toISO(e),
      label: `${s.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} — ${e.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
    };
  }
  if (preset === 'current_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toISO(start), end: toISO(end), label: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: toISO(start), end: toISO(end), label: start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
  }
  if (preset === 'last_3_months') {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toISO(start), end: toISO(end), label: 'Últimos 3 meses' };
  }
  if (preset === 'current_year') {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    return { start: toISO(start), end: toISO(end), label: `Ano ${now.getFullYear()}` };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toISO(start), end: toISO(end), label: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
}

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<DatePreset>('current_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { start, end, label } = useMemo(
    () => computeRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const setPreset = useCallback((p: DatePreset) => {
    setPresetState(p);
    if (p !== 'custom') {
      setCustomStart('');
      setCustomEnd('');
    }
  }, []);

  const setCustomRange = useCallback((s: string, e: string) => {
    setCustomStart(s);
    setCustomEnd(e);
    setPresetState('custom');
  }, []);

  return (
    <DateFilterContext.Provider value={{ preset, startDate: start, endDate: end, label, setPreset, setCustomRange }}>
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter(): DateFilterState {
  const ctx = useContext(DateFilterContext);
  if (!ctx) throw new Error('useDateFilter must be used within DateFilterProvider');
  return ctx;
}
