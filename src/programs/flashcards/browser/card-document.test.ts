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
    expect(result.body.innerHTML).not.toContain("<script");
    expect(result.body.innerHTML).not.toContain("onerror");
    expect(result.body.innerHTML).not.toContain("https://example.test");
    expect(result.body.innerHTML).toContain("blob:local");
    expect(result.css).toContain("color: blue");
    expect(result.urls).toEqual(["blob:local"]);
  });
});
