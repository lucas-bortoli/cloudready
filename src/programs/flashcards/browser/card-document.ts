import { contentMarkup, contentStyles } from "./content-markup";

/** Prepares a card with scoped styles and image URLs from its own package. */
export function cardDocument(
  html: string,
  css: string,
  media: Record<string, Uint8Array>,
): { body: HTMLElement; css: string; urls: string[] } {
  const urls: string[] = [];
  const body = contentMarkup(html);
  for (const style of body.querySelectorAll("style")) style.remove();
  for (const element of body.querySelectorAll("*")) {
    const source = element.getAttribute("src");
    for (const name of ["src", "href", "xlink:href", "poster"]) element.removeAttribute(name);
    if (element.localName !== "img" || !source) continue;
    const name = source.normalize("NFC");
    if (!Object.hasOwn(media, name)) continue;
    const url = URL.createObjectURL(new Blob([media[name].slice().buffer]));
    urls.push(url);
    element.setAttribute("src", url);
  }

  return { body, css: contentStyles(css), urls };
}
