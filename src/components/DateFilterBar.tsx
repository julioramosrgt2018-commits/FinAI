import { useState } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { useDateFilter, type DatePreset } from '@/lib/dateFilter';

const presetOptions: { key: DatePreset; label: string }[] = [
  { key: 'current_month', label: 'Mês Atual' },
  { key: 'last_month', label: 'Mês Anterior' },
  { key: 'last_3_months', label: 'Últimos 3 Meses' },
  { key: 'current_year', label: 'Ano Atual' },
];

export function DateFilterBar() {
  const { preset, startDate, endDate, label, setPreset, setCustomRange } = useDateFilter();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  function applyCustom() {
    if (customFrom && customTo) {
      setCustomRange(customFrom, customTo);
      setOpen(false);
    }
  }

  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[#a1a1aa] text-xs flex-shrink-0">
          <Calendar size={14} />
          <span className="font-medium">Período</span>
        </div>

        {/* Quick preset chips */}
        <div className="flex gap-1.5 flex-wrap">
          {presetOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => { setPreset(opt.key); setOpen(false); }}
              className={`chip whitespace-nowrap text-xs ${
                preset === opt.key
                  ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                  : 'bg-[#27272a] text-[#a1a1aa] border border-[#27272a]'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setOpen(o => !o)}
            className={`chip whitespace-nowrap text-xs ${
              preset === 'custom'
                ? 'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30'
                : 'bg-[#27272a] text-[#a1a1aa] border border-[#27272a]'
            }`}
          >
            Personalizado <ChevronDown size={12} className={`inline transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="flex-1" />

        {/* Current label */}
        <div className="text-xs text-[#71717a] capitalize flex-shrink-0">{label}</div>
      </div>

      {/* Custom range panel */}
      {open && (
        <div className="mt-3 pt-3 border-t border-[#27272a] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">De</label>
              <input
                type="date"
                className="input mt-1"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Até</label>
              <input
                type="date"
                className="input mt-1"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setOpen(false)} className="btn-ghost text-xs border border-[#27272a] px-3 py-1.5 flex items-center gap-1">
              <X size={14} /> Cancelar
            </button>
            <button
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper for pages that need just the date strings without the bar
export function useDateRange() {
  const { startDate, endDate } = useDateFilter();
  return { startDate, endDate };
}
