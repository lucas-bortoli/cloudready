import { describe, expect, it } from "vitest";
import { renderCard, UnsupportedTemplateError } from "./template";
import type { AnkiCard, AnkiNote, AnkiNotetype } from "./anki";
const card: AnkiCard = { id: "1", noteId: "2", deckId: "3", ordinal: 0, position: 0 };
const note: AnkiNote = {
  id: "2",
  guid: "g",
  typeId: "4",
  tags: "",
  fields: ["{{c1::uno}} y {{c1::dos::hint}}", "[sound:a.mp3]"],
};
const type: AnkiNotetype = {
  id: "4",
  name: "cloze",
  cloze: true,
  css: "",
  fields: ["Text", "Audio"],
  templates: [
    {
      name: "Cloze",
      front: "{{#Text}}{{cloze:Text}}{{/Text}}",
      back: "{{cloze:Text}}<div style='display:none'>{{Audio}}</div>",
    },
  ],
};
describe("Anki templates", () => {
  it("hides and reveals repeated deletions and finds hidden audio", () => {
    const result = renderCard(card, note, type, "Deck");
    expect(result.front).toContain("[...]");
    expect(result.front).toContain("[hint]");
    expect(result.back).toContain("uno");
    expect(result.back).toContain("dos");
    expect(result.backAudio).toEqual(["a.mp3"]);
  });
  it("handles nested sections and FrontSide without replaying front audio", () => {
    const basic = {
      ...type,
      cloze: false,
      templates: [
        {
          name: "Basic",
          front: "{{#Text}}{{^Empty}}{{Text}}{{/Empty}}{{/Text}}{{Audio}}",
          back: "{{FrontSide}}<hr>{{text:Text}}",
        },
      ],
      fields: ["Text", "Audio", "Empty"],
    };
    const result = renderCard(card, note, basic, "Parent::Deck");
    expect(result.front).toContain("uno");
    expect(result.frontAudio).toEqual(["a.mp3"]);
    expect(result.backAudio).toEqual([]);
    expect(result.back).toContain("<hr>");
  });
  it("rejects unsupported filters", () => {
    expect(() =>
      renderCard(
        card,
        note,
        { ...type, templates: [{ ...type.templates[0], front: "{{foo:Text}}" }] },
        "Deck",
      ),
    ).toThrow(UnsupportedTemplateError);
  });
});
