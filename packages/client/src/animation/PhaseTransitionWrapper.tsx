import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PhaseTransitionWrapperProps {
  phaseKey: string;
  children: ReactNode;
}

export function PhaseTransitionWrapper({
  phaseKey,
  children,
}: PhaseTransitionWrapperProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phaseKey}
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '-100%', opacity: 0 }}
        transition={{
          duration: 0.4,
          ease: [0.4, 0, 0.2, 1],
        }}
        style={{ height: '100%', overflow: 'hidden' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
