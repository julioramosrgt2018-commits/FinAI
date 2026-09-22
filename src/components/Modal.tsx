import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  const maxW = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxW} bg-[#18181b] border border-[#27272a] rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto animate-slide-up`}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[#18181b] border-b border-[#27272a]">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#27272a] rounded-lg transition-colors">
            <X size={20} className="text-[#a1a1aa]" />
          </button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
