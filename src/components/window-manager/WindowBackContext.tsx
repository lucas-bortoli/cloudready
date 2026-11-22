import { createContext, createSignal, onSettled, useContext, type ParentProps } from "solid-js";

interface BackAction {
  available: () => boolean;
  run: () => void;
}

interface WindowBack {
  register: (slot: "history" | "dismiss", action: BackAction) => () => void;
  available: () => boolean;
  registered: () => boolean;
  run: () => void;
}

const Context = createContext<WindowBack | null>(null);

/** Shares the titlebar Back action with one window's content. */
export function WindowBackProvider(props: ParentProps) {
  const [history, setHistory] = createSignal<BackAction>();
  const [dismiss, setDismiss] = createSignal<BackAction>();
  const register = (slot: "history" | "dismiss", action: BackAction) => {
    const setter = slot === "history" ? setHistory : setDismiss;
    setter(() => action);
    return () => setter((current) => (current === action ? undefined : current));
  };
  const available = () => !!dismiss()?.available() || !!history()?.available();
  const registered = () => !!history() || !!dismiss();
  const run = () => {
    if (dismiss()?.available()) dismiss()?.run();
    else if (history()?.available()) history()?.run();
  };
  return <Context value={{ register, available, registered, run }}>{props.children}</Context>;
}

/** Registers a Back action for the current window when one is available. */
export function useWindowBack(slot: "history" | "dismiss", action: BackAction) {
  const back = useContext(Context);
  onSettled(() => back?.register(slot, action));
}

/** Returns the Back controller for the surrounding window. */
export function useWindowBackController() {
  return useContext(Context);
}
