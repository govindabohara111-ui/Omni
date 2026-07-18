'use client';

import dynamic from 'next/dynamic';
import { FileCode2, Loader2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

// Monaco must never be rendered on the server.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
});

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  sql: 'sql',
  py: 'python',
  svg: 'xml',
  xml: 'xml',
  vue: 'html',
  svelte: 'html',
};

function languageFor(path: string | null): string {
  if (!path) return 'plaintext';
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_BY_EXT[ext] ?? 'plaintext';
}

export function CodeViewer() {
  const selectedFile = useStore((s) => s.selectedFile);
  const content = useStore((s) => s.selectedFileContent);

  if (!selectedFile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FileCode2 className="h-8 w-8" />
        <p className="text-sm">Select a file in the tree to view its code.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-card/40 px-3 py-1.5 font-mono text-xs text-muted-foreground">
        {selectedFile}
      </div>
      <div className="min-h-0 flex-1">
        {content === null ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            theme="vs-dark"
            language={languageFor(selectedFile)}
            value={content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              renderWhitespace: 'none',
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
