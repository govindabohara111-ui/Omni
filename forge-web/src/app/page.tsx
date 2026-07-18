'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Hammer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ProjectSummary {
  id: string;
  name: string;
  hostPort: number | null;
  createdAt: string;
}

/**
 * Landing page: creates a project (+ Docker sandbox) and redirects to the
 * IDE at /p/[id]. Also lists recent projects for quick access.
 */
export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [recent, setRecent] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => Array.isArray(data) && setRecent(data))
      .catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'Untitled Project' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create project');
      router.push(`/p/${data.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create project',
      );
      setCreating(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
          <Hammer className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Forge Web</h1>
        <p className="max-w-md text-muted-foreground">
          A team of AI agents that plans, writes and runs full-stack web apps
          inside an isolated Docker sandbox — live, in your browser.
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex w-full max-w-md gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name (e.g. Kanban Board)"
          disabled={creating}
          autoFocus
        />
        <Button type="submit" disabled={creating}>
          {creating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting sandbox…
            </>
          ) : (
            <>
              Create <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      {recent.length > 0 && (
        <div className="w-full max-w-md">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent projects
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {recent.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => router.push(`/p/${p.id}`)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
