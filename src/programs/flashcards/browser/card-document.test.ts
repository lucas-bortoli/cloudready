import { afterEach, describe, expect, it, vi } from "vitest";
import { cardDocument } from "./card-document";

afterEach(() => vi.restoreAllMocks());
describe("card document isolation", () => {
  it("removes executable content and resolves only package images", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local");
    const result = cardDocument(
      '<script>bad()</script><img src="a.png" onerror="bad()"><img src="https://example.test/a.png">',
      ".card{color:blue}",
      { "a.png": new Uint8Array([1]) },
    );
    expect(result.srcdoc).not.toContain("<script");
    expect(result.srcdoc).not.toContain("onerror");
    expect(result.srcdoc).not.toContain("https://example.test");
    expect(result.srcdoc).toContain("blob:local");
    expect(result.srcdoc).toContain("default-src 'none'");
    expect(result.urls).toEqual(["blob:local"]);
  });
});
