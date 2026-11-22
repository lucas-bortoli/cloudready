import { createContext, onSettled, useContext, type ParentProps } from "solid-js";
import { SessionRpcClient } from "../../lib/session-rpc/SessionRpcClient";

const SessionRpcContext = createContext<SessionRpcClient>();

/** Makes the generic kernel-session duplex available to the active desktop. */
export function SessionRpcProvider(props: ParentProps) {
  const client = new SessionRpcClient();
  onSettled(() => {
    client.start();
    return () => client.stop();
  });
  return <SessionRpcContext value={client}>{props.children}</SessionRpcContext>;
}

/** Gets the active generic kernel-session RPC client. */
export function useSessionRpc(): SessionRpcClient {
  const client = useContext(SessionRpcContext);
  if (!client) throw new Error("SessionRpcProvider is missing.");
  return client;
}
