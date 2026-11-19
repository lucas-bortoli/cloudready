import { createContext, createSignal, useContext, type ParentProps } from "solid-js";

type RouteId = "/" | "/trash" | "/subjects/:subjectId" | "/subjects/:subjectId/items/:itemId";

type RouteParams<Path extends string> = Path extends `${string}:${infer Param}/${infer Rest}`
  ? { [Key in Param | keyof RouteParams<`/${Rest}`>]: string }
  : Path extends `${string}:${infer Param}`
    ? { [Key in Param]: string }
    : unknown;

/** A location within the Flashcards application. */
export type Route = { [Id in RouteId]: { id: Id } & RouteParams<Id> }[RouteId];

function createNavigation() {
  const [route, navigate] = createSignal<Route>({ id: "/" });
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
