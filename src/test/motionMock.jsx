import { createElement, forwardRef } from 'react';

/**
 * Stand-in for `motion/react`.
 *
 * Two reasons the real library can't be used under test:
 *  - jsdom has no layout or animation frames, so nothing ever animates and assertions on
 *    animated values are meaningless.
 *  - `AnimatePresence` keeps an exiting element mounted until its exit animation finishes.
 *    Under fake timers that never happens, so a dismissed toast would stay in the DOM
 *    forever and every removal assertion would fail for a reason that has nothing to do
 *    with the component's logic.
 *
 * Animation props are dropped; everything else (className, role, onClick, children) passes
 * through to a plain DOM element, which is what the tests actually assert on.
 */
const ANIMATION_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileInView',
  'whileDrag',
  'layout',
  'layoutId',
  'drag',
  'onAnimationComplete',
  'viewport',
]);

function stripAnimationProps(props) {
  const rest = {};
  for (const [key, value] of Object.entries(props)) {
    if (!ANIMATION_PROPS.has(key)) rest[key] = value;
  }
  return rest;
}

const componentCache = new Map();

function motionComponent(tag) {
  if (!componentCache.has(tag)) {
    const Component = forwardRef((props, ref) =>
      createElement(tag, { ...stripAnimationProps(props), ref })
    );
    Component.displayName = `motion.${tag}`;
    componentCache.set(tag, Component);
  }
  return componentCache.get(tag);
}

export const motion = new Proxy(
  {},
  {
    get: (_target, tag) => motionComponent(tag),
  }
);

export function AnimatePresence({ children }) {
  return children;
}

export const useReducedMotion = () => false;
