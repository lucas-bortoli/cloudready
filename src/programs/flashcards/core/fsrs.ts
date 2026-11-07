/** FSRS-6 uses a fixed 21-element weight vector. Its order is part of the model. */
export const DEFAULT_WEIGHTS = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

/** Numeric grades match Anki and the FSRS reference: Again, Hard, Good, Easy. */
export type Rating = 1 | 2 | 3 | 4;
/** Learning and relearning have distinct step sequences despite sharing memory equations. */
export type CardPhase = "new" | "learning" | "review" | "relearning";
/** Difficulty is dimensionless; stability is the interval in days at 90% recall. */
export interface MemoryState {
  difficulty: number;
  stability: number;
}
/** Persisted scheduler state; timestamps are milliseconds since the Unix epoch in UTC. */
export interface CardState extends MemoryState {
  phase: CardPhase;
  due: number;
  lastReview: number | null;
  step: number;
  repetitions: number;
  lapses: number;
  scheduledDays: number;
}
/** Model weights, retention, interval ceiling in days, and learning steps in minutes. */
export interface SchedulerParameters {
  weights: readonly number[];
  desiredRetention: number;
  maximumInterval: number;
  learningSteps: readonly number[];
  relearningSteps: readonly number[];
}
/** The prior state makes a review independently reversible without replaying the entire log. */
export interface ReviewResult {
  card: CardState;
  review: { rating: Rating; reviewedAt: number; previous: CardState };
}

/** The defaults are stored with progress because future models can change their weights. */
export const DEFAULT_PARAMETERS: SchedulerParameters = Object.freeze({
  weights: DEFAULT_WEIGHTS,
  desiredRetention: 0.9,
  maximumInterval: 36500,
  learningSteps: Object.freeze([1, 10]),
  relearningSteps: Object.freeze([10]),
});

/** Signals invalid data at the portable scheduling boundary. */
export class SchedulerInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SchedulerInputError";
  }
}

const day = 86_400_000;
const minute = 60_000;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
// Reference rounding keeps arithmetic reproducible across repeated serialize/load cycles.
const round = (value: number): number => Number(value.toFixed(8));

function validate(parameters: SchedulerParameters): void {
  const w = parameters.weights;
  if (
    w.length !== 21 ||
    w.some((n) => !Number.isFinite(n) || n < 0) ||
    w.slice(0, 4).some((n) => n < 0.001 || n > 100) ||
    w[4] < 1 ||
    w[4] > 10 ||
    w[20] < 0.1 ||
    w[20] > 0.8 ||
    !Number.isFinite(parameters.desiredRetention) ||
    parameters.desiredRetention <= 0 ||
    parameters.desiredRetention >= 1 ||
    !Number.isInteger(parameters.maximumInterval) ||
    parameters.maximumInterval < 1 ||
    parameters.maximumInterval > 36500 ||
    [...parameters.learningSteps, ...parameters.relearningSteps].some(
      (n) => !Number.isFinite(n) || n <= 0 || n >= 1440,
    )
  ) {
    throw new SchedulerInputError("Invalid FSRS parameters.");
  }
}

/**
 * Returns the probability of recall after an elapsed number of days.
 *
 * @throws {SchedulerInputError} If the inputs are outside the model's domain.
 */
export function retrievability(
  elapsedDays: number,
  stability: number,
  weights = DEFAULT_WEIGHTS,
): number {
  if (
    !Number.isFinite(elapsedDays) ||
    elapsedDays < 0 ||
    !Number.isFinite(stability) ||
    stability <= 0 ||
    weights.length !== 21 ||
    weights.some((n) => !Number.isFinite(n)) ||
    weights[20] <= 0
  ) {
    throw new SchedulerInputError("Invalid memory state or elapsed time.");
  }
  const decay = -weights[20];
  const factor = round(Math.exp(Math.log(0.9) / decay) - 1);
  return round(Math.pow(1 + (factor * elapsedDays) / stability, decay));
}

/**
 * Computes FSRS-6 difficulty and stability without mutating the prior state.
 * Elapsed time is measured in whole days, as in the pinned reference scheduler.
 *
 * @throws {SchedulerInputError} If a rating, state, parameter, or elapsed time is invalid.
 */
export function nextMemory(
  previous: MemoryState | null,
  elapsedDays: number,
  rating: Rating,
  parameters = DEFAULT_PARAMETERS,
): MemoryState {
  return calculateMemory(previous, elapsedDays, rating, parameters, false);
}

