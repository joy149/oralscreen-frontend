import { ReactLenis } from 'lenis/react';
import 'lenis/dist/lenis.css';

/**
 * Global smooth-scroll provider via Lenis.
 *
 * Wraps the app in <ReactLenis root> to normalise scroll behaviour across
 * devices. Respects the OS-level prefers-reduced-motion media query —
 * when reduced motion is active, Lenis is effectively disabled (duration 0).
 */
export default function SmoothScroll({ children }) {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        duration: 1.2,
        smoothWheel: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
