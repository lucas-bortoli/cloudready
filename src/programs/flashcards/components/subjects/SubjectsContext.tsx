import { createContext, useContext, type ParentProps } from "solid-js";
import { createSubjectController } from "../../ui/createSubjectController";

const SubjectsContext = createContext<ReturnType<typeof createSubjectController>>();

/** Owns the subject files open in a Flashcards window. */
export function SubjectsProvider(props: ParentProps) {
  const subjects = createSubjectController();
  return <SubjectsContext.Provider value={subjects}>{props.children}</SubjectsContext.Provider>;
}

/** Returns the subjects owned by the nearest provider. */
export function useSubjects() {
  const subjects = useContext(SubjectsContext);
  if (!subjects) throw new Error("useSubjects must be used within a SubjectsProvider");
  return subjects;
}
