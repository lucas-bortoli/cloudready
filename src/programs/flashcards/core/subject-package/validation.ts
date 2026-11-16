import * as v from "valibot";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import type { TopicItem } from "../learning-program";
import {
  InvalidSubjectDataError,
  SubjectResourceLimitError,
  UnsupportedSubjectFormatError,
} from "./errors";
import {
  DEFAULT_SUBJECT_LIMITS,
  type SubjectLimits,
  type SubjectPackageOptions,
  type SubjectReferenceWarning,
  type WritableSubject,
} from "./types";

const id = v.pipe(v.string(), v.minLength(1));
const finite = v.pipe(v.number(), v.finite());
const nonnegative = v.pipe(finite, v.minValue(0));
const integer = v.pipe(nonnegative, v.safeInteger());
const provenance = v.optional(
  v.strictObject({
    origin: v.picklist(["authored", "imported", "ai-generated"]),
    source: v.optional(v.string()),
    createdAt: v.optional(integer),
  }),
);
const entity = { id, provenance };
const choice = v.strictObject({ id, html: v.string() });
const exercise = v.variant("type", [
  v.strictObject({
    ...entity,
    type: v.literal("multiple-choice"),
    prompt: v.string(),
    choices: v.pipe(v.array(choice), v.minLength(1)),
    correctChoiceId: id,
    referenceAnswer: v.optional(v.string()),
  }),
  v.strictObject({
    ...entity,
    type: v.literal("written-answer"),
    prompt: v.string(),
    referenceAnswer: v.string(),
  }),
  v.strictObject({
    ...entity,
    type: v.literal("fill-in-the-blank"),
    prompt: v.string(),
    referenceAnswer: v.string(),
  }),
]);
const card = v.strictObject({ ...entity, front: v.string(), back: v.string() });
const item: v.GenericSchema<TopicItem> = v.lazy(() =>
  v.variant("type", [
    v.strictObject({
      ...entity,
      type: v.literal("topic"),
      title: v.string(),
      items: v.array(item),
    }),
    v.strictObject({ ...entity, type: v.literal("lesson"), title: v.string(), html: v.string() }),
    v.strictObject({
      ...entity,
      type: v.literal("exercise-set"),
      title: v.string(),
      exercises: v.array(exercise),
    }),
    v.strictObject({
      ...entity,
      type: v.literal("flashcard-deck"),
      title: v.string(),
      cards: v.array(card),
    }),
  ]),
);
const manifest = v.strictObject({
  format: v.literal("cloudready-lap"),
  version: v.literal(1),
  id,
  title: v.string(),
  description: v.string(),
  language: v.pipe(
    id,
    v.check((value) => {
      try {
        return Intl.getCanonicalLocales(value).length === 1;
      } catch {
        return false;
      }
    }),
  ),
  cover: v.optional(id),
});
const state = v.pipe(
  v.strictObject({
    phase: v.picklist(["new", "learning", "review", "relearning"]),
    due: integer,
    lastReview: v.nullable(integer),
    step: integer,
    repetitions: integer,
    lapses: integer,
    scheduledDays: integer,
    difficulty: nonnegative,
    stability: nonnegative,
  }),
  v.check((s) =>
    s.phase === "new"
      ? s.lastReview === null &&
        s.repetitions === 0 &&
        s.lapses === 0 &&
        s.step === 0 &&
        s.scheduledDays === 0 &&
        s.difficulty === 0 &&
        s.stability === 0
      : s.lastReview !== null &&
        s.repetitions >= 1 &&
        s.lapses <= s.repetitions &&
        s.stability >= 0.001 &&
        s.difficulty >= 1 &&
        s.difficulty <= 10,
  ),
);
const answer = v.strictObject({
  exerciseId: id,
  response: v.string(),
  correct: v.boolean(),
  answeredAt: integer,
  note: v.optional(v.string()),
});
const attempt = v.strictObject({
  id,
  startedAt: integer,
  finishedAt: v.optional(integer),
  answers: v.array(answer),
});
const review = v.strictObject({
  id,
  rating: v.union([v.literal(1), v.literal(2), v.literal(3), v.literal(4)]),
  reviewedAt: integer,
  previous: state,
});
const progress = v.strictObject({
  timezone: v.pipe(
    id,
    v.check((zone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }),
  ),
  scheduler: v.literal("fsrs-6-default-v1"),
  dailyLimit: v.record(id, v.pipe(integer, v.maxValue(9999))),
  introduced: v.record(id, v.record(id, integer)),
  lessons: v.record(id, v.strictObject({ completed: v.boolean(), timeSpentSeconds: nonnegative })),
  exerciseSets: v.record(
    id,
    v.strictObject({ timeSpentSeconds: nonnegative, attempts: v.array(attempt) }),
  ),
  cards: v.record(id, v.strictObject({ state, reviews: v.array(review) })),
  deckTimeSpentSeconds: v.record(id, nonnegative),
});

