import React, { useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfigRawEditorProps {
  configJson: string;
  onChange: (json: string) => void;
  validationErrors: string[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfigRawEditor({
  configJson,
  onChange,
  validationErrors,
}: ConfigRawEditorProps) {
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoType | null>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Auto-format on mount
    editor.getAction('editor.action.formatDocument')?.run();

    // Apply any initial validation errors
    applyMarkers(monaco, editor, validationErrors);
  };

  function applyMarkers(
    monaco: typeof MonacoType,
    editor: MonacoType.editor.IStandaloneCodeEditor,
    errors: string[],
  ) {
    const model = editor.getModel();
    if (!model) return;

    if (errors.length === 0) {
      monaco.editor.setModelMarkers(model, 'config-validation', []);
      return;
    }

    const markers: MonacoType.editor.IMarkerData[] = errors.map((msg) => ({
      severity: monaco.MarkerSeverity.Error,
      message: msg,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    }));

    monaco.editor.setModelMarkers(model, 'config-validation', markers);
  }

  // Re-apply markers whenever validationErrors changes
  React.useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      applyMarkers(monacoRef.current, editorRef.current, validationErrors);
    }
  }, [validationErrors]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #27272a',
        borderRadius: '8px',
        overflow: 'hidden',
        height: 'calc(100vh - 200px)',
        minHeight: '400px',
      }}
    >
      <Editor
        height="100%"
        language="json"
        theme="vs-dark"
        value={configJson}
        onChange={(value) => onChange(value ?? '')}
        onMount={handleMount}
        options={{
          fontSize: 14,
          wordWrap: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 2,
          formatOnPaste: true,
          formatOnType: false,
        }}
      />
    </div>
  );
}
