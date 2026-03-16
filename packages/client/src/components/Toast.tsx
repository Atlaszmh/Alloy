import { useEffect, useState } from 'react';

interface ToastMessage {
  id: number;
  text: string;
}

let toastId = 0;
let toastListener: ((msg: ToastMessage) => void) | null = null;

/** Fire-and-forget toast from anywhere */
export function showToast(text: string) {
  toastListener?.({ id: ++toastId, text });
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
          className="pointer-events-auto rounded-lg border border-accent-500/30 bg-surface-800/95 px-4 py-2 shadow-card"
          style={{
            fontFamily: 'var(--font-family-display)',
            fontWeight: 600,
            letterSpacing: '0.02em',
            animation: 'slide-up 0.2s ease-out, fade-out 0.3s ease-in 1.7s forwards',
          }}
        >
          <span className="text-sm text-accent-300">{msg.text}</span>
        </div>
      ))}
    </div>
  );
}
