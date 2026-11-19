import { createContext, createSignal, useContext, type ParentProps } from "solid-js";

/** A location within the Flashcards application. */
export type Route =
  | { page: "home" }
  | { page: "trash" }
  | { page: "subject"; subjectPath: string }
  | { page: "item"; subjectPath: string; itemId: string };

function createNavigation() {
  const [route, navigate] = createSignal<Route>({ page: "home" });
  return { route, navigate };
}

const NavigationContext = createContext<ReturnType<typeof createNavigation>>();

/** Provides navigation state to one Flashcards window. */
export function NavigationProvider(props: ParentProps) {
  const navigation = createNavigation();
  return (
    <NavigationContext.Provider value={navigation}>{props.children}</NavigationContext.Provider>
  );
}

/** Returns the navigation state for the current window. */
export function useNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("useNavigation must be used within a NavigationProvider");
  return navigation;
}
