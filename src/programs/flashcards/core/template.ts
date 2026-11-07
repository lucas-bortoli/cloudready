import type { AnkiCard, AnkiNote, AnkiNotetype } from "./anki";

/** Reports why a card cannot be rendered faithfully by the supported template subset. */
export class UnsupportedTemplateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UnsupportedTemplateError";
  }
}
export interface RenderedCard {
  front: string;
  back: string;
  css: string;
  frontAudio: string[];
  backAudio: string[];
}

type Node =
  | { kind: "text"; value: string }
  | { kind: "field"; value: string }
  | { kind: "section"; name: string; inverted: boolean; children: Node[] };

function parse(source: string): Node[] {
  const root: Node[] = [];
  const stack: { name: string; children: Node[] }[] = [{ name: "", children: root }];
  const tokens = /\{\{([\s\S]*?)\}\}/g;
  let cursor = 0,
    match: RegExpExecArray | null;
  while ((match = tokens.exec(source))) {
    const target = stack[stack.length - 1].children;
    target.push({ kind: "text", value: source.slice(cursor, match.index) });
    const token = match[1].trim();
    if (token.startsWith("#") || token.startsWith("^")) {
      const node: Node = {
        kind: "section",
        name: token.slice(1).trim(),
        inverted: token[0] === "^",
        children: [],
      };
      target.push(node);
      stack.push({ name: node.name, children: node.children });
    } else if (token.startsWith("/")) {
      if (stack.length === 1 || stack[stack.length - 1].name !== token.slice(1).trim())
        throw new UnsupportedTemplateError("Malformed template condition.");
      stack.pop();
    } else target.push({ kind: "field", value: token });
    cursor = tokens.lastIndex;
  }
  stack[stack.length - 1].children.push({ kind: "text", value: source.slice(cursor) });
  if (stack.length !== 1) throw new UnsupportedTemplateError("Unclosed template condition.");
  return root;
}
function plain(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ");
}
function cloze(value: string, ordinal: number, answer: boolean): string {
  return value.replace(
    /\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}/g,
    (_match, index: string, text: string, hint: string | undefined) => {
      if (Number(index) !== ordinal + 1) return text;
      return answer
        ? `<span class="cloze">${text}</span>`
        : `<span class="cloze">[${hint || "..."}]</span>`;
    },
  );
}
function expand(
  nodes: Node[],
  fields: Record<string, string>,
  ordinal: number,
  answer: boolean,
): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return node.value;
      if (node.kind === "section")
        return Boolean(plain(fields[node.name] ?? "").trim()) !== node.inverted
          ? expand(node.children, fields, ordinal, answer)
          : "";
      const parts = node.value.split(":");
      const name = parts.pop() ?? "";
      let value = fields[name] ?? "";
      for (const filter of parts.reverse()) {
        if (filter === "cloze") value = cloze(value, ordinal, answer);
        else if (filter === "text") value = plain(value);
        else throw new UnsupportedTemplateError(`Unsupported template filter: ${filter}`);
      }
      return value;
    })
    .join("");
}
function audio(html: string): { html: string; sounds: string[] } {
  const sounds: string[] = [];
  const cleaned = html.replace(/\[sound:([^\]]+)\]/g, (_match, name: string) => {
    sounds.push(name.normalize("NFC"));
    return "";
  });
  return { html: cleaned, sounds };
}

/**
 * Renders the supported Anki template subset to untrusted HTML plus audio names.
 * Callers must sanitize the HTML and isolate the stylesheet before display.
 *
 * @throws {UnsupportedTemplateError} If the card needs unsupported template behavior.
 */
export function renderCard(
  card: AnkiCard,
  note: AnkiNote,
  type: AnkiNotetype,
  deckName: string,
): RenderedCard {
  const template = type.templates[type.cloze ? 0 : card.ordinal];
  if (!template) throw new UnsupportedTemplateError("The card template is missing.");
  const combined = template.front + template.back + type.css + note.fields.join("");
  if (
    /<script\b|\bon\w+\s*=|\[latex\]|\[\$\]|\[\$\$\]|\\\(|\\\[|\\begin\{|\{\{(?:type|image-occlusion):/i.test(
      combined,
    )
  )
    throw new UnsupportedTemplateError(
      "This card uses scripts, typed answers, math, or image occlusion.",
    );
  const fields: Record<string, string> = Object.create(null) as Record<string, string>;
  type.fields.forEach((name, index) => {
    fields[name] = note.fields[index] ?? "";
  });
  Object.assign(fields, {
    Tags: note.tags,
    Type: type.name,
    Deck: deckName,
    Subdeck: deckName.split("::").at(-1) ?? deckName,
    Card: template.name,
    CardFlag: "",
  });
  const frontRaw = expand(parse(template.front), fields, card.ordinal, false);
  fields.FrontSide = frontRaw.replace(/\[sound:[^\]]+\]/g, "");
  const backRaw = expand(parse(template.back), fields, card.ordinal, true);
  const front = audio(frontRaw),
    back = audio(backRaw);
  return {
    front: front.html,
    back: back.html,
    css: type.css,
    frontAudio: front.sounds,
    backAudio: back.sounds,
  };
}
