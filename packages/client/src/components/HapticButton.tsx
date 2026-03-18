import { type ButtonHTMLAttributes } from 'react';
import { useHaptic } from '@/hooks/useHaptic';
import { playSound } from '@/shared/utils/sound-manager';

interface HapticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  hapticStyle?: 'light' | 'medium' | 'heavy';
  size?: 'sm' | 'md' | 'lg';
}

const VARIANT_STYLES: Record<string, string> = {
  primary: [
    'text-surface-900 font-bold',
    'bg-gradient-to-b from-accent-400 to-accent-500',
    'hover:from-accent-300 hover:to-accent-400',
    'active:from-accent-500 active:to-accent-500',
    'shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)]',
    'hover:shadow-[0_4px_16px_rgba(212,168,52,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]',
    'active:shadow-[0_1px_4px_rgba(0,0,0,0.5)]',
  ].join(' '),
  secondary: [
    'text-white font-semibold',
    'bg-surface-700 border border-surface-500',
    'hover:bg-surface-600 hover:border-surface-400',
    'hover:shadow-[0_0_12px_rgba(45,212,191,0.15)]',
    'active:bg-surface-700',
  ].join(' '),
  danger: [
    'text-white font-bold',
    'bg-gradient-to-b from-danger to-red-600',
    'hover:from-red-400 hover:to-danger',
    'shadow-[0_4px_12px_rgba(0,0,0,0.5)]',
  ].join(' '),
};

const SIZE_CLASSES: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-5 py-2.5 rounded-lg',
  lg: 'px-6 py-3 text-lg rounded-lg',
};

export function HapticButton({
  variant = 'primary',
  hapticStyle = 'light',
  size = 'md',
  onClick,
  className = '',
  children,
  ...props
}: HapticButtonProps) {
  const haptic = useHaptic();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    haptic(hapticStyle);
    playSound('buttonClick');
    onClick?.(e);
  };

  return (
    <button
      onClick={handleClick}
      className={`active:translate-y-px active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${SIZE_CLASSES[size]} ${VARIANT_STYLES[variant]} ${className}`}
      style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.03em' }}
      {...props}
    >
      {children}
    </button>
  );
}