function calculateMemory(
  previous: MemoryState | null,
  elapsedDays: number,
  rating: Rating,
  parameters: SchedulerParameters,
  reviewState: boolean,
): MemoryState {
  validate(parameters);
  if (
    ![1, 2, 3, 4].includes(rating) ||
    !Number.isInteger(elapsedDays) ||
    elapsedDays < 0 ||
    (previous !== null &&
      (!Number.isFinite(previous.difficulty) ||
        previous.difficulty < 1 ||
        previous.difficulty > 10 ||
        !Number.isFinite(previous.stability) ||
        previous.stability < 0.001 ||
        previous.stability > 36500))
  ) {
    throw new SchedulerInputError("Invalid FSRS review input.");
  }
  const w = parameters.weights;
  const initialDifficulty = (grade: number) => round(w[4] - Math.exp((grade - 1) * w[5]) + 1);
  // Initial ratings seed a memory directly; later ratings update an existing model.
  if (previous === null)
    return {
      difficulty: clamp(initialDifficulty(rating), 1, 10),
      stability: Math.max(w[rating - 1], 0.1),
    };
  const { difficulty: d, stability: s } = previous;
  const delta = round((-w[6] * (rating - 3) * (10 - d)) / 9);
  const difficulty = clamp(round(w[7] * initialDifficulty(4) + (1 - w[7]) * (d + delta)), 1, 10);
  let stability: number;
  // Same-day learning has its own stability model; review cards use the review equations.
  if (elapsedDays === 0 && !reviewState) {
    const multiplier = Math.pow(s, -w[19]) * Math.exp(w[17] * (rating - 3 + w[18]));
    stability = round(
      clamp(s * (rating >= 3 ? Math.max(multiplier, 1) : multiplier), 0.001, 36500),
    );
  } else {
    const r = retrievability(elapsedDays, s, w);
    if (rating === 1) {
      // The lapse cap keeps the short-term relearning update from overestimating memory.
      const forgotten = round(
        clamp(
          w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]),
          0.001,
          36500,
        ),
      );
      stability = clamp(round(s / Math.exp(w[17] * w[18])), 0.001, forgotten);
    } else {
      stability = round(
        clamp(
          s *
            (1 +
              Math.exp(w[8]) *
                (11 - d) *
                Math.pow(s, -w[9]) *
                (Math.exp((1 - r) * w[10]) - 1) *
                (rating === 2 ? w[15] : 1) *
                (rating === 4 ? w[16] : 1)),
          0.001,
          36500,
        ),
      );
    }
  }
  return { difficulty, stability };
}

/** Creates an unreviewed card without consulting the clock. */
export function newCard(): CardState {
  return {
    phase: "new",
    due: 0,
    lastReview: null,
    difficulty: 0,
    stability: 0,
    step: 0,
    repetitions: 0,
    lapses: 0,
    scheduledDays: 0,
  };
}

/**
 * Schedules a rating at a UTC epoch-millisecond instant and returns its reversible review record.
 *
 * @throws {SchedulerInputError} If the card, timestamp, rating, or parameters are invalid.
 */
export function schedule(
  previous: CardState,
  rating: Rating,
  now: number,
  parameters = DEFAULT_PARAMETERS,
): ReviewResult {
  validate(parameters);
  if (
    !Number.isFinite(now) ||
    !["new", "learning", "review", "relearning"].includes(previous.phase) ||
    !Number.isInteger(previous.step) ||
    previous.step < 0 ||
    !Number.isInteger(previous.repetitions) ||
    previous.repetitions < 0 ||
    !Number.isInteger(previous.lapses) ||
    previous.lapses < 0 ||
    !Number.isFinite(previous.due) ||
    (previous.phase === "new"
      ? previous.lastReview !== null
      : previous.lastReview === null ||
        !Number.isFinite(previous.lastReview) ||
        now < previous.lastReview)
  ) {
    throw new SchedulerInputError("Invalid card state or review time.");
  }
  const elapsed = previous.lastReview === null ? 0 : Math.floor((now - previous.lastReview) / day);
  // Learning states use short-term updates even when a user returns days later, matching the reference.
  const memory = calculateMemory(
    previous.phase === "new" ? null : previous,
    previous.phase === "learning" || previous.phase === "relearning" ? 0 : elapsed,
    rating,
    parameters,
    previous.phase === "review",
  );
  let phase: CardPhase = "review",
    step = 0,
    delayMinutes = 0;
  const steps =
    previous.phase === "review" || previous.phase === "relearning"
      ? parameters.relearningSteps
      : parameters.learningSteps;
  if (rating === 1 && steps.length) {
    phase =
      previous.phase === "review" || previous.phase === "relearning" ? "relearning" : "learning";
    delayMinutes = steps[0];
  } else if (previous.phase !== "review" && rating === 2 && steps.length) {
    phase = previous.phase === "relearning" ? "relearning" : "learning";
    step = previous.step;
    delayMinutes =
      steps.length === 1 ? Math.round(steps[0] * 1.5) : Math.round((steps[0] + steps[1]) / 2);
  } else if (previous.phase !== "review" && rating === 3 && steps.length) {
    // Good advances a learning card; a new card is already at the first step.
    const index = previous.phase === "learning" ? previous.step + 2 : previous.step + 1;
    if (index < steps.length) {
      phase = previous.phase === "relearning" ? "relearning" : "learning";
      step = index;
      delayMinutes = steps[index];
    }
  }
  const decay = -parameters.weights[20];
  const factor = round(Math.exp(Math.log(0.9) / decay) - 1);
  const modifier = round((Math.pow(parameters.desiredRetention, 1 / decay) - 1) / factor);
  let scheduledDays =
    phase === "review"
      ? clamp(Math.round(memory.stability * modifier), 1, parameters.maximumInterval)
      : 0;
  if (previous.phase === "review" && rating !== 1) {
    // Adjacent choices remain ordered even when their rounded intervals coincide.
    const interval = (grade: Rating) =>
      clamp(
        Math.round(
          calculateMemory(previous, elapsed, grade, parameters, true).stability * modifier,
        ),
        1,
        parameters.maximumInterval,
      );
    const hard = Math.min(interval(2), interval(3));
    const good = Math.min(parameters.maximumInterval, Math.max(interval(3), hard + 1));
    scheduledDays =
      rating === 2
        ? hard
        : rating === 3
          ? good
          : Math.min(parameters.maximumInterval, Math.max(interval(4), good + 1));
  }
  const card: CardState = {
    ...memory,
    phase,
    step,
    scheduledDays,
    due: now + (scheduledDays ? scheduledDays * day : delayMinutes * minute),
    lastReview: now,
    repetitions: previous.repetitions + 1,
    lapses: previous.lapses + (previous.phase === "review" && rating === 1 ? 1 : 0),
  };
  return { card, review: { rating, reviewedAt: now, previous: { ...previous } } };
}