/**
 * Resolves positive safe-integer implementation limits.
 *
 * @param options Optional limit overrides.
 * @returns The complete set of effective limits.
 * @throws {InvalidSubjectDataError} If a limit is invalid.
 */
export function subjectLimits(options: SubjectPackageOptions = {}): SubjectLimits {
  const limits = { ...DEFAULT_SUBJECT_LIMITS, ...options.limits };
  if (Object.values(limits).some((n) => !Number.isSafeInteger(n) || n <= 0))
    throw new InvalidSubjectDataError("Limits must be positive safe integers.");
  return limits;
}

/**
 * Requires canonical, unencoded archive paths; directory markers end in a slash.
 *
 * @param path Archive-root path to validate.
 * @param directory Whether the path describes a directory marker.
 * @throws {InvalidSubjectDataError} If the path is unsafe or unsupported.
 */
export function validateSubjectPath(path: string, directory = false): void {
  const canonical = directory ? path.slice(0, -1) : path;
  if (
    !canonical ||
    /[\\%?#:]/.test(canonical) ||
    canonical.split("/").some((p) => !p || p === "." || p === "..") ||
    (directory && !path.endsWith("/")) ||
    !(
      canonical.startsWith("assets/") ||
      (directory && canonical === "assets") ||
      (!directory && ["manifest.json", "content.json", "progress.json"].includes(canonical))
    )
  )
    throw new InvalidSubjectDataError(`Invalid package path: ${path}`);
}

function preflight(value: unknown, maxDepth: number): void {
  const active = new Set<object>();
  const stack: Array<{ value: unknown; depth: number; exit?: boolean }> = [{ value, depth: 0 }];
  while (stack.length) {
    const current = stack.pop()!;
    if (!current.value || typeof current.value !== "object") continue;
    if (current.exit) {
      active.delete(current.value);
      continue;
    }
    if (active.has(current.value)) throw new InvalidSubjectDataError("Cyclic subject data.");
    // Each topic contributes an object plus an array; allow fixed wrapper overhead.
    if (current.depth > maxDepth * 2 + 20)
      throw new SubjectResourceLimitError("Subject structure is too deeply nested.");
    if (
      Object.keys(current.value).some((key) =>
        ["__proto__", "constructor", "prototype"].includes(key),
      )
    )
      throw new InvalidSubjectDataError("Reserved object key in subject data.");
    active.add(current.value);
    stack.push({ ...current, exit: true });
    for (const child of Object.values(current.value))
      stack.push({ value: child, depth: current.depth + 1 });
  }
}

/**
 * Validates document shapes and relationships without executing or changing HTML.
 * Returns warnings for unresolved content references. Deleted progress is retained.
 *
 * @param subject Documents and asset descriptors to validate without mutation.
 * @param options Optional processing limits; validation is synchronous.
 * @returns Warnings for missing embedded assets or internal link targets.
 * @throws {InvalidSubjectDataError} If data violates the v1 model.
 * @throws {UnsupportedSubjectFormatError} If the format or version is unsupported.
 * @throws {SubjectResourceLimitError} If a configured bound is exceeded.
 */
export function validateSubject(
  subject: WritableSubject,
  options: SubjectPackageOptions = {},
): SubjectReferenceWarning[] {
  const limits = subjectLimits(options);
  preflight(
    { manifest: subject.manifest, content: subject.content, progress: subject.progress },
    limits.topicDepth,
  );
  if (subject.manifest?.format !== "cloudready-lap" || subject.manifest?.version !== 1)
    throw new UnsupportedSubjectFormatError("Unsupported LAP format or version.");
  for (const [schema, value] of [
    [manifest, subject.manifest],
    [v.strictObject({ topics: v.array(item) }), subject.content],
    ...(subject.progress === undefined ? [] : [[progress, subject.progress]]),
  ] as const) {
    const parsed = v.safeParse(schema as v.GenericSchema, value);
    if (!parsed.success) throw new InvalidSubjectDataError(v.summarize(parsed.issues));
  }
  if (subject.content.topics.some((topic) => topic.type !== "topic"))
    throw new InvalidSubjectDataError("Top-level entries must be topics.");
  if (subject.assets.size + 2 + (subject.progress ? 1 : 0) > limits.entries)
    throw new SubjectResourceLimitError("Too many package entries.");
  for (const [path, asset] of subject.assets) {
    validateSubjectPath(path);
    const components = path.split("/");
    while (components.length > 1) {
      components.pop();
      if (subject.assets.has(components.join("/")))
        throw new InvalidSubjectDataError("An asset file cannot contain another asset.");
    }
    if (
      !path.startsWith("assets/") ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 0 ||
      typeof asset.openStream !== "function"
    )
      throw new InvalidSubjectDataError(`Invalid asset: ${path}`);
  }
  const ids = new Set<string>();
  const targets = new Set<string>();
  const html: Array<[string, string]> = [];
  const add = (value: string) => {
    if (ids.has(value)) throw new InvalidSubjectDataError(`Duplicate content ID: ${value}`);
    ids.add(value);
  };
  const visit = (entry: TopicItem, depth: number) => {
    add(entry.id);
    targets.add(entry.id);
    if (entry.type === "topic") {
      if (depth > limits.topicDepth) throw new SubjectResourceLimitError("Too many topic levels.");
      entry.items.forEach((child) => visit(child, child.type === "topic" ? depth + 1 : depth));
    } else if (entry.type === "lesson") html.push([entry.id, entry.html]);
    else if (entry.type === "flashcard-deck")
      entry.cards.forEach((c) => {
        add(c.id);
        html.push([c.id, c.front], [c.id, c.back]);
      });
    else
      entry.exercises.forEach((e) => {
        add(e.id);
        html.push([e.id, e.prompt]);
        if (e.referenceAnswer !== undefined) html.push([e.id, e.referenceAnswer]);
        if (e.type === "multiple-choice") {
          const choices = e.choices.map((c) => c.id);
          if (new Set(choices).size !== choices.length || !choices.includes(e.correctChoiceId))
            throw new InvalidSubjectDataError(`Invalid choices: ${e.id}`);
          e.choices.forEach((c) => html.push([e.id, c.html]));
        }
      });
  };
  subject.content.topics.forEach((t) => visit(t, 1));
  const p = subject.progress;
  if (p) {
    for (const date of Object.keys(p.introduced))
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        throw new InvalidSubjectDataError(`Invalid local date: ${date}`);
    const historyIds = new Set<string>();
    const historyId = (value: string) => {
      if (historyIds.has(value))
        throw new InvalidSubjectDataError(`Duplicate history ID: ${value}`);
      historyIds.add(value);
    };
    for (const set of Object.values(p.exerciseSets))
      for (const a of set.attempts) {
        historyId(a.id);
        if (a.finishedAt !== undefined && a.finishedAt < a.startedAt)
          throw new InvalidSubjectDataError("Attempt finishes before it starts.");
        const answered = new Set<string>();
        for (const a2 of a.answers) {
          if (
            answered.has(a2.exerciseId) ||
            a2.answeredAt < a.startedAt ||
            (a.finishedAt !== undefined && a2.answeredAt > a.finishedAt)
          )
            throw new InvalidSubjectDataError("Invalid attempt answer ordering or timestamps.");
          answered.add(a2.exerciseId);
        }
      }
    for (const c of Object.values(p.cards)) {
      let previous = -1;
      for (const r of c.reviews) {
        historyId(r.id);
        if (r.reviewedAt < previous)
          throw new InvalidSubjectDataError("Reviews must be chronological.");
        previous = r.reviewedAt;
      }
    }
  }
  const warnings: SubjectReferenceWarning[] = [];
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const check = (sourceId: string, reference: string) => {
    if (reference.startsWith("lap:item/")) {
      const target = decode(reference.slice(9).split("#")[0]);
      if (!targets.has(target)) warnings.push({ sourceId, reference, reason: "missing-item" });
    } else if (reference.startsWith("assets/")) {
      const path = decode(reference.split(/[?#]/)[0]);
      if (!subject.assets.has(path))
        warnings.push({ sourceId, reference, reason: "missing-asset" });
    }
  };
  if (subject.manifest.cover) {
    if (!subject.manifest.cover.startsWith("assets/"))
      throw new InvalidSubjectDataError("Cover must reference assets/.");
    validateSubjectPath(subject.manifest.cover);
    check(subject.manifest.id, subject.manifest.cover);
  }
  for (const [source, document] of html) {
    const nodes: DefaultTreeAdapterMap["node"][] = [parse(document)];
    while (nodes.length) {
      const node = nodes.pop()!;
      if ("attrs" in node)
        for (const attr of node.attrs) {
          if (["href", "src", "poster", "data"].includes(attr.name)) check(source, attr.value);
          if (attr.name === "style")
            for (const match of attr.value.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi))
              check(source, match[1]);
          if (attr.name === "srcset")
            for (const entry of attr.value.split(",")) check(source, entry.trim().split(/\s+/)[0]);
        }
      if ("tagName" in node && node.tagName === "style" && "childNodes" in node)
        for (const child of node.childNodes)
          if ("value" in child)
            for (const match of child.value.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi))
              check(source, match[1]);
      if ("childNodes" in node) nodes.push(...node.childNodes);
      if ("content" in node) nodes.push(node.content as DefaultTreeAdapterMap["node"]);
    }
  }
  return warnings;
}
