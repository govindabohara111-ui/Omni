'use client';

import ReactMarkdown from 'react-markdown';
import {
  ArrowRightLeft,
  CheckCircle2,
  FileCode2,
  FilePen,
  Loader2,
  Terminal,
  XCircle,
  Eye,
  Bot,
  User,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { UIMessage, UIToolCall } from '@/store/useStore';

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  read_file: Eye,
  write_file: FileCode2,
  edit_file: FilePen,
  bash: Terminal,
  request_handoff: ArrowRightLeft,
};

function toolSubtitle(call: UIToolCall): string {
  const a = call.args as Record<string, unknown>;
  switch (call.toolName) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return String(a.path ?? '');
    case 'bash':
      return String(a.command ?? '').slice(0, 80);
    case 'request_handoff':
      return `→ ${String(a.target_agent ?? '')}`;
    default:
      return '';
  }
}

function ToolCallBlock({ call }: { call: UIToolCall }) {
  const Icon = TOOL_ICONS[call.toolName] ?? Terminal;

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value={call.id} className="border-none">
        <AccordionTrigger className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs hover:no-underline data-[state=open]:rounded-b-none">
          <span className="flex min-w-0 items-center gap-2">
            {call.status === 'pending' ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            ) : call.isError ? (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-mono font-semibold">{call.toolName}</span>
            <span className="truncate font-mono text-muted-foreground">
              {toolSubtitle(call)}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="rounded-b-md border border-t-0 border-border bg-card px-3 pb-2 pt-2">
          <div className="space-y-2 text-xs">
            <div>
              <div className="mb-1 font-semibold text-muted-foreground">
                Arguments
              </div>
              <pre className="forge-scroll max-h-48 overflow-auto rounded bg-muted p-2 font-mono">
                {JSON.stringify(call.args, null, 2)}
              </pre>
            </div>
            <div>
              <div className="mb-1 font-semibold text-muted-foreground">
                Output
              </div>
              <pre
                className={cn(
                  'forge-scroll max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono',
                  call.isError && 'text-destructive',
                )}
              >
                {call.status === 'pending'
                  ? 'Running…'
                  : call.output || '(no output)'}
              </pre>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function MessageBubble({ message }: { message: UIMessage }) {
  if (message.role === 'handoff' && message.handoff) {
    return (
      <div className="my-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
          <ArrowRightLeft className="h-3 w-3 text-primary" />
          <span className="font-medium text-foreground">
            {message.handoff.from}
          </span>
          →
          <span className="font-medium text-foreground">
            {message.handoff.to}
          </span>
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-2 py-1.5">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
          <User className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 py-1.5">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0 max-w-[90%] flex-1 space-y-1.5">
        {message.agentName && (
          <Badge variant="secondary" className="text-[10px]">
            {message.agentName}
          </Badge>
        )}
        {message.content && (
          <div className="forge-markdown rounded-2xl rounded-tl-sm bg-card px-4 py-2 text-sm">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        {message.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {message.toolCalls.map((call) => (
              <ToolCallBlock key={call.id} call={call} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
