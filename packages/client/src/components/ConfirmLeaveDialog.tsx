import { Modal } from './Modal';

interface ConfirmLeaveDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  variant?: 'match' | 'queue';
}

export function ConfirmLeaveDialog({ open, onClose, onConfirm, variant = 'match' }: ConfirmLeaveDialogProps) {
  const body = variant === 'queue'
    ? "You're searching for an opponent. Leaving will cancel matchmaking."
    : "You're in an active game. Leaving will forfeit the match.";

  return (
    <Modal open={open} onClose={onClose} title="Leave match?">
      <p className="mb-4 text-sm text-surface-300">{body}</p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-surface-500 bg-surface-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-surface-500"
        >
          Stay
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
        >
          Leave
        </button>
      </div>
    </Modal>
  );
}
