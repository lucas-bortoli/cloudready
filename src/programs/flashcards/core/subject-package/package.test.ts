// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BlobReader, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { openAsBlob } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptySubject,
  exampleContent,
  exampleManifest,
  exampleProgress,
} from "../learning-program.example";
import { openSubjectPackage, writeSubjectPackage, exportSubjectWithoutProgress } from "./package";
import { validateSubject } from "./validation";
import {
  InvalidSubjectDataError,
  MalformedSubjectArchiveError,
  SubjectCancelledError,
  SubjectPackageClosedError,
  SubjectResourceLimitError,
  SubjectStreamError,
  SubjectAssetNotFoundError,
  UnsupportedSubjectFormatError,
} from "./errors";
import type { SubjectAsset, WritableSubject } from "./types";

function asset(bytes = new Uint8Array([1, 2, 3])): SubjectAsset {
  return { size: bytes.length, openStream: () => new Blob([bytes.slice().buffer]).stream() };
}
function subject(): WritableSubject {
  return {
    manifest: structuredClone(exampleManifest),
    content: structuredClone(exampleContent),
    progress: structuredClone(exampleProgress),
    assets: new Map([
      ["assets/cover.svg", asset()],
      ["assets/hello.mp3", asset()],
      ["assets/unused.bin", asset()],
    ]),
  };
}
function output() {
  const chunks: Uint8Array[] = [];
  let aborted = false;
  let closed = false;
  return {
    writable: new WritableStream<Uint8Array>({
      write: (b) => {
        chunks.push(b.slice());
      },
      abort: () => {
        aborted = true;
      },
      close: () => {
        closed = true;
      },
    }),
    blob: () => new Blob(chunks.map((b) => b.slice().buffer)),
    get aborted() {
      return aborted;
    },
    get closed() {
      return closed;
    },
  };
}
async function archive(
  files: Record<string, string | Uint8Array>,
  options: { password?: string; zip64?: boolean } = {},
) {
  const out = output();
  const zip = new ZipWriter(out.writable, { useWebWorkers: false, zip64: options.zip64 });
  for (const [path, data] of Object.entries(files))
    await zip.add(
      path,
      new BlobReader(new Blob([typeof data === "string" ? data : data.slice().buffer])),
      { password: options.password },
    );
  await zip.close();
  return out.blob();
}
function documents(s = subject()) {
  return {
    "manifest.json": JSON.stringify(s.manifest),
    "content.json": JSON.stringify(s.content),
    "progress.json": JSON.stringify(s.progress),
  };
}

