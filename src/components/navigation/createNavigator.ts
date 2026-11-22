import { createSignal } from "solid-js";

/** One visit to an application route and its optional saved state. */
export interface NavigationEntry<Route, State> {
  id: number;
  route: Route;
  state?: State;
}

/** Creates an in-memory navigation history for one application window. */
export function createNavigator<Route, State = unknown>(initialRoute: Route) {
  let nextId = 1;
  let guard: ((from: Route, to: Route) => boolean) | undefined;
  const [entries, setEntries] = createSignal<NavigationEntry<Route, State>[]>([
    { id: 0, route: initialRoute },
  ]);
  const entry = () => entries()[entries().length - 1];
  const route = () => entry().route;
  const canGoBack = () => entries().length > 1;
  const allowed = (destination: Route) => !guard || guard(route(), destination);

  const push = (destination: Route) => {
    if (!allowed(destination)) return false;
    setEntries((history) => [...history, { id: nextId++, route: destination }]);
    return true;
  };
  const replace = (destination: Route) => {
    if (!allowed(destination)) return false;
    setEntries((history) => [...history.slice(0, -1), { id: nextId++, route: destination }]);
    return true;
  };
  const goBack = () => {
    const history = entries();
    if (history.length < 2 || !allowed(history[history.length - 2].route)) return false;
    setEntries(history.slice(0, -1));
    return true;
  };
  const setEntryState = (state: State) => {
    setEntries((history) => [...history.slice(0, -1), { ...history[history.length - 1], state }]);
  };
  const registerLeaveGuard = (handler: (from: Route, to: Route) => boolean) => {
    guard = handler;
    return () => {
      if (guard === handler) guard = undefined;
    };
  };
  return { entry, route, canGoBack, push, replace, goBack, setEntryState, registerLeaveGuard };
}
