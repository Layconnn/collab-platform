"use client";

import { useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

// Markdown for discussions, replies and decisions (Markdown PRD, FR-1 to FR-3).
// Content is stored as typed; only rendering changes. Raw HTML is never
// rendered, images are not loaded, and links allow http, https and mailto.

type MdNode = { type: string; value?: string; children?: MdNode[]; data?: Record<string, unknown> };

const MENTION = /@[A-Za-z0-9_]{3,30}/g;

// Turns "@username" in text into a mention span; code is left alone because
// inline code and code blocks are not "text" nodes.
export function remarkMentions() {
  const visit = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child): MdNode[] => {
      if (child.type !== "text" || !child.value || !child.value.includes("@")) {
        visit(child);
        return [child];
      }
      const parts: MdNode[] = [];
      let cursor = 0;
      for (const match of child.value.matchAll(MENTION)) {
        const start = match.index ?? 0;
        if (start > cursor) parts.push({ type: "text", value: child.value.slice(cursor, start) });
        parts.push({
          type: "mention",
          children: [{ type: "text", value: match[0] }],
          data: { hName: "span", hProperties: { className: ["mention"] } },
        });
        cursor = start + match[0].length;
      }
      if (!parts.length) return [child];
      if (cursor < child.value.length) parts.push({ type: "text", value: child.value.slice(cursor) });
      return parts;
    });
  };
  return (tree: MdNode) => visit(tree);
}

const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => !["img", "picture", "source", "video", "audio", "iframe"].includes(tag)),
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"] },
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "mention"]],
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-[\w-]+$/]],
  },
};

// Syntax highlighting is loaded only when a code block is on the page.
type Highlighter = { highlight: (code: string, options: { language: string }) => { value: string }; getLanguage: (name: string) => unknown };
let highlighter: Promise<Highlighter> | null = null;
const loadHighlighter = () => (highlighter ??= import("highlight.js/lib/common").then((module) => module.default as unknown as Highlighter));

function CodeBlock({ language, code }: { language: string | null; code: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void loadHighlighter().then((hljs) => {
      if (!active || !language || !hljs.getLanguage(language)) return;
      // highlight.js escapes the code it returns; only its own <span>s are added.
      setHtml(hljs.highlight(code, { language }).value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [code, language]);
  return <pre className="md-code" data-language={language ?? undefined}>
    {html !== null
      ? <code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: html }} />
      : <code className={language ? `language-${language}` : undefined}>{code}</code>}
  </pre>;
}

function text(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(text).join("");
  return "";
}

// Headings in content sit below the page's own headings.
const heading = (Tag: "h3" | "h4" | "h5" | "h6") =>
  function Heading({ children }: ComponentPropsWithoutRef<"h3">) { return <Tag>{children}</Tag>; };

const components: Components = {
  h1: heading("h3"), h2: heading("h4"), h3: heading("h5"), h4: heading("h6"), h5: heading("h6"), h6: heading("h6"),
  a({ href, children }) {
    return <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{children}</a>;
  },
  pre({ children }) {
    // react-markdown wraps a fenced block in <pre><code class="language-x">.
    const child = Array.isArray(children) ? children[0] : children;
    const props = (child as { props?: { className?: string; children?: ReactNode } } | null)?.props;
    const language = props?.className?.match(/language-([\w-]+)/)?.[1] ?? null;
    return <CodeBlock language={language} code={text(props?.children).replace(/\n$/, "")} />;
  },
  input({ type, checked }) {
    // Task list boxes are read only.
    return type === "checkbox" ? <input type="checkbox" checked={Boolean(checked)} readOnly disabled aria-label={checked ? "Done" : "Not done"} /> : null;
  },
  table({ children }) {
    return <div className="md-table"><table>{children}</table></div>;
  },
};

export function Markdown({ text: source, className = "" }: { text: string; className?: string }) {
  return <div className={`md ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMentions]} rehypePlugins={[[rehypeSanitize, schema]]} components={components}>
      {source}
    </ReactMarkdown>
  </div>;
}
