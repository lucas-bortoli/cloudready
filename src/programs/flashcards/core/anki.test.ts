/// <reference types="node" />
import { readFileSync } from "node:fs";
import { deflateSync, strToU8, zipSync } from "fflate";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { AnkiImportError, importAnki } from "./anki";

function legacyDatabase(SQL: Awaited<ReturnType<typeof initSqlJs>>, version = 11): Uint8Array {
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE col(ver INTEGER, models TEXT, decks TEXT); CREATE TABLE notes(id INTEGER,guid TEXT,mid INTEGER,tags TEXT,flds TEXT); CREATE TABLE cards(id INTEGER,nid INTEGER,did INTEGER,ord INTEGER,due INTEGER); CREATE TABLE revlog(id INTEGER)",
  );
  const models = JSON.stringify({
    "10": {
      id: 10,
      name: "Cloze",
      type: 1,
      css: ".card{}",
      flds: [{ name: "Text" }],
      tmpls: [{ name: "Cloze", qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}" }],
    },
  });
  db.run("INSERT INTO col VALUES(?,?,?)", [
    version,
    models,
    JSON.stringify({ "2": { id: 2, name: "Spanish" } }),
  ]);
  db.run("INSERT INTO notes VALUES(1,'abc',10,'',?)", ["Es {{c1::lo}}."]);
  db.run("INSERT INTO cards VALUES(4,1,2,0,19)");
  const result = db.export();
  db.close();
  return result;
}

describe("Anki packages", () => {
  it("reads legacy cards, note types and Unicode media", async () => {
    const SQL = await initSqlJs({
      wasmBinary: new Uint8Array(readFileSync("node_modules/sql.js/dist/sql-wasm-browser.wasm"))
        .buffer,
    });
    const bytes = zipSync({
      "collection.anki2": legacyDatabase(SQL),
      media: strToU8(JSON.stringify({ "0": "año.mp3" })),
      "0": new Uint8Array([1, 2, 3]),
    });
    const result = importAnki(bytes, SQL);
    expect(result.cards[0]).toEqual({
      id: "4",
      noteId: "1",
      deckId: "2",
      ordinal: 0,
      position: 19,
    });
    expect(result.types[0].cloze).toBe(true);
    expect(result.notes[0].fields).toEqual(["Es {{c1::lo}}."]);
    expect(result.media["año.mp3"]).toEqual(new Uint8Array([1, 2, 3]));
  });
  it("reports unsupported schemas and missing media", async () => {
    const SQL = await initSqlJs({
      wasmBinary: new Uint8Array(readFileSync("node_modules/sql.js/dist/sql-wasm-browser.wasm"))
        .buffer,
    });
    expect(() => importAnki(zipSync({ "collection.anki2": legacyDatabase(SQL, 12) }), SQL)).toThrow(
      AnkiImportError,
    );
    expect(() =>
      importAnki(
        zipSync({ "collection.anki2": legacyDatabase(SQL), media: strToU8('{"0":"missing.mp3"}') }),
        SQL,
      ),
    ).toThrow(/Missing/);
    expect(() => importAnki(deflateSync(strToU8("bad")), SQL)).toThrow(AnkiImportError);
  });
  it("reads a modern reference package", async () => {
    const SQL = await initSqlJs({
      wasmBinary: new Uint8Array(readFileSync("node_modules/sql.js/dist/sql-wasm-browser.wasm"))
        .buffer,
    });
    const result = importAnki(
      readFileSync("src/programs/flashcards/core/fixtures/modern-basic.apkg"),
      SQL,
    );
    expect(result.cards).toHaveLength(1);
    expect(result.notes[0].fields).toEqual(["Front", "Back"]);
    expect(result.types[0].templates[0].front).toBeTruthy();
    expect(result.media["año.mp3"]).toEqual(new Uint8Array([1, 2, 3]));
  });
  it.skipIf(!process.env.CLOUDREADY_ANKI_FIXTURE)("reads the supplied deck", async () => {
    const SQL = await initSqlJs({
      wasmBinary: new Uint8Array(readFileSync("node_modules/sql.js/dist/sql-wasm-browser.wasm"))
        .buffer,
    });
    const bytes = readFileSync(process.env.CLOUDREADY_ANKI_FIXTURE!);
    const result = importAnki(bytes, SQL);
    expect(result.cards).toHaveLength(9263);
    expect(Object.keys(result.media)).toHaveLength(9263);
    expect(result.types[0].cloze).toBe(true);
  });
});
