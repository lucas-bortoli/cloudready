import { unzipSync } from "fflate";
import { decompress } from "fzstd";
import type { Database, SqlJsStatic, SqlValue } from "sql.js";

/** A package failure that can be presented to the user without losing its cause. */
export class AnkiImportError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AnkiImportError";
  }
}
export interface AnkiTemplate {
  name: string;
  front: string;
  back: string;
}
export interface AnkiNotetype {
  id: string;
  name: string;
  cloze: boolean;
  css: string;
  fields: string[];
  templates: AnkiTemplate[];
}
export interface AnkiDeck {
  id: string;
  name: string;
}
export interface AnkiNote {
  id: string;
  guid: string;
  typeId: string;
  tags: string;
  fields: string[];
}
export interface AnkiCard {
  id: string;
  noteId: string;
  deckId: string;
  ordinal: number;
  position: number;
}
export interface AnkiCollection {
  decks: AnkiDeck[];
  types: AnkiNotetype[];
  notes: AnkiNote[];
  cards: AnkiCard[];
  media: Record<string, Uint8Array>;
  hasReviewHistory: boolean;
}
type Row = Record<string, SqlValue>;

function rows(db: Database, query: string): Row[] {
  const stmt = db.prepare(query);
  const result: Row[] = [];
  try {
    while (stmt.step()) result.push(stmt.getAsObject());
  } finally {
    stmt.free();
  }
  return result;
}
function string(value: SqlValue | undefined): string {
  if (typeof value !== "string") throw new AnkiImportError("Invalid text in collection database.");
  return value;
}
function number(value: SqlValue | undefined): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new AnkiImportError("Invalid number in collection database.");
  return value;
}
function blob(value: SqlValue | undefined): Uint8Array {
  if (!(value instanceof Uint8Array))
    throw new AnkiImportError("Invalid configuration in collection database.");
  return value;
}

// Only length-delimited and varint fields are needed for the documented Anki
// metadata. Unknown fields are skipped so added metadata stays forward compatible.
function protobuf(data: Uint8Array): Map<number, (number | Uint8Array)[]> {
  let p = 0;
  const result = new Map<number, (number | Uint8Array)[]>();
  const read = (): number => {
    let n = 0,
      scale = 1;
    for (let i = 0; i < 10; i++) {
      if (p >= data.length) throw new AnkiImportError("Truncated package metadata.");
      const b = data[p++];
      n += (b & 127) * scale;
      if (!(b & 128)) return n;
      scale *= 128;
    }
    throw new AnkiImportError("Invalid package metadata.");
  };
  while (p < data.length) {
    const key = read(),
      field = Math.floor(key / 8),
      wire = key & 7;
    let value: number | Uint8Array;
    if (!field) throw new AnkiImportError("Invalid package metadata field.");
    if (wire === 0) value = read();
    else if (wire === 2) {
      const size = read();
      if (size > data.length - p) throw new AnkiImportError("Truncated package metadata.");
      value = data.subarray(p, p + size);
      p += size;
    } else if (wire === 1 || wire === 5) {
      const size = wire === 1 ? 8 : 4;
      if (p + size > data.length) throw new AnkiImportError("Truncated package metadata.");
      p += size;
      continue;
    } else throw new AnkiImportError("Unsupported package metadata encoding.");
    const values = result.get(field) ?? [];
    values.push(value);
    result.set(field, values);
  }
  return result;
}
const decoder = new TextDecoder();
function pbText(fields: Map<number, (number | Uint8Array)[]>, key: number): string {
  const value = fields.get(key)?.[0];
  return value instanceof Uint8Array ? decoder.decode(value) : "";
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new AnkiImportError("Invalid collection metadata.");
  return value as Record<string, unknown>;
}
function jsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new AnkiImportError("Invalid collection metadata.");
  return parsed as Record<string, unknown>;
}

/**
 * Reads Anki's ZIP container into portable application records.
 * SQL is injected so WASM loading stays a browser or host responsibility.
 *
 * @throws {AnkiImportError} If the archive, schema, or collection is unsupported or damaged.
 */
