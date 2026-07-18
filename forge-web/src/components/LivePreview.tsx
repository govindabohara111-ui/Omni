'use client';

import { useMemo } from 'react';
import { ExternalLink, Globe, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/useStore';

export function LivePreview() {
  const project = useStore((s) => s.project);
  const previewNonce = useStore((s) => s.previewNonce);
  const refreshPreview = useStore((s) => s.refreshPreview);

  const url = useMemo(() => {
    if (!project?.hostPort) return null;
    // The sandbox port is published on the machine running the Docker daemon.
    return `http://localhost:${project.hostPort}`;
  }, [project?.hostPort]);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-card/40">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-mono">{url ?? 'no sandbox'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={refreshPreview}
            title="Reload preview"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              asChild
              title="Open in new tab"
            >
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-white">
        {url ? (
          <iframe
            // Changing the key forces a full iframe reload.
            key={previewNonce}
            src={url}
            title="Live preview"
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-background p-4 text-center text-sm text-muted-foreground">
            The live preview will appear here once the sandbox dev server is
            running on port 3000.
          </div>
        )}
      </div>
    </div>
  );
}
