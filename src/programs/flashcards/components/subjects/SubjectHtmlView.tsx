import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import type { OpenSubjectPackage } from "../../core/subject-package/types";
import { contentMarkup, contentStyles } from "../../browser/content-markup";
import { ScopedHtml } from "../../../../components/scoped-html/ScopedHtml";
import baseCss from "./subject-content.css?raw";

/**
 * Properties for isolated subject content.
 */
export interface SubjectHtmlViewProps {
  subject: OpenSubjectPackage;
  title: string;
  html: string;
  onSelect: (id: string) => void;
}

/**
 * Displays sanitized LAP HTML with scoped styles and local media.
 * Object URLs and pending reads are released when the content changes or closes.
 *
 * @param props The open package, HTML, and internal navigation handler.
 */
export function SubjectHtmlView(props: SubjectHtmlViewProps) {
  const [content, setContent] = createSignal<{ body: HTMLElement; css: string }>();
  const [warning, setWarning] = createSignal(false);

  const handleClick = (event: MouseEvent, root: ShadowRoot) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[data-lap-link]");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("data-lap-link") ?? "";
    if (href.startsWith("lap:item/")) {
      let id: string;
      try {
        id = decodeURIComponent(href.slice(9).split("#")[0]);
      } catch {
        return;
      }
      props.onSelect(id);
    } else if (href.startsWith("#")) {
      root.getElementById(href.slice(1))?.scrollIntoView();
    } else if (/^https?:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  createEffect(() => {
    const html = props.html;
    const subject = props.subject;
    const abort = new AbortController();
    const urls: string[] = [];
    setContent(undefined);
    setWarning(false);
    const build = async () => {
      const body = contentMarkup(html);
      const styles = Array.from(body.querySelectorAll("style"), (style) => {
        style.remove();
        return contentStyles(style.textContent ?? "");
      });
      const cache = new Map<string, string>();
      for (const element of body.querySelectorAll("*")) {
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
          if (value === null) continue;
          if (value.startsWith("#") && (attr === "href" || attr === "xlink:href")) continue;
          element.removeAttribute(attr);
          if (!value) continue;
          let path: string;
          try {
            path = decodeURIComponent(value.split(/[?#]/)[0]);
          } catch {
            setWarning(true);
            continue;
          }
          const mediaSource =
            attr === "src" && /^(?:img|audio|video|source|track)$/.test(element.localName);
          const poster = attr === "poster" && element.localName === "video";
          const svgImage =
            (attr === "href" || attr === "xlink:href") && element.localName === "image";
          if (!(mediaSource || poster || svgImage) || !path.startsWith("assets/")) continue;
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
            if (abort.signal.aborted) return;
            setWarning(true);
          }
        }
      }
      if (!abort.signal.aborted) setContent({ body, css: styles.join("\n") });
    };

    void build();

    onCleanup(() => {
      abort.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    });
  });

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Show when={warning()}>
        <p role="status">Some assets could not be loaded.</p>
      </Show>
      <ScopedHtml title={props.title} content={content()} baseCss={baseCss} onClick={handleClick} />
    </div>
  );
}
