import { useState, useRef, type ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = () => {
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setVisible(true), 300);
  };

  const hide = () => {
    clearTimeout(timeout.current);
    setVisible(false);
  };

  return (
    <div
      className="relative inline-block"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div className="animate-fade-in absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-surface-500 bg-surface-700 px-3 py-2 text-sm whitespace-nowrap shadow-lg">
          {content}
        </div>
      )}
    </div>
  );
}
