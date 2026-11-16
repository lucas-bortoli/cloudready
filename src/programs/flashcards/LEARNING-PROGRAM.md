# LAP subject format, version 1

This document specifies the initial Learn Anything Program (LAP) subject format.
The corresponding TypeScript definitions and type-checked examples are in
`core/learning-program.ts` and `core/learning-program.example.ts`. The format is
specified here; a package reader, writer, and validator are not implemented yet.

## Package

A `.lap` file is a ZIP archive with UTF-8 JSON documents and embedded assets:

```text
manifest.json
content.json
progress.json       optional; contains one learner's progress
assets/             embedded media and other attachments
```

`manifest.json` and `content.json` are required, even for an empty subject. The
manifest contains `format` (`cloudready-lap`), `version` (number `1`), a stable
subject `id`, `title`, `description`, one content `language` (a language tag,
for example `en`), and optional `cover` (an asset path). The manifest version
identifies the format of the entire archive. Future incompatible changes require
a new version and a migration; readers must reject unsupported versions rather
than silently interpreting them as v1.

`content.json` contains `topics`, an ordered array of zero or more topics.
A topic has `type: "topic"`, `id`, `title`, and `items`. Each `items` array
contains topics, lessons, exercise sets, or flashcard decks in display order.
Topics can nest without a fixed depth. Order is organizational and does not
restrict access or prescribe a learning sequence. A learning item belongs to
one topic, an exercise to one exercise set, and a card to one deck.

Each topic, lesson, set, exercise, deck, and card has a nonempty, stable ID
unique across these content entities within the subject. IDs persist through
edits and moves and must not be reused for a different entity. Choice IDs are
nonempty and unique within their exercise. Attempt and review IDs identify
individual history records. An optional `provenance` object on content entities
contains `origin` (`authored`, `imported`, or `ai-generated`), optional `source`,
and optional `createdAt`. Provenance is informational; all content is editable.

## Content entries

- A `lesson` has `id`, `title`, and `html`, one HTML document.
- An `exercise-set` has `id`, `title`, and ordered `exercises`. Each exercise
  has an ID, a type, and an HTML `prompt`. A `multiple-choice` exercise has
  `choices` (each with `id` and HTML `html`), `correctChoiceId`, and optional
  HTML `referenceAnswer`. A `written-answer` or `fill-in-the-blank` exercise
  has an HTML `referenceAnswer` and is self-graded correct or incorrect.
- A `flashcard-deck` has `id`, `title`, and ordered `cards`. Each card has an
  ID and HTML `front` and `back`. Cards are individually authored.

Rich content may include formatted text, images, SVG, and audio. `assets/<path>`
references an embedded archive asset; `lap:item/<id>` links to a topic or item
in the same subject. Ordinary `#fragment` links address anchors in the HTML
document. HTTP and HTTPS links address external sites. Asset paths are relative
to the archive root, must stay within `assets/`, and must name an existing
entry. Internal links must identify an existing topic or learning item. The cover
uses the same asset path convention.

A future renderer must sanitize untrusted HTML and SVG, display them in a
sandbox with scripts disabled, and control resource loading. Embedded resources
must be resolved from the package; arbitrary network requests must not be
silently loaded. External links require a deliberate browser flow. These are
requirements for the future renderer, not protections supplied by this model.

## Learner progress

`progress.json`, when present, contains `timezone` (an IANA time zone),
`scheduler` (`fsrs-6-default-v1`), `dailyLimit`, `introduced`, `lessons`,
`exerciseSets`, `cards`, and `deckTimeSpentSeconds`. Objects keyed by IDs may
retain records for deleted content. Counts, limits, and accumulated study times
are nonnegative; time spent is measured in seconds. Timestamps are UTC epoch
milliseconds. Daily limit keys are deck IDs; introduced is keyed by local date
(`YYYY-MM-DD`) then deck ID, matching the current scheduler bookkeeping.

`lessons` maps IDs to `completed` and `timeSpentSeconds`; completion is toggled
by the learner. `exerciseSets` maps IDs to `timeSpentSeconds` and ordered
`attempts`. An attempt has an `id`, `startedAt`, optional `finishedAt`, and
ordered `answers`. An answer has `exerciseId`, plain-text `response`, boolean
`correct`, `answeredAt`, and optional plain-text `note`. For multiple choice the
response is the choice ID. Scores are derived from answer results. Attempts have
no question or reference-answer snapshots.

`cards` maps card IDs to `state` and ordered `reviews`. The state is the
existing FSRS `CardState` from `core/fsrs.ts`; a review has `id`, numeric
`rating` (1 Again, 2 Hard, 3 Good, 4 Easy), `reviewedAt`, and `previous`
CardState for undo. Reviews do not snapshot card HTML. `deckTimeSpentSeconds`
maps deck IDs to accumulated time. Card progress follows its ID when moved;
deck time remains associated with the deck in which it was recorded.

Progress stays with an ID when content is edited, moved, or deleted. A deleted
item's history is valid retained data and can be cleared by an explicit future
action. Without content snapshots, historical answers may lose context after an
edit or deletion.

## Lifecycle and examples

Save is manual and writes content and progress together. Unsaved changes may be
lost; no persisted recovery copy is required. Sharing creates a fresh archive
without `progress.json`. Anki import starts with fresh progress; conversion and
handling of unsupported Anki content remain to be designed.

`core/learning-program.example.ts` gives type-checked examples of every content
type, nested topics, links and assets, progress including deleted content, an
empty subject, and a progress-free share. It is illustrative and does not write
an archive. Paths in an actual archive must have corresponding asset entries.
