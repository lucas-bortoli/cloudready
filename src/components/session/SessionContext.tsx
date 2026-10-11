import { createContext, createSignal, Match, onMount, Switch, useContext } from "solid-js";
import Desktop from "./Desktop";
import { SessionContextError, SessionExpiredError, SessionMissingError } from "./errors";
import Oobe from "./Oobe";
import ProfilePicker from "./ProfilePicker";
import { sessions, type UserProfile } from "./SessionClient";
import SessionLoadingScreen from "./SessionLoadingScreen";

type State = "loading" | "oobe" | "picker" | "active";

type SessionContextValue = {
  user: () => UserProfile;
  signOut: () => Promise<void>;
};

const MINIMUM_LOADING_DURATION = 4000;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => void;
};

const SessionContext = createContext<SessionContextValue>();

/** Gates the desktop behind the current local browser session. */
export function SessionProvider() {
  const [state, setState] = createSignal<State>("loading");
  const [activeUser, setActiveUser] = createSignal<UserProfile>();

  const transitionTo = (nextState: State) => {
    const documentWithTransitions = document as ViewTransitionDocument;
    if (!documentWithTransitions.startViewTransition || window.matchMedia(REDUCED_MOTION).matches) {
      setState(nextState);
      return;
    }
    documentWithTransitions.startViewTransition(() => setState(nextState));
  };

  const load = async (minimumLoadingDuration: Promise<void>) => {
    try {
      // The persistent HttpOnly cookie is sent automatically on this request.
      const user = await sessions.current();
      await minimumLoadingDuration;
      activate(user);
    } catch (error) {
      // Missing or expired sessions are normal entry states, not user-facing failures.
      if (!(error instanceof SessionMissingError || error instanceof SessionExpiredError)) return;

      const profiles = await sessions.profiles();
      await minimumLoadingDuration;
      transitionTo(profiles.length ? "picker" : "oobe");
    }
  };

  onMount(() => {
    const minimumLoadingDuration = new Promise<void>((resolve) => {
      window.setTimeout(resolve, MINIMUM_LOADING_DURATION);
    });
    void load(minimumLoadingDuration);
  });

  const activate = (user: UserProfile) => {
    setActiveUser(user);
    transitionTo("active");
  };

  const signOut = async () => {
    await sessions.end();
    setActiveUser();
    transitionTo("picker");
  };

  return (
    <Switch>
      <Match when={state() === "loading"} children={<SessionLoadingScreen />} />
      <Match when={state() === "oobe"} children={<Oobe onCreated={activate} />} />
      <Match when={state() === "picker"} children={<ProfilePicker onSelected={activate} />} />
      <Match
        when={state() === "active"}
        children={
          <SessionContext.Provider value={{ user: activeUser as () => UserProfile, signOut }}>
            <Desktop />
          </SessionContext.Provider>
        }
      />
    </Switch>
  );
}

/**
 * Returns the active local profile session.
 * @throws {SessionContextError} When no provider is present.
 */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new SessionContextError("SessionProvider is missing.");
  }
  return value;
}
