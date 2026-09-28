const words = [
  "lorem",
  "ipsum",
  "dolor",
  "sit",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "sed",
  "do",
  "eiusmod",
  "tempor",
  "incididunt",
  "ut",
  "labore",
  "et",
  "dolore",
  "magna",
  "aliqua",
];

/** Generates a space-separated sequence of lorem ipsum words. */
export function generateLoremIpsum(wordCount: number): string {
  const count = Math.max(0, Math.floor(wordCount));
  return Array.from({ length: count }, () => words[Math.floor(Math.random() * words.length)]).join(
    " ",
  );
}
