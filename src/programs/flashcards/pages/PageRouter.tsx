import { Match, Switch } from "solid-js";
import { useNavigation } from "../components/navigation/NavigationContext";
import ItemRoute from "./ItemRoute";
import SubjectPage from "./subject/SubjectPage";

/** Displays the page for the current route. */
export default function PageRouter() {
  const navigation = useNavigation();

  return (
    <Switch>
      <Match when={navigation.route().page === "home"}>
        <p>Open a LAP subject to start learning.</p>
      </Match>
      <Match when={navigation.route().page === "trash"}>
        <p>Trash</p>
      </Match>
      <Match when={navigation.route().page === "subject"}>
        <SubjectPage />
      </Match>
      <Match when={navigation.route().page === "item"}>
        <ItemRoute />
      </Match>
    </Switch>
  );
}
