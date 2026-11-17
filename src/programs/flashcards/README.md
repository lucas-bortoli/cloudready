# Flashcards implementation

The package reader, template expander, and scheduler live in `core/`. They operate
on serializable records and injected SQLite rather than CloudReady services. A
port needs equivalents for ZIP, Zstandard, SQLite and the short protobuf reader;
the mathematical scheduler itself needs only floating-point arithmetic.

## Scheduling

`fsrs.ts` implements FSRS-6 with the default 21 weights. Stability is in days,
difficulty is between 1 and 10, and all timestamps are UTC epoch milliseconds.
The retrievability curve is `R(t,S) = (1 + factor*t/S)^decay`, where decay is
`-w[20]` and factor makes `R(S,S) = 0.9`. Initial, short-term, successful and
forgotten stability updates use the FSRS-6 equations. Difficulty is damped and
reverted toward the easy initial difficulty. Intermediate model values use eight
decimal places, matching the pinned reference; deterministic intervals do not
use fuzzing. Learning steps are 1 and 10 minutes, relearning is 10 minutes, and
review intervals are bounded by 36,500 days.

A fresh card starts in `new`. Again and Hard enter or repeat learning; Good
advances through learning; Easy graduates to review. A failed review enters
relearning. Every operation receives its timestamp and returns a new record,
which makes clocks and persistence replaceable. `fsrs.test.ts` includes fixed
reference vectors and a multi-step review sequence. When porting, preserve the
rounding, timestamp units, learning-step indexing, review interval ordering,
and deterministic configuration. Store a new model identifier when changing
parameters or behavior; don't reinterpret existing states silently.

## Packages and rendering

Legacy packages contain a SQLite `collection.anki2` or `collection.anki21` and
a JSON media map. Modern packages have a protobuf `meta`, a Zstandard-compressed
`collection.anki21b`, and a compressed protobuf media manifest and media entries.
The importer normalizes schema 11's JSON notetypes and decks and schema 18's
relational records and protobuf config blobs. It rejects other schemas. The
worker loads the full archive and returns the normalized collection to the UI;
closing the last window releases the session cache. Real package media can be
large, so the ZIP, decompressed media, SQLite database, and browser copies may
briefly require significantly more memory than the file itself.

Template expansion supports fields, conditional sections, `FrontSide`, `text:`
and `cloze:`. Scripts, typed answers, math, image occlusion and other filters are
not supported. Audio markers are extracted before display, so hidden audio still
plays. The rendered HTML is sanitized and loaded with a restrictive CSP in a
script-disabled sandbox; the archive is not trusted to execute code.

## Persistence

Progress is stored in the current profile's virtual filesystem at
`/Applications/Flashcards/<sha256>.json`. The hash identifies exact package
bytes; a re-export is a different package. Version 1 stores the study timezone,
limits and daily introductions, FSRS state by card ID, and review records. It
does not store media or unstudied cards. A shared in-session store serializes
writes, retains failed snapshots for retry, and makes the latest session rating
undoable. Separate browser sessions are not coordinated and may overwrite one
another; use one session at a time. File versions are supplied by the filesystem.

## Reference sources

- FSRS equations and expected values: `open-spaced-repetition/ts-fsrs` 5.2.3,
  commit `0d72a487efbd1ee57bae9a6265cf413b20ae4338` (MIT).
- Package layouts and protobuf field definitions: `ImGajeed76/ankipack` 0.3.1,
  commit `36d3bcc459f52f53eb47dd64a9b7e880ca47c4ba` (MIT). The small modern
  fixture was generated with that version and contains synthetic card content.
- License texts for these references are retained in `REFERENCE-LICENSES.txt`.

The full Spanish deck is deliberately not part of the repository. To include it
in focused tests, set `CLOUDREADY_ANKI_FIXTURE` to its local path.

## UI architecture

`Flashcards` composes the package and review controllers with small views. The
package controller owns each window's pending import and its package reference;
the filesystem picker only returns a path. The review controller owns the store
subscription, queue clock, active-card selection, and review actions. Explicit
props keep the deck list and review controls independent of either controller.

The audio player owns playback and audio object URLs. The card frame separately
owns its sanitized document and image URLs. Their cleanup boundaries keep media
resources tied to the UI that uses them. Package changes reset the review
session, and the active-card selection stays stable when another card becomes
due. Rating batches answer and queue changes to avoid flashing the previous
card's front.

## LAP subject reader

The LAP launcher opens one `.lap` file from the CloudReady filesystem and shows
its topic tree and read-only lessons. The previous Anki screen is retained as
`LegacyFlashcards` for the future import work. Exercise sets and decks currently
show counts; editing, progress, and saving are not yet available.

Lesson HTML is sanitized and displayed in a scriptless sandbox with a restrictive
content security policy. Referenced package media is extracted to temporary Blob
URLs and released on navigation. The filesystem currently downloads the source
file as a Blob, and referenced media is materialized as a Blob; large-file
streaming and playback remain future work. CSS asset URLs and imports are removed.

Run the browser isolation check with `npm run test:lap-browser`. Install the
Playwright Chromium browser first with `npx playwright install chromium`, or set
`LAP_CHROMIUM` to the path of an existing Chromium executable.
