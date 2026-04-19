import { useEffect, useState } from 'react';

export type ToastVariant = 'default' | 'discovery';

interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
}

let toastId = 0;
let toastListener: ((msg: ToastMessage) => void) | null = null;

/** Fire-and-forget toast from anywhere */
export function showToast(text: string, opts: { variant?: ToastVariant } = {}) {
  toastListener?.({ id: ++toastId, text, variant: opts.variant ?? 'default' });
}

export function ToastContainer() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    toastListener = (msg) => {
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      }, 2000);
    };
    return () => {
      toastListener = null;
    };
  }, []);

  if (messages.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex flex-col items-center gap-2">
      {messages.map((msg) => (
        <div
          key={msg.id}
          data-variant={msg.variant}
          className="pointer-events-auto rounded-lg px-4 py-2"
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: msg.variant === 'discovery' ? 700 : 600,
            letterSpacing: msg.variant === 'discovery' ? '0.04em' : '0.02em',
            background:
              msg.variant === 'discovery'
                ? 'linear-gradient(180deg, rgb(var(--color-compound-rgb) / 0.2), rgb(var(--color-compound-rgb) / 0.1))'
                : 'var(--color-surface-800)',
            border:
              msg.variant === 'discovery'
                ? '1px solid var(--color-compound)'
                : '1px solid rgba(212, 168, 52, 0.3)',
            boxShadow:
              msg.variant === 'discovery'
                ? '0 0 24px rgb(var(--color-compound-rgb) / 0.4), var(--shadow-card)'
                : 'var(--shadow-card)',
            animation: 'slide-up 0.2s ease-out, fade-out 0.3s ease-in 1.7s forwards',
          }}
        >
          <span
            className="text-sm"
            style={{
              color:
                msg.variant === 'discovery'
                  ? 'var(--color-compound)'
                  : 'var(--color-accent-300)',
            }}
          >
            {msg.variant === 'discovery' ? '★ ' : ''}
            {msg.text}
          </span>
        </div>
      ))}
    </div>
  );
}
