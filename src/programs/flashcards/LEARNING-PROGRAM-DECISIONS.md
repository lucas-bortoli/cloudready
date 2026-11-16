# LAP subject format decisions

## Product decisions

LAP is a workspace. Each portable subject package covers one subject and one
learner. Topics nest freely and contain mixed ordered items, so users can arrange
material naturally. Each item has one owner and a stable ID, allowing movement
without losing its identity or progress.

A package includes content and separately identifiable progress, so it can be
shared without learner history. Manual Save writes both together; unsaved work
may be lost without a recovery copy. History survives edits and deletion, but
contains no content snapshots. This retains learner work with less duplicated
content, at the cost of historical context after changes.

Rich content uses HTML without JavaScript for formatting, SVG, images, audio,
and links; safe rendering requires isolation and sanitization. Cards initially
have individual front and back HTML. Exercise responses and optional answer
notes are plain text. AI-created, imported, and authored content remain editable.

## V1 technical conventions

ZIP with JSON and separate assets gives a single portable file that can be
inspected with common tools. Standalone JSON would require encoding binary
assets or external files. MessagePack is less readily inspected. SQLite is good
for queries and transactions, but CloudReady's current file API does not provide
cheap incremental database-file updates; manual saves make archive rebuilding a
reasonable starting point. These are format choices, not a claim that ZIP saves
are cheap for arbitrarily large subjects.

The manifest versions the package. Internal item links use `lap:item/<id>` and
assets use package-root paths. Progress uses epoch milliseconds and the existing
FSRS types and identifier. The format specification defines the exact fields.

## Deferred work

Package I/O, validation, safe rendering, editing, and Anki conversion are not
implemented by the model. Anki templates, cloze cards, and media need a
conversion strategy that preserves content or reports unsupported features.
CloudReady Machine Intelligence integration and a Xournal++-style drawing board
are future work. Large packages need filesystem improvements: HTTP request
bodies currently have a 16 MiB limit, and file revisions reconstruct whole
content even for offset writes. A fresh progress-free export must not expose
old progress bytes from prior archive revisions.
