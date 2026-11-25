import { useEffect, useRef } from 'react';
import { m } from 'framer-motion';
import { FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import Composer from './Composer';

const LABEL = { generate: 'Generate', edit: 'Edit', fix: 'Fix' };

function Entry({ item }) {
  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-1.5"
    >
      <div className="rounded-panel bg-raised px-3 py-2">
        <span className="mb-0.5 block text-xs font-medium text-accent-text">
          {LABEL[item.kind]}
          {item.path ? ` · ${item.path}` : ''}
        </span>
        <p className="whitespace-pre-wrap break-words text-sm text-fg">{item.prompt || 'Fix syntax errors and obvious bugs'}</p>
      </div>
      <div className="flex items-start gap-2 px-1 text-sm">
        {item.status === 'running' && (
          <>
            <span className="mt-1 h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-accent-text" aria-hidden="true" />
            <span className="text-muted">{item.stage}</span>
          </>
        )}
        {item.status === 'done' && (
          <>
            <FiCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span className="min-w-0 text-muted">
              {item.message}
              {item.kind === 'generate' && item.files?.length > 0 && (
                <span className="mt-0.5 block truncate font-mono text-xs text-faint">{item.files.join(', ')}</span>
              )}
            </span>
          </>
        )}
        {item.status === 'error' && (
          <>
            <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <span className="text-danger">{item.message}</span>
          </>
        )}
      </div>
    </m.li>
  );
}

export default function AgentPanel({ thread, composerProps, composerRef }) {
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [thread]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Agent</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" role="log" aria-live="polite" aria-label="Agent activity">
        {thread.length === 0 ? (
          <div className="mt-6 text-center text-sm text-faint">
            <p>Ask for a new project, or open a file and ask for a change.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {thread.map((item) => (
              <Entry key={item.id} item={item} />
            ))}
          </ul>
        )}
        <div ref={end} />
      </div>

      <div className="shrink-0 p-3 pt-0">
        <Composer ref={composerRef} variant="dock" {...composerProps} />
      </div>
    </div>
  );
}
