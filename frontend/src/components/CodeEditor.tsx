import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { EditorState, Extension } from '@codemirror/state';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { markdown } from '@codemirror/lang-markdown';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { autocompletion, closeBrackets } from '@codemirror/autocomplete';

function getLanguageExtension(fileName: string): Extension | null {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'json':
      return json();
    case 'yml':
    case 'yaml':
      return yaml();
    case 'xml':
    case 'html':
    case 'htm':
      return xml();
    case 'md':
    case 'markdown':
      return markdown();
    case 'java':
      return java();
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript();
    case 'ts':
    case 'tsx':
    case 'jsx':
      return javascript({ typescript: true, jsx: true });
    default:
      return null;
  }
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  fileName: string;
  onSave?: () => void;
  readOnly?: boolean;
}

export default function CodeEditor({ value, onChange, fileName, onSave, readOnly = false }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      history(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      oneDark,
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        indentWithTab,
        {
          key: 'Mod-s',
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '13px',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        },
        '.cm-gutters': {
          backgroundColor: '#0d1117',
          borderRight: '1px solid #21262d',
        },
        '.cm-activeLineGutter': {
          backgroundColor: '#161b22',
        },
        '&.cm-focused': {
          outline: 'none',
        },
      }),
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    const lang = getLanguageExtension(fileName);
    if (lang) extensions.push(lang);

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [fileName, readOnly]); // Recreate editor when file changes

  // Update content when value changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden bg-dark-950"
    />
  );
}
