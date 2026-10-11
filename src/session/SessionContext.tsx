import {
  createContext,
  createSignal,
  Match,
  onMount,
  Switch,
  useContext,
  type ParentProps,
} from "solid-js";
import { SessionContextError, SessionExpiredError, SessionMissingError } from "./errors";
import Oobe from "./Oobe";
import ProfilePicker from "./ProfilePicker";
import { sessions, type UserProfile } from "./SessionClient";

type State = "loading" | "oobe" | "picker" | "active";

type SessionContextValue = {
  user: () => UserProfile;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>();

const Loading = () => {
  return (
    <div x-role="session loading screen" class="h-full w-full bg-neutral-600 text-neutral-100">
      Loading...
    </div>
  );
};

/** Gates the desktop behind the current local browser session. */
export function SessionProvider(props: ParentProps) {
  const [state, setState] = createSignal<State>("loading");
  const [activeUser, setActiveUser] = createSignal<UserProfile>();

  const load = async () => {
    try {
      // The persistent HttpOnly cookie is sent automatically on this request.
      setActiveUser(await sessions.current());
      setState("active");
    } catch (error) {
      // Missing or expired sessions are normal entry states, not user-facing failures.
      if (!(error instanceof SessionMissingError || error instanceof SessionExpiredError)) {
        return;
      }

      const profiles = await sessions.profiles();
      setState(profiles.length ? "picker" : "oobe");
    }
  };

  onMount(() => {
    void load();
  });

  const activate = (user: UserProfile) => {
    setActiveUser(user);
    setState("active");
  };

  const signOut = async () => {
    await sessions.end();
    setActiveUser();
    setState("picker");
  };

  return (
    <Switch>
      <Match when={state() === "loading"} children={<Loading />} />
      <Match when={state() === "oobe"} children={<Oobe onCreated={activate} />} />
      <Match when={state() === "picker"} children={<ProfilePicker onSelected={activate} />} />
      <Match
        when={state() === "active"}
        children={
          <SessionContext.Provider
            value={{ user: activeUser as () => UserProfile, signOut }}
            children={props.children}
          />
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