export function importAnki(bytes: Uint8Array, SQL: SqlJsStatic): AnkiCollection {
  try {
    const entries = unzipSync(bytes);
    const metadata = entries.meta ? protobuf(entries.meta).get(1)?.[0] : undefined;
    if (metadata !== undefined && metadata !== 1 && metadata !== 2 && metadata !== 3)
      throw new AnkiImportError(
        "This package uses an unsupported Anki format. Re-export it from a supported Anki version.",
      );
    const modern = metadata === 3;
    const filename = modern
      ? "collection.anki21b"
      : entries["collection.anki21"]
        ? "collection.anki21"
        : "collection.anki2";
    if (!entries[filename])
      throw new AnkiImportError("This package has no supported collection database.");
    const db = new SQL.Database(modern ? decompress(entries[filename]) : entries[filename]);
    try {
      const col = rows(db, "SELECT ver, models, decks FROM col")[0];
      if (!col) throw new AnkiImportError("This package has no collection metadata.");
      const version = number(col.ver);
      if (version !== 11 && version !== 18)
        throw new AnkiImportError(
          `Anki database schema ${version} is unsupported; re-export from a supported Anki version.`,
        );
      let decks: AnkiDeck[], types: AnkiNotetype[];
      // Schema 11 embeds note types and decks as JSON. Schema 18 moves them
      // to tables with protobuf configuration; both normalize to the same records.
      if (version === 11) {
        decks = Object.values(jsonObject(string(col.decks))).map((value) => {
          const d = object(value);
          if ((typeof d.id !== "number" && typeof d.id !== "string") || typeof d.name !== "string")
            throw new AnkiImportError("Invalid deck metadata.");
          return { id: String(d.id), name: d.name };
        });
        types = Object.values(jsonObject(string(col.models))).map((value) => {
          const m = object(value);
          if (
            (typeof m.id !== "number" && typeof m.id !== "string") ||
            typeof m.name !== "string" ||
            !Array.isArray(m.flds) ||
            !Array.isArray(m.tmpls)
          )
            throw new AnkiImportError("Invalid note type metadata.");
          return {
            id: String(m.id),
            name: m.name,
            cloze: m.type === 1,
            css: typeof m.css === "string" ? m.css : "",
            fields: m.flds.map((value: unknown) => {
              const f = object(value);
              if (typeof f.name !== "string") throw new AnkiImportError("Invalid field metadata.");
              return f.name;
            }),
            templates: m.tmpls.map((value: unknown) => {
              const t = object(value);
              if (
                typeof t.name !== "string" ||
                typeof t.qfmt !== "string" ||
                typeof t.afmt !== "string"
              )
                throw new AnkiImportError("Invalid template metadata.");
              return { name: t.name, front: t.qfmt, back: t.afmt };
            }),
          };
        });
      } else {
        decks = rows(db, "SELECT id,name FROM decks").map((d) => ({
          id: String(number(d.id)),
          name: string(d.name).replaceAll("\x1f", "::"),
        }));
        const fields = rows(db, "SELECT ntid,ord,name FROM fields ORDER BY ntid,ord"),
          templates = rows(db, "SELECT ntid,ord,name,config FROM templates ORDER BY ntid,ord");
        types = rows(db, "SELECT id,name,config FROM notetypes").map((t) => {
          const id = number(t.id),
            config = protobuf(blob(t.config));
          return {
            id: String(id),
            name: string(t.name),
            cloze: config.get(1)?.[0] === 1,
            css: pbText(config, 3),
            fields: fields.filter((f) => f.ntid === id).map((f) => string(f.name)),
            templates: templates
              .filter((f) => f.ntid === id)
              .map((f) => {
                const c = protobuf(blob(f.config));
                return { name: string(f.name), front: pbText(c, 1), back: pbText(c, 2) };
              }),
          };
        });
      }
      const notes = rows(db, "SELECT id,guid,mid,tags,flds FROM notes").map((n) => ({
        id: String(number(n.id)),
        guid: string(n.guid),
        typeId: String(number(n.mid)),
        tags: string(n.tags),
        fields: string(n.flds).split("\x1f"),
      }));
      const cards = rows(db, "SELECT id,nid,did,ord,due FROM cards").map((c) => ({
        id: String(number(c.id)),
        noteId: String(number(c.nid)),
        deckId: String(number(c.did)),
        ordinal: number(c.ord),
        position: number(c.due),
      }));
      // Archive entry names are numeric; the manifest supplies the filenames
      // referenced by card HTML and can contain Unicode names.
      const media: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
      if (entries.media) {
        const manifest = modern
          ? (protobuf(decompress(entries.media))
              .get(1)
              ?.map((entry, i) => {
                if (!(entry instanceof Uint8Array))
                  throw new AnkiImportError("Invalid media manifest.");
                const fields = protobuf(entry);
                return [String(fields.get(255)?.[0] ?? i), pbText(fields, 1)];
              }) ?? [])
          : Object.entries(jsonObject(decoder.decode(entries.media)));
        for (const [key, name] of manifest) {
          if (typeof name !== "string" || !entries[key])
            throw new AnkiImportError(`Missing or invalid media: ${String(name)}`);
          media[name.normalize("NFC")] = modern ? decompress(entries[key]) : entries[key];
        }
      }
      return {
        decks,
        types,
        notes,
        cards,
        media,
        hasReviewHistory: number(rows(db, "SELECT count(*) AS count FROM revlog")[0].count) > 0,
      };
    } finally {
      db.close();
    }
  } catch (cause) {
    if (cause instanceof AnkiImportError) throw cause;
    throw new AnkiImportError(
      "Could not read this Anki package. It may be invalid or unsupported.",
      { cause },
    );
  }
}
