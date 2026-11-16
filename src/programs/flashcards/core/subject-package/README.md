# LAP package I/O

The public entry points are `openSubjectPackage`, `writeSubjectPackage`, and
`exportSubjectWithoutProgress` in `package.ts`, plus synchronous
`validateSubject` in `validation.ts`. Documents use the v1 types in
`../learning-program.ts`. All public APIs have JSDoc for arguments, ownership,
results, and named failures. This module has no CloudReady filesystem or UI
integration and does not sanitize or render HTML.

## Reading and lifetime

```ts
const subject = await openSubjectPackage(file, { signal });
try {
  console.log(subject.manifest.title, subject.warnings);
  const audio = subject.getAsset("assets/hello.mp3");
  await audio.openStream({ signal }).pipeTo(audioDestination, { signal });
} finally {
  await subject.close();
}
```

The input is a seekable Blob (a File also works). Opening reads the central
directory and required JSON, but does not extract media. Assets expose their
uncompressed size and supply a fresh stream per read. Consume or cancel streams;
closing the package cancels active extraction, waits for tasks to settle, and
makes descriptors unusable. `close()` is idempotent. The opening signal remains
attached to the package lifetime; a per-read signal cancels only that read.

Stored and deflated ZIP/ZIP64 entries are supported. Encrypted archives,
unsupported compression methods, multipart archives, duplicate paths, unsafe
paths, and ambiguous archives fail. Directory markers are allowed under
`assets/`. File entries must be the documented JSON documents or descendants of
`assets/`. A path is canonical and case-sensitive: no empty components, `.` or
`..`, leading slash, backslash, control characters, percent encoding, colon,
query, or fragment delimiters. ZIP entry sizes must be nonnegative safe integers.
Integrity is checked during extraction, so corrupted media may fail only when
read. Files cannot act as directories for other entries.

## Writing and sharing

```ts
const warnings = await writeSubjectPackage(subject, destination, { signal });
// To share, use a new, separate destination:
await exportSubjectWithoutProgress(subject, sharedDestination, { signal });
```

The destination is an unlocked `WritableStream<Uint8Array>`. Success closes it;
failure aborts it. Output is a fresh ZIP64 archive, with deflated JSON and stored
media. Assets, including unused ones, are streamed sequentially under
backpressure. Input JSON is serialized in memory before output starts. Do not
mutate documents or the asset map during a write. Keep an archive-backed source
open until writing finishes. A source must supply a fresh stream on every call,
and its actual byte count must equal its declared size.

To add an asset without buffering its bytes:

```ts
const assets = new Map(subject.assets);
assets.set("assets/new.mp3", {
  size: audioFile.size,
  openStream: () => audioFile.stream(),
});
await writeSubjectPackage({ ...subject, assets }, destination);
```

Validation failures abort the destination before any bytes are written. Other
failures may leave partial output. Atomic replacement of a saved file is the
responsibility of a future filesystem adapter. Destinations must honor stream
backpressure and settle their pending writes on I/O completion/failure.

Sharing never copies the original archive bytes: it creates a new archive that
omits `progress.json`. It retains content, provenance, and assets, including any
personal information authored there. There is no automatic content redaction.
An ordinary save preserves retained progress for deleted items.

## Validation and limits

`validateSubject(subject, options)` verifies strict v1 document shapes and
cross-record rules without mutation. It rejects unknown fields rather than
silently losing them on serialization, duplicate content IDs, invalid choices,
cycles, reserved object keys (`__proto__`, `constructor`, `prototype`),
non-topic root entries, invalid dates/timezones, and invalid scheduling
state. Attempt timestamps must enclose answers; duplicate answers for an exercise
within one attempt are rejected. Review timestamps must be chronological. History
IDs are unique across attempts and reviews. Records for deleted content remain
valid; they are not required to resolve against the current topic tree.

Reference warnings contain `sourceId`, `reference`, and a reason (`missing-item`
or `missing-asset`). The manifest ID identifies cover warnings. A non-executing
HTML parser inspects HTML/SVG hrefs, src, poster, object data, srcset, and common
CSS `url(...)` references. This is a reference audit, not a renderer or complete
CSS validator. External URLs and ordinary fragments are not fetched or checked.
URL-encoded reference components are decoded once when matching IDs and asset
paths. Missing local targets are warnings on both opening and saving. HTML strings are
preserved verbatim, including markup a future safe renderer must remove.

Default limits, configurable through `options.limits`, are:

| Field           | Default                                     |
| --------------- | ------------------------------------------- |
| `manifestBytes` | 1 MiB decompressed JSON                     |
| `contentBytes`  | 64 MiB decompressed JSON                    |
| `progressBytes` | 64 MiB decompressed JSON                    |
| `entries`       | 100,000, including directory markers        |
| `topicDepth`    | 256, counting top-level topics as level one |

Limits must be positive safe integers. JSON byte limits are checked against
metadata and actual decompression output; advertised sizes are not trusted.
Documents and metadata remain in memory. No total media-size limit is imposed;
streaming avoids buffering all media, but processing time still scales with its
size. Caller-provided Blob implementations must support range reads without
materializing the entire source. These are implementation bounds, not new
restrictions on the portable v1 format.

## Named failures

All named errors extend `SubjectPackageError` and preserve `instanceof`:

| Error                           | Meaning                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| `MalformedSubjectArchiveError`  | Corrupt ZIP, invalid integrity, duplicate or unsafe archive paths        |
| `UnsupportedSubjectFormatError` | Unsupported version, encryption, multipart layout, or compression        |
| `InvalidSubjectDataError`       | Invalid JSON/UTF-8, schema, relationships, paths on write, or asset size |
| `SubjectResourceLimitError`     | JSON, entry count, nesting, or safe-size bound exceeded                  |
| `SubjectAssetNotFoundError`     | `getAsset` cannot resolve the requested path                             |
| `SubjectCancelledError`         | Caller signal or package lifetime cancelled an operation                 |
| `SubjectPackageClosedError`     | Attempt to use a closed package                                          |
| `SubjectStreamError`            | Source Blob, supplied asset stream, or destination I/O failed            |

Lazy read failures arrive through the returned readable stream. Asynchronous
operation failures reject their promises; invalid pre-read access throws
synchronously. Underlying failures are retained as `cause` when available.
