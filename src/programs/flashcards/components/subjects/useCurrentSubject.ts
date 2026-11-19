import { createMemo } from "solid-js";
import { useNavigation } from "../../navigation/NavigationContext";
import { useSubjects } from "./SubjectsContext";

/** Resolves the open subject named by the current route. */
export function useCurrentSubjectEntry() {
  const navigation = useNavigation();
  const subjects = useSubjects();

  return createMemo(() => {
    const route = navigation.route();
    if (route.id === "/subjects/:subjectId" || route.id === "/subjects/:subjectId/items/:itemId") {
      return subjects.subjects().find((entry) => entry.path === route.subjectId);
    } else {
      return undefined;
    }
  });
}

/** Resolves the current route's package for content-only consumers. */
export function useCurrentSubject() {
  const entry = useCurrentSubjectEntry();
  return createMemo(() => entry()?.subject);
}
