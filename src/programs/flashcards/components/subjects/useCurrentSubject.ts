import { createMemo } from "solid-js";
import { useNavigation } from "../../navigation/NavigationContext";
import { useSubjects } from "./SubjectsContext";

/** Resolves the open subject named by the current route. */
export function useCurrentSubject() {
  const navigation = useNavigation();
  const subjects = useSubjects();

  return createMemo(() => {
    const route = navigation.route();
    if (route.id === "/subjects/:subjectId" || route.id === "/subjects/:subjectId/items/:itemId") {
      return subjects.subjects().find((entry) => entry.path === route.subjectId)?.subject;
    } else {
      return undefined;
    }
  });
}
