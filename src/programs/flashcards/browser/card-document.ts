import DOMPurify from "dompurify";

/**
 * Builds an isolated card document with access only to URLs for package media.
 * The sandbox and CSP remain necessary even after sanitization because card CSS
 * and HTML originate in a user-supplied archive.
 */
export function cardDocument(
  html: string,
  css: string,
  media: Record<string, Uint8Array>,
): { srcdoc: string; urls: string[] } {
  const urls: string[] = [];
  const sanitized = DOMPurify.sanitize(html, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "base", "form", "style"],
    FORBID_ATTR: ["srcset"],
  });
  const doc = new DOMParser().parseFromString(sanitized, "text/html");
  // Event attributes have no use in our supported template subset. Remove them
  // explicitly as defense in depth before the document crosses the sandbox boundary.
  for (const element of doc.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes))
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
  }
  for (const image of doc.querySelectorAll("img")) {
    const name = (image.getAttribute("src") ?? "").normalize("NFC");
    const data = media[name];
    if (data) {
      const url = URL.createObjectURL(new Blob([data.slice().buffer]));
      urls.push(url);
      image.src = url;
    } else image.removeAttribute("src");
  }
  const safeCss = css.replace(/<\/?style/gi, "");
  return {
    srcdoc: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; media-src blob:; style-src 'unsafe-inline'"><style>${safeCss}</style></head><body class="card">${doc.body.innerHTML}</body></html>`,
    urls,
  };
}
