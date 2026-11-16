import type { CardState, Rating } from "./fsrs";

/** A stable identifier unique among content entities in a subject. */
export type ContentId = string;

/** Optional, informational origin of editable content. */
export interface Provenance {
  origin: "authored" | "imported" | "ai-generated";
  source?: string;
  /** UTC epoch milliseconds. */
  createdAt?: number;
}

/** The package manifest; its version applies to every package entry. */
export interface SubjectManifest {
  format: "cloudready-lap";
  version: 1;
  id: string;
  title: string;
  description: string;
  language: string;
  cover?: string;
}

/** The content.json document. */
export interface SubjectContent {
  topics: Topic[];
}

/** Shared identity and optional provenance for editable content. */
export interface ContentEntity {
  id: ContentId;
  provenance?: Provenance;
}

/** A topic containing an ordered, freely nestable collection of entries. */
export interface Topic extends ContentEntity {
  type: "topic";
  title: string;
  items: TopicItem[];
}

/** Entries can be moved between topics without changing their IDs. */
export type TopicItem = Topic | Lesson | ExerciseSet | FlashcardDeck;

/** A lesson authored as a single HTML document. */
export interface Lesson extends ContentEntity {
  type: "lesson";
  title: string;
  html: string;
}

/** An ordered collection of exercises. */
export interface ExerciseSet extends ContentEntity {
  type: "exercise-set";
  title: string;
  exercises: Exercise[];
}

/** An HTML choice with an ID unique within its exercise. */
export interface ExerciseChoice {
  id: string;
  html: string;
}

/** A single-answer multiple-choice exercise. */
export interface MultipleChoiceExercise extends ContentEntity {
  type: "multiple-choice";
  prompt: string;
  choices: ExerciseChoice[];
  correctChoiceId: string;
  referenceAnswer?: string;
}

/** A self-graded written-answer or fill-in-the-blank exercise. */
export interface SelfGradedExercise extends ContentEntity {
  type: "written-answer" | "fill-in-the-blank";
  prompt: string;
  referenceAnswer: string;
}

/** An exercise prompt and its grading information. */
export type Exercise = MultipleChoiceExercise | SelfGradedExercise;

/** A deck of individually authored cards. */
export interface FlashcardDeck extends ContentEntity {
  type: "flashcard-deck";
  title: string;
  cards: Flashcard[];
}

/** A card's front and back are HTML documents. */
export interface Flashcard extends ContentEntity {
  front: string;
  back: string;
}

/** Learner progress stored separately from subject content. */
export interface SubjectProgress {
  timezone: string;
  scheduler: "fsrs-6-default-v1";
  dailyLimit: Record<string, number>;
  introduced: Record<string, Record<string, number>>;
  lessons: Record<ContentId, LessonProgress>;
  exerciseSets: Record<ContentId, ExerciseSetProgress>;
  cards: Record<ContentId, FlashcardProgress>;
  deckTimeSpentSeconds: Record<ContentId, number>;
}

/** Current completion and accumulated active study time. */
export interface LessonProgress {
  completed: boolean;
  timeSpentSeconds: number;
}

/** Accumulated active study time and attempts, in chronological order. */
export interface ExerciseSetProgress {
  timeSpentSeconds: number;
  attempts: ExerciseAttempt[];
}

/** One attempt at a set; timestamps are UTC epoch milliseconds. */
export interface ExerciseAttempt {
  id: string;
  startedAt: number;
  finishedAt?: number;
  answers: ExerciseAnswer[];
}

/** A learner response and assessment; no question snapshot is stored. */
export interface ExerciseAnswer {
  exerciseId: ContentId;
  response: string;
  correct: boolean;
  answeredAt: number;
  note?: string;
}

/** Current FSRS state and chronological review history for one card. */
export interface FlashcardProgress {
  state: CardState;
  reviews: FlashcardReview[];
}

/** A review includes its previous state so it can be undone. */
export interface FlashcardReview {
  id: string;
  rating: Rating;
  reviewedAt: number;
  previous: CardState;
}
