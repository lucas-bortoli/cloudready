import { createContext, useContext, type ParentProps } from "solid-js";
import { createSubjectController } from "../../ui/createSubjectController";

export const SubjectsContext = createContext<ReturnType<typeof createSubjectController> | null>(
  null,
);

/** Owns the subject files open in a Flashcards window. */
export function SubjectsProvider(props: ParentProps) {
  const subjects = createSubjectController();
  return <SubjectsContext value={subjects}>{props.children}</SubjectsContext>;
}

/** Returns the subjects owned by the nearest provider. */
export function useSubjects() {
  const subjects = useContext(SubjectsContext);
  if (!subjects) throw new Error("useSubjects must be used within a SubjectsProvider");
  return subjects;
}
