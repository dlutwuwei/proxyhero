import { EditorView } from "@codemirror/view";

export const bodyEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "#1e1e1e",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "12px",
    lineHeight: "20px",
  },
  ".cm-gutters": {
    fontSize: "11px",
    backgroundColor: "#252526",
    color: "#666",
    borderRight: "1px solid #333",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-activeLineGutter": { backgroundColor: "#2a2d2e" },
  ".cm-activeLine": { backgroundColor: "#2a2d2e44" },
});

export const bodyEditorReadOnly = EditorView.editable.of(false);
