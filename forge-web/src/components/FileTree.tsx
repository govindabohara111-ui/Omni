'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

/** Fetch the file list from the sandbox and push it into the store. */
export async function refreshFiles(projectId: string): Promise<void> {
  try {
    const res = await fetch(`/api/files?projectId=${encodeURIComponent(projectId)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.files)) {
      useStore.getState().setFiles(data.files);
    }
  } catch {
    // Sandbox may not be ready yet; the next refresh will succeed.
  }
}

interface TreeNode {
  name: string;
  path: string; // full path inside the container, e.g. /app/src/App.tsx
  children: Map<string, TreeNode>;
  isFile: boolean;
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = {
    name: 'app',
    path: '/app',
    children: new Map(),
    isFile: false,
  };

  for (const fullPath of paths) {
    const relative = fullPath.replace(/^\/app\/?/, '');
    if (!relative) continue;
    const parts = relative.split('/');
    let node = root;
    let acc = '/app';
    parts.forEach((part, i) => {
      acc += `/${part}`;
      const isFile = i === parts.length - 1;
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: acc,
          children: new Map(),
          isFile,
        });
      }
      node = node.children.get(part)!;
    });
  }

  return root;
}

function fileIcon(name: string) {
  if (/\.(json|lock)$/.test(name)) return FileJson;
  if (/\.(t|j)sx?$|\.(css|html|vue|svelte)$/.test(name)) return FileCode2;
  if (/\.(md|txt|log)$/.test(name)) return FileText;
  return File;
}

function sortedChildren(node: TreeNode): TreeNode[] {
  return Array.from(node.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1; // folders first
    return a.name.localeCompare(b.name);
  });
}

function TreeEntry({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const selectedFile = useStore((s) => s.selectedFile);

  async function handleFileClick() {
    const store = useStore.getState();
    const projectId = store.project?.id;
    if (!projectId) return;

    store.setActiveTab('code');
    store.setSelectedFile(node.path, null); // null content = loading state
    try {
      const res = await fetch(
        `/api/files?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(node.path)}`,
      );
      const data = await res.json();
      if (res.ok) {
        store.setSelectedFile(node.path, String(data.content ?? ''));
      } else {
        store.setSelectedFile(node.path, `// Failed to load: ${data.error}`);
      }
    } catch (err) {
      store.setSelectedFile(
        node.path,
        `// Failed to load file: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (node.isFile) {
    const Icon = fileIcon(node.name);
    return (
      <button
        onClick={handleFileClick}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs hover:bg-accent',
          selectedFile === node.path && 'bg-accent text-primary',
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        title={node.path}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs font-medium hover:bg-accent"
        style={{ paddingLeft: `${depth * 12 + 2}px` }}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {open ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open &&
        sortedChildren(node).map((child) => (
          <TreeEntry key={child.path} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

export function FileTree() {
  const project = useStore((s) => s.project);
  const files = useStore((s) => s.files);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!project) return;
    void refreshFiles(project.id);
    // Light polling keeps the tree fresh while agents install packages etc.
    const interval = setInterval(() => void refreshFiles(project.id), 15_000);
    return () => clearInterval(interval);
  }, [project]);

  const tree = useMemo(() => buildTree(files), [files]);
  const entries = sortedChildren(tree);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Files
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={refreshing || !project}
          onClick={async () => {
            if (!project) return;
            setRefreshing(true);
            await refreshFiles(project.id);
            setRefreshing(false);
          }}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
        </Button>
      </div>
      <div className="forge-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
        {entries.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            The sandbox is empty. Ask the agents to build something!
          </p>
        ) : (
          entries.map((node) => <TreeEntry key={node.path} node={node} depth={0} />)
        )}
      </div>
    </div>
  );
}
