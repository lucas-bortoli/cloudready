import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";
import type { Model } from "./model/model";

const KodekaiContext = createContext<Accessor<Model>>();

export interface KodekaiProviderProps {
  model: Model;
}

export class KodekaiContextError extends Error {}

/** Supplies Kodekai's data model to its interface. */
export function KodekaiProvider(props: ParentProps<KodekaiProviderProps>) {
  const [revision, setRevision] = createSignal(0);
  const model = createMemo(
    () => {
      revision();
      return props.model;
    },
    undefined,
    { equals: false },
  );

  createEffect(() => {
    console.debug("[Kodekai] subscribing to model changes");
    const unsubscribe = props.model.subscribe(() => {
      console.debug("[Kodekai] model changed; refreshing consumers");
      setRevision((current) => current + 1);
    });
    onCleanup(() => {
      console.debug("[Kodekai] unsubscribing from model changes");
      unsubscribe();
    });
  });

  return <KodekaiContext.Provider value={model}>{props.children}</KodekaiContext.Provider>;
}

/**
 * Returns an accessor for the model supplied by the nearest {@link KodekaiProvider}.
 *
 * @throws {KodekaiContextError} If no Kodekai provider is present.
 */
export function useKodekai(): Accessor<Model> {
  const model = useContext(KodekaiContext);
  if (!model) throw new KodekaiContextError("KodekaiProvider is missing.");
  return model;
}
