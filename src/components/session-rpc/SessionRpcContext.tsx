import { createContext, onCleanup, onMount, useContext, type JSX } from "solid-js";
import { SessionRpcClient } from "../../lib/session-rpc/SessionRpcClient";

const SessionRpcContext = createContext<SessionRpcClient>();

/** Makes the generic kernel-session duplex available to the active desktop. */
export function SessionRpcProvider(props: { children: JSX.Element }) {
  const client = new SessionRpcClient();
  onMount(() => client.start());
  onCleanup(() => client.stop());
  return <SessionRpcContext.Provider value={client}>{props.children}</SessionRpcContext.Provider>;
}

/** Gets the active generic kernel-session RPC client. */
export function useSessionRpc(): SessionRpcClient {
  const client = useContext(SessionRpcContext);
  if (!client) throw new Error("SessionRpcProvider is missing.");
  return client;
}
