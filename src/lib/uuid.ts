/**
 * Represents a Universally Unique Identifier (UUID).
 * The optional tag prevents IDs for different domain objects from being mixed
 * accidentally while remaining a plain string at runtime.
 *
 * @template Tag Domain-specific identifier tag.
 */
export type Uuid<Tag extends string = string> = string & { _tag?: `uuid:${Tag}` };

/**
 * Generates a UUID string.
 * Uses `crypto.randomUUID` when the platform supports it and a compatible
 * fallback otherwise.
 *
 * @template Tag Domain-specific identifier tag.
 * @returns A UUID branded with `Tag`.
 */
export default function generateUuid<Tag extends string>(): Uuid<Tag> {
  // Check if crypto.randomUUID is available (Node.js 15+, modern browsers)
  if (typeof crypto === "object" && "randomUUID" in crypto) {
    return crypto.randomUUID() as Uuid<Tag>;
  }

  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }) as Uuid<Tag>;
}
