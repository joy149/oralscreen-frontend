/**
 * React Router v6 prints a future-flag warning to stderr on every render unless the v7
 * opt-ins are set. Passing this to each MemoryRouter keeps the test output readable and
 * matches what the app will do on upgrade.
 */
export const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};
