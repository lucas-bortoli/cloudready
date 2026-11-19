# Flashcards app

This app opens Learning Application Package (LAP) subjects and displays their
content. Follow the repository-wide `AGENTS.md` as well as these app-specific
conventions.

## Structure

- `Flashcards.tsx` composes the window, sidebar, providers, and page router.
- `navigation/` owns route state and the route types. `pages/PageRouter.tsx`
  selects the page and resolves the selected subject item.
- `pages/` mirrors the pathname hierarchy. Each page has its own kebab-case
  directory; child pages live in their parent route's `pages/` directory. Route
  segments that group child pages can have a directory without a page component.
  Put page-specific components and resources in that page's directory.
- `components/` holds UI and context shared beyond a single page. Subject state
  and the route-derived current subject are in `components/subjects/`.
- `ui/` contains controllers that connect app state and services to the UI.
- `core/` contains the learning model, package I/O, scheduling, and other logic
  independent of the CloudReady UI. `core/subject-package/README.md` documents
  LAP package I/O and resource ownership.
- `browser/` contains browser-specific persistence, rendering, media, and worker
  integration. `README.md` documents the existing flashcard implementation.

The page hierarchy is currently:

```text
pages/
  PageRouter.tsx
  home/HomePage.tsx
  trash/TrashPage.tsx
  unavailable/UnavailablePage.tsx
  subjects/
    SubjectPage.tsx
    pages/items/pages/
      topic/TopicPage.tsx
      lesson/LessonPage.tsx
      exercise-set/ExerciseSetPage.tsx
      flashcard-deck/FlashcardDeckPage.tsx
```

## Routing and content

- Route IDs in `navigation/NavigationContext.tsx` are pathname patterns. Their
  `:parameter` names determine the required fields of the `Route` type. Add a
  route there and handle it in `PageRouter` when adding a page.
- The current `subjectId` is the open subject's file path. Resolve the current
  subject with `useCurrentSubject`; keep subject-specific lookup out of the
  navigation context.
- Treat package content as untrusted. Preserve sanitization, sandboxing, CSP,
  and object URL cleanup when changing lesson or card rendering.
- Consult `LEARNING-PROGRAM.md` and `LEARNING-PROGRAM-DECISIONS.md` when changing
  the LAP data model or its behavior.

## Verification

Use the repository's npm scripts and focused tests relevant to the change.
Browser tests for the lesson fixture are in `tests/lap-browser.spec.ts` at the
repository root; update their fixture path if it moves.
