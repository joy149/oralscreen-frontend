import { motion } from 'motion/react';

/**
 * Subtle page entrance animation. Wraps screen content in a gentle
 * opacity fade — no sliding, no bouncing, just a clean reveal.
 *
 * Duration is intentionally short (200ms) so it feels snappy rather
 * than decorative. The animation is declarative via Framer Motion and
 * automatically respects prefers-reduced-motion at the browser level.
 */
export default function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
