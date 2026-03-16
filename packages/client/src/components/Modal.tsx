import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="animate-fade-in m-auto max-w-md rounded-xl border border-surface-500 bg-surface-700 p-0 text-white backdrop:bg-black/60"
    >
      <div className="p-5">
        {title && <h3 className="mb-3 text-lg font-bold text-accent-400">{title}</h3>}
        {children}
      </div>
    </dialog>
  );
}