describe("LAP package I/O", () => {
  it("round-trips edited content, retained history, and unused media using ZIP64", async () => {
    const s = subject();
    s.manifest.title = "Edited";
    const out = output();
    expect(await writeSubjectPackage(s, out.writable)).toEqual([]);
    expect(out.closed).toBe(true);
    const blob = out.blob();
    const raw = new Uint8Array(await blob.arrayBuffer());
    expect(
      raw.some(
        (_, i) => raw[i] === 0x50 && raw[i + 1] === 0x4b && raw[i + 2] === 6 && raw[i + 3] === 6,
      ),
    ).toBe(true);
    const opened = await openSubjectPackage(blob);
    expect(opened.manifest).toEqual(s.manifest);
    expect(opened.content).toEqual(s.content);
    expect(opened.progress).toEqual(s.progress);
    expect(opened.assets.size).toBe(3);
    expect(
      new Uint8Array(
        await new Response(opened.assets.get("assets/unused.bin")!.openStream()).arrayBuffer(),
      ),
    ).toEqual(new Uint8Array([1, 2, 3]));
    await opened.close();
    await opened.close();
    expect(() => opened.assets.get("assets/hello.mp3")!.openStream()).toThrow(
      SubjectPackageClosedError,
    );
  });

  it("creates a fresh share with no progress entry or old progress bytes", async () => {
    const s = subject();
    s.progress!.exerciseSets.practice.attempts[0].answers[0].note = "PRIVATE-LEARNER-NOTE";
    const out = output();
    await exportSubjectWithoutProgress(s, out.writable);
    const reader = new ZipReader(new BlobReader(out.blob()));
    expect((await reader.getEntries()).map((e) => e.filename)).not.toContain("progress.json");
    await reader.close();
    const opened = await openSubjectPackage(out.blob());
    expect(opened.progress).toBeUndefined();
    expect(s.progress).toBeDefined();
    expect(opened.content).toEqual(s.content);
    await opened.close();
  });

  it("opens an empty subject and keeps unresolved references as warnings", async () => {
    const out = output();
    await writeSubjectPackage({ ...emptySubject, assets: new Map() }, out.writable);
    const opened = await openSubjectPackage(out.blob());
    expect(opened.content.topics).toEqual([]);
    await opened.close();
    const s = subject();
    s.assets = new Map();
    s.content.topics[0].items.push({
      id: "broken",
      type: "lesson",
      title: "Broken",
      html: '<a href="lap:item/deleted">Gone</a><svg><image href="assets/gone.svg" /></svg>',
    });
    const warnings = validateSubject(s);
    expect(warnings).toContainEqual({
      sourceId: "broken",
      reference: "lap:item/deleted",
      reason: "missing-item",
    });
    expect(warnings).toContainEqual({
      sourceId: "broken",
      reference: "assets/gone.svg",
      reason: "missing-asset",
    });
  });

  it("resolves encoded references and rejects asset file/directory collisions", () => {
    const s = subject();
    s.assets = new Map([...s.assets, ["assets/a b.svg", asset()]]);
    s.content.topics[0].items.push({
      type: "lesson",
      id: "lesson with space",
      title: "Encoded",
      html: '<img src="assets/a%20b.svg"><a href="lap:item/lesson%20with%20space">Self</a>',
    });
    expect(validateSubject(s)).toEqual([]);
    s.assets = new Map([
      ["assets/file", asset()],
      ["assets/file/child", asset()],
    ]);
    expect(() => validateSubject(s)).toThrow(InvalidSubjectDataError);
  });

  it("rejects malformed, unsupported, unsafe, and oversized packages", async () => {
    await expect(openSubjectPackage(new Blob(["garbage"]))).rejects.toBeInstanceOf(
      MalformedSubjectArchiveError,
    );
    await expect(
      openSubjectPackage(await archive({ "manifest.json": "{", "content.json": "{}" })),
    ).rejects.toBeInstanceOf(InvalidSubjectDataError);
    await expect(
      openSubjectPackage(await archive({ ...documents(), "assets/../escape": "x" })),
    ).rejects.toBeInstanceOf(MalformedSubjectArchiveError);
    await expect(
      openSubjectPackage(await archive(documents(), { password: "secret" })),
    ).rejects.toBeInstanceOf(UnsupportedSubjectFormatError);
    const s = subject();
    (s.manifest as { version: number }).version = 2;
    await expect(openSubjectPackage(await archive(documents(s)))).rejects.toBeInstanceOf(
      UnsupportedSubjectFormatError,
    );
    await expect(
      openSubjectPackage(await archive(documents()), { limits: { contentBytes: 20 } }),
    ).rejects.toBeInstanceOf(SubjectResourceLimitError);
    await expect(
      openSubjectPackage(await archive(documents()), { limits: { entries: 1 } }),
    ).rejects.toBeInstanceOf(SubjectResourceLimitError);
  });

  it("rejects multipart disks and unsupported compression explicitly", async () => {
    const blob = await archive(documents());
    const original = new Uint8Array(await blob.arrayBuffer());
    for (const variant of ["disk", "compression"]) {
      const bytes = original.slice();
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < bytes.length - 46; i++) {
        if (view.getUint32(i, true) === 0x02014b50) {
          view.setUint16(i + (variant === "disk" ? 34 : 10), variant === "disk" ? 1 : 14, true);
          break;
        }
      }
      await expect(openSubjectPackage(new Blob([bytes.buffer]))).rejects.toBeInstanceOf(
        UnsupportedSubjectFormatError,
      );
    }
  });

  it("rejects duplicate archive paths and invalid UTF-8", async () => {
    const blob = await archive({ ...documents(), "assets/aaa": "a", "assets/bbb": "b" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("assets/bbb");
    // Equal-length replacement in both local and central headers preserves offsets.
    const from = new TextEncoder().encode("assets/bbb");
    const to = new TextEncoder().encode("assets/aaa");
    for (let i = 0; i <= bytes.length - from.length; i++)
      if (from.every((b, j) => bytes[i + j] === b)) bytes.set(to, i);
    await expect(openSubjectPackage(new Blob([bytes.buffer]))).rejects.toBeInstanceOf(
      MalformedSubjectArchiveError,
    );
    await expect(
      openSubjectPackage(
        await archive({ ...documents(), "manifest.json": new Uint8Array([0xff]) }),
      ),
    ).rejects.toBeInstanceOf(InvalidSubjectDataError);
  });

  it("validates edits and aborts destinations before writing invalid data", async () => {
    const s = subject();
    s.content.topics[0].items.push(s.content.topics[0]);
    const out = output();
    await expect(writeSubjectPackage(s, out.writable)).rejects.toBeInstanceOf(
      InvalidSubjectDataError,
    );
    expect(out.aborted).toBe(true);
    expect(out.blob().size).toBe(0);
    const duplicate = subject();
    duplicate.content.topics[0].id = "hello";
    expect(() => validateSubject(duplicate)).toThrow(InvalidSubjectDataError);
    const invalid = subject();
    invalid.progress!.cards.card.state.difficulty = 42;
    expect(() => validateSubject(invalid)).toThrow(InvalidSubjectDataError);
    const unknown = subject();
    Object.assign(unknown.manifest, { unknown: true });
    expect(() => validateSubject(unknown)).toThrow(InvalidSubjectDataError);
    const invalidDate = subject();
    invalidDate.progress!.introduced["2026-02-31"] = {};
    expect(() => validateSubject(invalidDate)).toThrow(InvalidSubjectDataError);
    expect(() => validateSubject(subject(), { limits: { topicDepth: 1 } })).toThrow(
      SubjectResourceLimitError,
    );
  });

  it("delivers source failures, destination failures, and cancellation as named errors", async () => {
    const s = subject();
    s.assets = new Map([
      [
        "assets/broken",
        {
          size: 1,
          openStream: () =>
            new ReadableStream({
              start(c) {
                c.error(new Error("read failed"));
              },
            }),
        },
      ],
    ]);
    const out = output();
    await expect(writeSubjectPackage(s, out.writable)).rejects.toBeInstanceOf(SubjectStreamError);
    expect(out.aborted).toBe(true);
    await expect(
      writeSubjectPackage(
        subject(),
        new WritableStream({
          write() {
            throw new Error("disk failed");
          },
        }),
      ),
    ).rejects.toBeInstanceOf(SubjectStreamError);
    const controller = new AbortController();
    controller.abort();
    await expect(
      openSubjectPackage(new Blob(), { signal: controller.signal }),
    ).rejects.toBeInstanceOf(SubjectCancelledError);
    const cancelled = output();
    await expect(
      writeSubjectPackage(subject(), cancelled.writable, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(SubjectCancelledError);
    expect(cancelled.aborted).toBe(true);
  });

  it("does not read media on open and closing cancels blocked asset reads", async () => {
    const out = output();
    await writeSubjectPackage(subject(), out.writable);
    const opened = await openSubjectPackage(out.blob());
    const stream = opened.assets.get("assets/hello.mp3")!.openStream();
    await opened.close();
    await expect(new Response(stream).arrayBuffer()).rejects.toBeDefined();
  });

  it("checks stored media integrity lazily and reports missing asset access", async () => {
    const out = output();
    await writeSubjectPackage(subject(), out.writable);
    const bytes = new Uint8Array(await out.blob().arrayBuffer());
    const view = new DataView(bytes.buffer);
    // Locate the stored asset payload through its local header, not a text search
    // through compressed bytes; corrupting it must not affect metadata opening.
    for (let i = 0; i < bytes.length - 30; i++) {
      if (view.getUint32(i, true) !== 0x04034b50) continue;
      const nameLength = view.getUint16(i + 26, true);
      const name = new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + nameLength));
      if (name === "assets/hello.mp3") {
        bytes[i + 30 + nameLength + view.getUint16(i + 28, true)] ^= 0xff;
        break;
      }
    }
    const opened = await openSubjectPackage(new Blob([bytes.buffer]));
    expect(() => opened.getAsset("assets/absent")).toThrow(SubjectAssetNotFoundError);
    await expect(
      new Response(opened.getAsset("assets/hello.mp3").openStream()).arrayBuffer(),
    ).rejects.toBeInstanceOf(MalformedSubjectArchiveError);
    await opened.close();
  });

  it("bounds decompressed JSON even when the advertised size understates it", async () => {
    const content = JSON.stringify({ topics: [], padding: "x".repeat(1024 * 1024) });
    const blob = await archive({ ...documents(), "content.json": content });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < bytes.length - 46; i++) {
      const signature = view.getUint32(i, true);
      if (signature !== 0x02014b50 && signature !== 0x04034b50) continue;
      const central = signature === 0x02014b50;
      const nameOffset = central ? 46 : 30;
      const nameLength = view.getUint16(i + (central ? 28 : 26), true);
      const name = new TextDecoder().decode(
        bytes.subarray(i + nameOffset, i + nameOffset + nameLength),
      );
      if (name === "content.json") view.setUint32(i + (central ? 24 : 22), 1, true);
    }
    const error = await openSubjectPackage(new Blob([bytes.buffer]), {
      limits: { contentBytes: 1024 },
    }).catch((cause: unknown) => cause);
    // zip.js may reject inconsistent size metadata before our bounded sink sees
    // output; either path must reject rather than allocating the inflated JSON.
    expect(
      error instanceof SubjectResourceLimitError || error instanceof MalformedSubjectArchiveError,
    ).toBe(true);
  });

  it("applies destination backpressure and cancels in-flight writes", async () => {
    let pulls = 0;
    let cancelledSource = false;
    let notify!: () => void;
    const blocked = new Promise<void>((resolve) => {
      notify = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = new AbortController();
    const s: WritableSubject = {
      ...emptySubject,
      assets: new Map([
        [
          "assets/stream.bin",
          {
            size: 100 * 65536,
            openStream: () =>
              new ReadableStream(
                {
                  pull(c) {
                    if (++pulls <= 100) c.enqueue(new Uint8Array(65536));
                    else c.close();
                  },
                  cancel() {
                    cancelledSource = true;
                  },
                },
                { highWaterMark: 0 },
              ),
          },
        ],
      ]),
    };
    const writing = writeSubjectPackage(
      s,
      new WritableStream({
        async write() {
          if (pulls > 0) {
            notify();
            await gate;
          }
        },
      }),
      { signal: controller.signal },
    );
    const rejected = expect(writing).rejects.toBeInstanceOf(SubjectCancelledError);
    await blocked;
    const pulledWhileBlocked = pulls;
    controller.abort();
    release();
    await rejected;
    // ZIP codecs have a bounded internal queue; they must not drain the source.
    expect(pulledWhileBlocked).toBeLessThan(32);
    expect(cancelledSource).toBe(true);
  });

  it("streams a disk-backed large asset incrementally through a slow destination", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lap-stream-"));
    try {
      const path = join(directory, "media.bin");
      const file = await open(path, "w");
      await file.truncate(32 * 1024 * 1024);
      await file.close();
      const media = await openAsBlob(path);
      let pulls = 0;
      let maxChunk = 0;
      const s: WritableSubject = {
        ...emptySubject,
        assets: new Map([
          [
            "assets/large.bin",
            {
              size: media.size,
              openStream() {
                const reader = media.stream().getReader();
                return new ReadableStream(
                  {
                    async pull(c) {
                      const next = await reader.read();
                      if (next.done) c.close();
                      else {
                        pulls++;
                        maxChunk = Math.max(maxChunk, next.value.length);
                        c.enqueue(next.value);
                      }
                    },
                    cancel: (reason) => reader.cancel(reason),
                  },
                  { highWaterMark: 0 },
                );
              },
            },
          ],
        ]),
      };
      const target = await open(join(directory, "large.lap"), "w");
      let writes = 0;
      await writeSubjectPackage(
        s,
        new WritableStream({
          async write(chunk) {
            writes++;
            await target.write(chunk);
          },
          close: () => target.close(),
          abort: () => target.close(),
        }),
      );
      expect(pulls).toBeGreaterThan(10);
      expect(writes).toBeGreaterThan(10);
      expect(maxChunk).toBeLessThan(1024 * 1024);
      const opened = await openSubjectPackage(await openAsBlob(join(directory, "large.lap")));
      expect(opened.assets.get("assets/large.bin")!.size).toBe(media.size);
      let read = 0;
      const reader = opened.assets.get("assets/large.bin")!.openStream().getReader();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        read += next.value.length;
      }
      expect(read).toBe(media.size);
      await opened.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
