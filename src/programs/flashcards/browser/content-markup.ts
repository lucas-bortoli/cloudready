import DOMPurify from "dompurify";

const styleProperties =
  /^(?:color|background-color|font(?:-family|-size|-style|-weight|-variant)?|line-height|letter-spacing|word-spacing|white-space|overflow-wrap|word-break|text-(?:align|decoration(?:-line|-color|-style)?|indent|transform|shadow)|vertical-align|(?:min-|max-)?(?:width|height)|(?:margin|padding)(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left))?(?:-width|-style|-color|-radius)?|box-shadow|display|gap|align-items|justify-content|flex(?:-direction|-wrap|-grow|-shrink|-basis)?|list-style-(?:type|position)|opacity)$/;

function copySafeDeclarations(source: CSSStyleDeclaration, target: CSSStyleDeclaration) {
  for (let index = 0; index < source.length; index++) {
    const property = source.item(index);
    const value = source.getPropertyValue(property);
    // Only these functions can occur in package declarations. In particular,
    // URL-bearing functions and variable references cannot initiate requests.
    if (!styleProperties.test(property)) continue;
    if (
      /[\\@]/.test(value) ||
      /[\w-]+\s*\(/.test(value.replace(/\b(?:rgb|rgba|hsl|hsla|calc|min|max|clamp)\(/gi, "("))
    )
      continue;
    target.setProperty(property, value, source.getPropertyPriority(property));
  }
}

/** Filters package CSS before it enters the live document. */
export function contentStyles(css: string): string {
  if (!css) return "";
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const declarations = document.createElement("span").style;
  const rules: string[] = [];
  for (const rule of Array.from(sheet.cssRules)) {
    if (!(rule instanceof CSSStyleRule)) continue;
    // Shadow host selectors can style the surrounding app element.
    if (/::|:host|\\/i.test(rule.selectorText)) continue;
    declarations.cssText = "";
    copySafeDeclarations(rule.style, declarations);
    if (declarations.length === 0) continue;
    const selector = rule.selectorText.replace(
      /(^|[\s>+~,])(?:html|body|:root)(?=$|[\s>+~,.#:[])/gi,
      "$1.content-body",
    );
    rules.push(`${selector} { ${declarations.cssText} }`);
  }
  return rules.join("\n");
}

/** Parses untrusted markup into an inert DOM before package media is resolved. */
export function contentMarkup(html: string): HTMLElement {
  const doc = DOMPurify.sanitize(html, {
    RETURN_DOM: true,
    FORCE_BODY: true,
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ALLOWED_URI_REGEXP: /^(?:(?:https?):|lap:item\/|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "select",
      "textarea",
      "meta",
      "link",
      "base",
      "foreignObject",
      "animate",
      "animateMotion",
      "animateTransform",
      "set",
    ],
    FORBID_ATTR: [
      "srcset",
      "ping",
      "background",
      "action",
      "formaction",
      "autofocus",
      "accesskey",
      "xml:base",
      "autoplay",
      "name",
      "slot",
      "part",
      "is",
      "data-lap-link",
    ],
  }) as HTMLElement;
  const declarations = document.createElement("span").style;
  for (const element of doc.querySelectorAll<HTMLElement | SVGElement>("*")) {
    const inline = element.getAttribute("style");
    if (inline !== null) {
      declarations.cssText = inline;
      element.removeAttribute("style");
      if (element.style) copySafeDeclarations(declarations, element.style);
    }
    for (const attr of Array.from(element.attributes)) {
      if (
        attr.name.startsWith("on") ||
        (/url\s*\(|\\/i.test(attr.value) && element.namespaceURI === "http://www.w3.org/2000/svg")
      ) {
        element.removeAttribute(attr.name);
      }
    }
  }
  return doc;
}
