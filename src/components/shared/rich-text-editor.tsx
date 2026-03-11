"use client";

import { useEditor, EditorContent, type Editor, ReactRenderer } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import {
  MentionList,
  type MentionItem,
  type MentionListRef,
} from "./mention-list";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Undo,
  Redo,
  Heading1,
  Heading2,
  Heading3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  TEMPLATE_VARIABLE_META,
  CATEGORY_COLORS,
} from "./template-variable-extension";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  /** "markdown" emits markdown text; "html" emits raw HTML */
  outputFormat?: "markdown" | "html";
  /** Show the formatting toolbar */
  showToolbar?: boolean;
  /** Minimum height for the editor area */
  minHeight?: string;
  /** Additional class names for the editor wrapper */
  className?: string;
  /** If true, the editor is read-only */
  editable?: boolean;
  /** Enable @mention support with this list of mentionable items */
  mentionItems?: MentionItem[];
  /** Enable [variable] chip highlighting for template editing */
  enableTemplateVariables?: boolean;
}

export type { MentionItem };

/**
 * Convert basic markdown to HTML for TipTap ingestion.
 * Handles bold, italic, links, headers, and bullet lists.
 */
function markdownToHtml(md: string): string {
  if (!md) return "";

  let html = md;

  // Mentions: @[DisplayName](userId) → TipTap mention span
  // Must run before link conversion since the syntax is similar.
  // TipTap's Mention extension re-renders the node with its own "@" prefix,
  // so the text content here is just for initial parsing.
  html = html.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g,
    '<span data-type="mention" data-id="$2" data-label="$1" class="mention">$1</span>'
  );

  // Bold: **text** → <strong>text</strong>
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text* → <em>text</em> (after bold has been replaced)
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links: [text](url) → <a href="url">text</a>
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bullet lists: group consecutive "- " lines into <ul>
  // NOTE: TipTap requires <p> inside <li> for correct parsing.
  // The regex (\n|$) consumes the trailing newline — we must restore it
  // so that blank lines after the list aren't swallowed.
  html = html.replace(
    /(^- .+$(\n|$))+/gm,
    (match) => {
      const items = match
        .split("\n")
        .filter((line) => line.startsWith("- "))
        .map((line) => `<li><p>${line.slice(2)}</p></li>`)
        .join("");
      // Restore trailing newline consumed by the regex
      const trail = match.endsWith("\n") ? "\n" : "";
      return `<ul>${items}</ul>${trail}`;
    }
  );

  // Ordered lists: group consecutive "1. " lines into <ol>
  // NOTE: TipTap requires <p> inside <li> for correct parsing.
  html = html.replace(
    /(^\d+\. .+$(\n|$))+/gm,
    (match) => {
      const items = match
        .split("\n")
        .filter((line) => /^\d+\. /.test(line))
        .map((line) => `<li><p>${line.replace(/^\d+\. /, "")}</p></li>`)
        .join("");
      const trail = match.endsWith("\n") ? "\n" : "";
      return `<ol>${items}</ol>${trail}`;
    }
  );

  // Paragraphs: every line becomes its own block so headings can be
  // applied independently. Empty lines become empty paragraphs for spacing.
  const lines = html.split("\n");
  html = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<p></p>"; // preserve blank line spacing
      // Don't wrap lines that are already block-level elements
      if (/^<(h[1-6]|ul|ol|li|blockquote|div|p)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p>${trimmed}</p>`;
    })
    .join("");

  return html;
}

/**
 * Convert TipTap HTML output back to markdown.
 */
function htmlToMarkdown(html: string): string {
  if (!html) return "";

  let md = html;

  // Mention nodes: <span data-type="mention" data-id="ID" data-label="Name">...</span>
  md = md.replace(
    /<span[^>]*data-type="mention"[^>]*data-id="([^"]*)"[^>]*data-label="([^"]*)"[^>]*>[^<]*<\/span>/gi,
    "@[$2]($1)"
  );
  // Also handle the alternative attribute order
  md = md.replace(
    /<span[^>]*data-type="mention"[^>]*data-label="([^"]*)"[^>]*data-id="([^"]*)"[^>]*>[^<]*<\/span>/gi,
    "@[$1]($2)"
  );

  // Strong/bold
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");

  // Italic
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");

  // Links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");

  // List items in unordered lists (use [\s\S] instead of . with s flag)
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner: string) => {
    return (
      inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n").replace(/<\/?p>/gi, "") + "\n"
    );
  });

  // Ordered list items
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner: string) => {
    let index = 1;
    return (
      inner
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match: string, content: string) => {
          return `${index++}. ${content}\n`;
        })
        .replace(/<\/?p>/gi, "") + "\n"
    );
  });

  // Empty paragraphs (including those with just <br>) → blank line marker.
  // We use a marker so the blank line isn't consumed by subsequent tag stripping.
  const BLANK = "\u0000BL\u0000";
  md = md.replace(/<p[^>]*>\s*(?:<br[^>]*>)?\s*<\/p>/gi, BLANK);

  // Paragraphs → single newline
  md = md.replace(/<\/p>/gi, "\n");
  md = md.replace(/<p[^>]*>/gi, "");

  // Restore blank line markers as actual newlines
  md = md.replace(/\u0000BL\u0000/g, "\n");

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, " ");

  // Clean up excessive newlines (4+ → 3, preserving intentional double-blank-lines)
  md = md.replace(/\n{4,}/g, "\n\n\n");

  return md.trim();
}

function ToolbarButton({
  onClick,
  isActive,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 w-7 p-0",
        isActive && "bg-accent text-accent-foreground"
      )}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}

function LinkButton({ editor }: { editor: Editor }) {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  const handleSetLink = useCallback(() => {
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    }
    setUrl("");
    setOpen(false);
  }, [editor, url]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 w-7 p-0",
            editor.isActive("link") && "bg-accent text-accent-foreground"
          )}
          title="Add link"
          onClick={() => {
            const existingHref = editor.getAttributes("link").href;
            if (existingHref) setUrl(existingHref);
          }}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="flex gap-2">
          <Input
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSetLink();
              }
            }}
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8" onClick={handleSetLink}>
            Set
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="mx-1 h-4 w-px bg-border" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="mx-1 h-4 w-px bg-border" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Numbered list"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="mx-1 h-4 w-px bg-border" />

      <LinkButton editor={editor} />
      {editor.isActive("link") && (
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Remove link"
        >
          <Unlink className="h-3.5 w-3.5" />
        </ToolbarButton>
      )}

      <div className="mx-1 h-4 w-px bg-border" />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title="Undo"
      >
        <Undo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title="Redo"
      >
        <Redo className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

/**
 * Build TipTap Mention suggestion config that renders a React dropdown.
 */
function buildMentionSuggestion(itemsRef: React.RefObject<MentionItem[]>) {
  return {
    items: ({ query }: { query: string }) => {
      const items = itemsRef.current ?? [];
      if (!query) return items.slice(0, 10);
      const lower = query.toLowerCase();
      return items
        .filter(
          (item) =>
            item.label.toLowerCase().includes(lower) ||
            (item.slackHandle?.toLowerCase().includes(lower) ?? false) ||
            (item.email?.toLowerCase().includes(lower) ?? false)
        )
        .slice(0, 10);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: (): any => {
      let component: ReactRenderer<MentionListRef> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onStart: (props: any) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor as Editor,
          });

          if (!props.clientRect) return;

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onUpdate: (props: any) => {
          component?.updateProps(props);
          if (props.clientRect && popup?.[0]) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },
        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  };
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Start writing...",
  outputFormat = "markdown",
  showToolbar = true,
  minHeight = "120px",
  className,
  editable = true,
  mentionItems,
  enableTemplateVariables = false,
}: RichTextEditorProps) {
  const mentionItemsRef = useRef<MentionItem[]>(mentionItems ?? []);
  useEffect(() => {
    mentionItemsRef.current = mentionItems ?? [];
  }, [mentionItems]);

  const extensions = useMemo(() => {
    const exts = [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ];

    if (mentionItems) {
      exts.push(
        Mention.configure({
          HTMLAttributes: {
            class: "mention",
          },
          suggestion: buildMentionSuggestion(mentionItemsRef),
        }) as unknown as typeof StarterKit
      );
    }

    // Add template variable chip decoration plugin
    if (enableTemplateVariables) {
      const TemplateVarExt = Extension.create({
        name: "templateVariableHighlight",
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey("templateVariableInput"),
              props: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                decorations(state: any) {
                  const decorations: Decoration[] = [];
                  const doc = state.doc;

                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  doc.descendants((node: any, pos: number) => {
                    if (!node.isText || !node.text) return;
                    const text = node.text as string;
                    // Match [variableName] or [Link Text | variableName]
                    const regex = /\[([^\]]+)\]/g;
                    let match;
                    while ((match = regex.exec(text)) !== null) {
                      const fullMatch = match[1];
                      let variable: string;
                      if (fullMatch.includes("|")) {
                        variable = fullMatch.split("|").pop()?.trim() ?? "";
                      } else {
                        variable = fullMatch.trim();
                      }

                      if (variable in TEMPLATE_VARIABLE_META) {
                        const meta = TEMPLATE_VARIABLE_META[variable];
                        const category = meta?.category ?? "project";
                        const cssClass =
                          CATEGORY_COLORS[category] ?? "template-var-project";
                        const from = pos + match.index;
                        const to = from + match[0].length;
                        decorations.push(
                          Decoration.inline(from, to, {
                            class: `template-variable-chip ${cssClass}`,
                          })
                        );
                      }
                    }
                  });

                  return DecorationSet.create(doc, decorations);
                },
              },
            }),
          ];
        },
      });
      exts.push(TemplateVarExt as unknown as typeof StarterKit);
    }

    return exts;
    // Only rebuild extensions when mentionItems presence changes (not contents)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mentionItems, placeholder, enableTemplateVariables]);

  const editor = useEditor({
    extensions,
    content: outputFormat === "markdown" ? markdownToHtml(content) : content,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none",
          "px-3 py-2",
          "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0",
          "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-2",
          "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:my-2",
          "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:my-1"
        ),
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor }) => {
      if (outputFormat === "markdown") {
        onChange(htmlToMarkdown(editor.getHTML()));
      } else {
        onChange(editor.getHTML());
      }
    },
  });

  // Sync external content changes (e.g., reset to template)
  useEffect(() => {
    if (!editor) return;

    const currentHtml = editor.getHTML();
    const incomingHtml =
      outputFormat === "markdown" ? markdownToHtml(content) : content;

    // Only update if content has actually changed externally
    // Compare the markdown output to avoid unnecessary re-renders
    const currentOutput =
      outputFormat === "markdown"
        ? htmlToMarkdown(currentHtml)
        : currentHtml;

    if (currentOutput !== content) {
      editor.commands.setContent(incomingHtml, { emitUpdate: false });
    }
  }, [content, editor, outputFormat]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "rounded-md border bg-background text-sm ring-offset-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className
      )}
    >
      {showToolbar && editable && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
