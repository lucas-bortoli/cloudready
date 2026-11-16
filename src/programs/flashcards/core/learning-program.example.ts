import type { CardState } from "./fsrs";
import type { SubjectContent, SubjectManifest, SubjectProgress } from "./learning-program";

/** A subject manifest with an embedded cover. */
export const exampleManifest: SubjectManifest = {
  format: "cloudready-lap",
  version: 1,
  id: "spanish",
  title: "Spanish",
  description: "Greetings",
  language: "en",
  cover: "assets/cover.svg",
};

/** Example content covering the v1 entry and exercise types. */
export const exampleContent: SubjectContent = {
  topics: [
    {
      type: "topic",
      id: "greetings",
      title: "Greetings",
      items: [
        {
          type: "lesson",
          id: "hello",
          title: "Hello",
          provenance: { origin: "authored" },
          html: '<p>Hola! <a href="lap:item/practice">Practice</a> <img src="assets/cover.svg" alt="Cover"></p>',
        },
        {
          type: "topic",
          id: "practice-topic",
          title: "Practice",
          items: [
            {
              type: "exercise-set",
              id: "practice",
              title: "Practice",
              exercises: [
                {
                  type: "multiple-choice",
                  id: "choice",
                  prompt: "<p>Hello?</p>",
                  choices: [{ id: "hola", html: "<b>Hola</b>" }],
                  correctChoiceId: "hola",
                },
                {
                  type: "written-answer",
                  id: "written",
                  prompt: "<p>Translate hello.</p>",
                  referenceAnswer: "<p>Hola</p>",
                },
                {
                  type: "fill-in-the-blank",
                  id: "blank",
                  prompt: "<p>H_la</p>",
                  referenceAnswer: "<p>o</p>",
                },
              ],
            },
            {
              type: "flashcard-deck",
              id: "deck",
              title: "Cards",
              provenance: { origin: "imported", source: "Anki" },
              cards: [
                {
                  id: "card",
                  front: "<p>Hello</p>",
                  back: '<p>Hola</p><audio controls src="assets/hello.mp3"></audio>',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const state: CardState = {
  phase: "new",
  due: 0,
  lastReview: null,
  step: 0,
  repetitions: 0,
  lapses: 0,
  scheduledDays: 0,
  difficulty: 0,
  stability: 0,
};

/** Progress also retains records for content that has been deleted. */
export const exampleProgress: SubjectProgress = {
  timezone: "UTC",
  scheduler: "fsrs-6-default-v1",
  dailyLimit: {},
  introduced: {},
  lessons: {
    hello: { completed: true, timeSpentSeconds: 180 },
    deleted: { completed: false, timeSpentSeconds: 20 },
  },
  exerciseSets: {
    practice: {
      timeSpentSeconds: 30,
      attempts: [
        {
          id: "attempt",
          startedAt: 1000,
          finishedAt: 2000,
          answers: [
            {
              exerciseId: "choice",
              response: "hola",
              correct: true,
              answeredAt: 1500,
              note: "Remember this.",
            },
          ],
        },
      ],
    },
  },
  cards: {
    card: { state, reviews: [{ id: "review", rating: 3, reviewedAt: 3000, previous: state }] },
  },
  deckTimeSpentSeconds: { deck: 60 },
};

/** An empty subject and a shareable package omit progress. */
export const emptySubject: {
  manifest: SubjectManifest;
  content: SubjectContent;
  progress?: SubjectProgress;
} = {
  manifest: {
    format: "cloudready-lap",
    version: 1,
    id: "empty",
    title: "Untitled",
    description: "",
    language: "en",
  },
  content: { topics: [] },
};
/** The content-only package can be shared without learner progress. */
export const sharedSubject = { manifest: exampleManifest, content: exampleContent };
