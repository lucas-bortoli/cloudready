import DOMPurify from "dompurify";
import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import type { OpenSubjectPackage } from "../../core/subject-package/types";

/**
 * Properties for an isolated read-only lesson.
 */
export interface LessonViewProps {
  subject: OpenSubjectPackage;
  html: string;
  onSelect: (id: string) => void;
}

/**
 * Displays sanitized lesson HTML with scriptless sandboxing and local media.
 * Object URLs and pending reads are released when the lesson changes or closes.
 *
 * @param props The open package, lesson HTML, and internal navigation handler.
 */
export function LessonView(props: LessonViewProps) {
  const [srcdoc, setSrcdoc] = createSignal("");
  const [warning, setWarning] = createSignal(false);
  let frame: HTMLIFrameElement | undefined;
  let detach: (() => void) | undefined;
  const handleLoad = () => {
    detach?.();
    const doc = frame?.contentDocument;
    if (!doc) return;
    const click = (event: MouseEvent) => {
      const target = event.target;
      if (!target || !("closest" in target)) return;
      const link = (target as Element).closest("a[data-lap-link]");
      if (!link) return;
      event.preventDefault();
      const href = link.getAttribute("data-lap-link") ?? "";
      if (href.startsWith("lap:item/")) {
        try {
          props.onSelect(decodeURIComponent(href.slice(9).split("#")[0]));
        } catch {
          /* Invalid link. */
        }
      } else if (href.startsWith("#")) {
        doc.getElementById(href.slice(1))?.scrollIntoView();
      } else if (/^https?:\/\//i.test(href)) {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    };
    doc.addEventListener("click", click);
    detach = () => untrack(() => doc.removeEventListener("click", click));
  };
  createEffect(() => {
    const html = props.html;
    const subject = props.subject;
    const abort = new AbortController();
    const urls: string[] = [];
    setSrcdoc("");
    setWarning(false);
    const build = async () => {
      const safe = DOMPurify.sanitize(html, {
        WHOLE_DOCUMENT: true,
        ALLOWED_URI_REGEXP: /^(?:(?:https?):|lap:item\/|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
        FORBID_TAGS: [
          "script",
          "iframe",
          "object",
          "embed",
          "form",
          "meta",
          "link",
          "base",
          "foreignObject",
          "animate",
          "animateTransform",
          "set",
        ],
        FORBID_ATTR: ["srcset"],
      });
      const doc = new DOMParser().parseFromString(safe, "text/html");
      for (const style of doc.querySelectorAll("style"))
        if (/url\s*\(|@import|\\/i.test(style.textContent ?? "")) style.remove();
      const cache = new Map<string, string>();
      for (const element of doc.querySelectorAll("*")) {
        for (const attr of Array.from(element.attributes)) {
          if (
            /^on/i.test(attr.name) ||
            (attr.name === "style" && /url\s*\(|@import|\\/i.test(attr.value))
          )
            element.removeAttribute(attr.name);
        }
        if (element.localName === "a") {
          const href = element.getAttribute("href") ?? "";
          element.removeAttribute("href");
          element.removeAttribute("xlink:href");
          element.removeAttribute("target");
          if (/^(lap:item\/|#|https?:\/\/)/i.test(href)) {
            element.setAttribute("data-lap-link", href);
            element.setAttribute("href", "#");
          }
          continue;
        }
        for (const attr of ["src", "href", "poster", "xlink:href"]) {
          const value = element.getAttribute(attr);
          if (!value || value.startsWith("#")) continue;
          element.removeAttribute(attr);
          let path: string;
          try {
            path = decodeURIComponent(value.split(/[?#]/)[0]);
          } catch {
            setWarning(true);
            continue;
          }
          if (!path.startsWith("assets/")) continue;
          try {
            let url = cache.get(path);
            if (!url) {
              const blob = await new Response(
                subject.getAsset(path).openStream({ signal: abort.signal }),
              ).blob();
              if (abort.signal.aborted) return;
              const ext = path.split(".").pop()?.toLowerCase();
              const mime: Record<string, string> = {
                svg: "image/svg+xml",
                png: "image/png",
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                webp: "image/webp",
                mp3: "audio/mpeg",
                ogg: "audio/ogg",
                wav: "audio/wav",
                mp4: "video/mp4",
                webm: "video/webm",
              };
              url = URL.createObjectURL(
                new Blob([blob], { type: mime[ext ?? ""] ?? "application/octet-stream" }),
              );
              urls.push(url);
              cache.set(path, url);
            }
            element.setAttribute(attr, url);
          } catch {
            if (!abort.signal.aborted) setWarning(true);
          }
        }
      }
      if (!abort.signal.aborted)
        setSrcdoc(
          `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; media-src blob:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"></head><body>${doc.body.innerHTML}</body></html>`,
        );
    };
    void build();
    onCleanup(() => {
      abort.abort();
      detach?.();
      urls.forEach((url) => URL.revokeObjectURL(url));
    });
  });
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Show when={warning()}>
        <p role="status">Some lesson assets could not be loaded.</p>
      </Show>
      <iframe
        ref={frame}
        title="Lesson"
        sandbox="allow-same-origin"
        class="min-h-0 w-full flex-1 border-0 bg-white"
        srcdoc={srcdoc()}
        onLoad={handleLoad}
      />
    </div>
  );
}
