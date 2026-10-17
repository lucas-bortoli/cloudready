import { applyFairyDelta } from "./state";
import { createContext, createSignal, onCleanup, onMount, useContext, type JSX } from "solid-js";
import { useSessionRpc } from "../../components/session-rpc/SessionRpcContext";
import { useWindowManager } from "../../components/window-manager/WindowManagerContext";

export type FairyMessage = Readonly<{
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "complete" | "pending" | "failed";
}>;
export type FairyState = Readonly<{
  revision: number;
  phase: "awaiting-input" | "generating-text";
  messages: readonly FairyMessage[];
  queued: string | null;
  activity: string | null;
  connected: boolean;
}>;

type FairyContextValue = {
  state: () => FairyState;
  submit: (text: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
};

const FairyContext = createContext<FairyContextValue>();
const emptyState: FairyState = {
  revision: 0,
  phase: "awaiting-input",
  messages: [],
  queued: null,
  activity: null,
  connected: false,
};

/** Connects the desktop to the kernel-owned Fairy service. */
export function FairyProvider(props: { children: JSX.Element }) {
  const rpc = useSessionRpc();
  const windows = useWindowManager();
  const [state, setState] = createSignal<FairyState>(emptyState);

  const describe = () => {
    const active = windows.getWindows().find((entry) => !entry.isMinimized && !entry.isClosing);
    return {
      activeWindowTitle: active?.title ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  };
  const applyState = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const candidate = value as Partial<FairyState>;
    if (
      !Array.isArray(candidate.messages) ||
      typeof candidate.connected !== "boolean" ||
      typeof candidate.revision !== "number"
    )
      return;
    setState(candidate as FairyState);
  };
  const applyDelta = (value: unknown) => {
    const next = applyFairyDelta(state(), value);
    if (next) setState(next);
    else void rpc.call("fairy.subscribe", {}).catch(() => undefined);
  };
  const submit = async (text: string) => {
    await rpc.call("fairy.turn.submit", { text });
  };
  const retry = async (id: string) => {
    const message = state().messages.find((message) => message.id === id);
    if (message?.role === "user" && message.status === "failed") await submit(message.text);
  };

  onMount(() => {
    const removeDescribe = rpc.handle("fairy.session.describe", describe);
    const removeSnapshot = rpc.on("fairy.state.snapshot", applyState);
    const removeDelta = rpc.on("fairy.state.delta", applyDelta);
    void rpc.call("fairy.subscribe", {}).catch(() => undefined);
    onCleanup(() => {
      removeDescribe();
      removeSnapshot();
      removeDelta();
    });
  });

  return (
    <FairyContext.Provider value={{ state, submit, retry }}>{props.children}</FairyContext.Provider>
  );
}

/** Gets the active Fairy session facade. */
export function useFairy(): FairyContextValue {
  const fairy = useContext(FairyContext);
  if (!fairy) throw new Error("FairyProvider is missing.");
  return fairy;
}
