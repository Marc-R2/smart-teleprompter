import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { normalizeMarkdownInput } from "../lib/scriptModel";

const TOOLBAR = [
  [
    { label: "B", title: "Bold", style: { fontWeight: 700 }, mark: "bold", run: (c) => c.toggleBold() },
    { label: "I", title: "Italic", style: { fontStyle: "italic" }, mark: "italic", run: (c) => c.toggleItalic() },
    { label: "U", title: "Underline", style: { textDecoration: "underline" }, mark: "underline", run: (c) => c.toggleUnderline() },
    { label: "S", title: "Strikethrough", style: { textDecoration: "line-through" }, mark: "strike", run: (c) => c.toggleStrike() },
    { label: "Mark", title: "Highlight", mark: "highlight", run: (c) => c.toggleHighlight() },
  ],
  [
    { label: "H1", title: "Heading 1", mark: "heading", attrs: { level: 1 }, run: (c) => c.toggleHeading({ level: 1 }) },
    { label: "H2", title: "Heading 2", mark: "heading", attrs: { level: 2 }, run: (c) => c.toggleHeading({ level: 2 }) },
    { label: "H3", title: "Heading 3", mark: "heading", attrs: { level: 3 }, run: (c) => c.toggleHeading({ level: 3 }) },
  ],
  [
    { label: "• List", title: "Bullet list", mark: "bulletList", run: (c) => c.toggleBulletList() },
    { label: "1. List", title: "Numbered list", mark: "orderedList", run: (c) => c.toggleOrderedList() },
    { label: "Table", title: "Insert table", run: (c) => c.insertTable({ rows: 2, cols: 2, withHeaderRow: true }) },
    { label: "—", title: "Divider", run: (c) => c.setHorizontalRule() },
  ],
  [
    { label: "Co-host", title: "Another speaker's part: shown dimmed, voice tracking skips it", mark: "blockquote", run: (c) => c.toggleBlockquote() },
    { label: "Not spoken", title: "Note to yourself: visible, never tracked", mark: "codeBlock", run: (c) => c.toggleCodeBlock() },
    { label: "Inline note", title: "Short note inside a sentence: visible, never tracked", mark: "code", run: (c) => c.toggleCode() },
  ],
  [
    { label: "↶", title: "Undo", run: (c) => c.undo() },
    { label: "↷", title: "Redo", run: (c) => c.redo() },
  ],
];

const ALL_BUTTONS = TOOLBAR.flat();

export default function MarkdownEditor({ value, onChange, minHeight = "40vh" }) {
  const [sourceMode, setSourceMode] = useState(false);
  const lastEmitted = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Highlight,
      TableKit,
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    ],
    content: normalizeMarkdownInput(value),
    contentType: "markdown",
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown();
      lastEmitted.current = markdown;
      onChange(markdown);
    },
    editorProps: {
      attributes: { "aria-label": "Script text" },
      // Pasted plain text is often Markdown already, or a script with line
      // breaks that should be kept. Rich text keeps the default handling.
      handlePaste: (_view, event) => {
        const data = event.clipboardData;
        if (!data || data.getData("text/html")) return false;
        const pasted = data.getData("text/plain");
        if (!pasted) return false;
        editorRef.current?.commands.insertContent(
          normalizeMarkdownInput(pasted),
          { contentType: "markdown" }
        );
        return true;
      },
    },
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // Text can also change from outside, e.g. Clear or loading a script.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(normalizeMarkdownInput(value), {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, value]);

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      ALL_BUTTONS.map((button) =>
        button.mark ? current.isActive(button.mark, button.attrs) : false
      ),
  });

  return (
    <div className="tp-editor">
      <div className="tp-editor-toolbar" role="toolbar" aria-label="Formatting">
        {!sourceMode &&
          TOOLBAR.map((group, groupIndex) => (
            <div className="tp-editor-group" key={groupIndex}>
              {group.map((button) => (
                <button
                  key={button.title}
                  type="button"
                  title={button.title}
                  aria-label={button.title}
                  aria-pressed={!!active?.[ALL_BUTTONS.indexOf(button)]}
                  style={button.style}
                  // Keeps the text selection while the button is pressed.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => button.run(editor.chain().focus()).run()}
                >
                  {button.label}
                </button>
              ))}
            </div>
          ))}
        <button
          type="button"
          className="tp-editor-source"
          aria-pressed={sourceMode}
          title="Edit the Markdown source directly"
          onClick={() => setSourceMode((current) => !current)}
        >
          {sourceMode ? "Rich text" : "Markdown"}
        </button>
      </div>
      {sourceMode ? (
        <textarea
          className="tp-editor-textarea"
          aria-label="Markdown source"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{ minHeight }}
        />
      ) : (
        <div style={{ "--tp-editor-min-height": minHeight }}>
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
}
