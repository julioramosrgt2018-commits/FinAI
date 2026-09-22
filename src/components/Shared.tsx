import { type ReactNode } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, message, confirmLabel = 'Excluir', onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-[#18181b] border border-[#27272a] rounded-2xl p-6 animate-fade-in">
        <h2 className="text-lg font-semibold text-white mb-2">{title}</h2>
        <p className="text-sm text-[#a1a1aa] mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 btn-ghost border border-[#27272a]">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 bg-[#ef4444] hover:bg-[#dc2626] text-white font-medium px-4 py-2.5 rounded-xl transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#27272a] flex items-center justify-center mb-4 text-[#71717a]">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
      {description && <p className="text-sm text-[#71717a] max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  );
}
