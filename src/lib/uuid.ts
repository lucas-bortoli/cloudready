/**
 * Represents a Universally Unique Identifier (UUID).
 * This type extends a string with optional tags for additional type safety and metadata.
 * @template Tag - An optional type to associate with the UUID.
 */
export type Uuid<Tag extends string = string> = string & { _tag?: `uuid:${Tag}` };

/**
 * Generates a UUID string.
 * This function utilizes the `crypto.randomUUID` API when available (Node.js 15+, modern browsers) for cryptographically secure UUID generation.
 * It falls back to a less secure, but widely compatible, algorithm for older environments.
 * @template ID - An optional type to constrain the UUID type (defaults to UUID).
 * @returns A UUID string.
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
