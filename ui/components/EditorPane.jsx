import dynamic from 'next/dynamic';
import { FiCheck, FiCopy, FiDownload, FiFileText, FiX } from 'react-icons/fi';
import { toast } from 'sonner';

// CodeMirror is heavy: load it only when a file is open.
const CodeView = dynamic(() => import('./CodeView'), {
  ssr: false,
  loading: () => (
    <div className="p-6 space-y-3" aria-hidden="true">
      <div className="skeleton h-3 w-2/3" />
      <div className="skeleton h-3 w-1/2" />
      <div className="skeleton h-3 w-3/4" />
    </div>
  ),
});

const base = (p) => p.split('/').pop();

export default function EditorPane({ open, active, buffers, dirty, proposal, onSelect, onClose, onChange, onSave, onAccept, onReject, mod }) {
  const buf = active ? buffers[active] : null;
  const reviewing = proposal && proposal.path === active;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buf.text);
      toast.success('Copied to clipboard', { id: 'copy' });
    } catch {
      toast.error('Could not copy');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([buf.text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = base(active);
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open.length) {
    return (
      <div className="h-full grid place-items-center text-muted">
        <div className="text-center">
          <FiFileText className="mx-auto mb-3 h-8 w-8 text-faint" aria-hidden="true" />
          <p className="text-sm">Open a file, or describe what to build.</p>
          <p className="mt-1 text-xs text-faint">
            <kbd className="rounded border border-border px-1">{mod}K</kbd> for commands
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div role="tablist" aria-label="Open files" className="flex shrink-0 overflow-x-auto border-b border-border bg-panel">
        {open.map((p) => {
          const selected = p === active;
          return (
            <div
              key={p}
              className={`group flex shrink-0 items-center border-r border-border ${selected ? 'bg-bg text-fg' : 'text-muted hover:bg-hover'}`}
            >
              <button
                role="tab"
                aria-selected={selected}
                title={p}
                onClick={() => onSelect(p)}
                className="flex h-9 items-center gap-2 pl-3 pr-1 text-sm"
              >
                <span className="max-w-[160px] truncate">{base(p)}</span>
                {dirty[p] && <span className="h-1.5 w-1.5 rounded-full bg-accent-text" aria-label="Unsaved changes" />}
              </button>
              <button
                onClick={() => onClose(p)}
                aria-label={`Close ${base(p)}`}
                className="mr-1 grid h-5 w-5 place-items-center rounded text-faint hover:bg-hover hover:text-fg"
              >
                <FiX className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Proposal banner */}
      {reviewing && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-raised px-3 py-2" role="status">
          <span className="text-sm text-fg">Review proposed changes</span>
          <span className="text-xs text-muted hidden sm:inline">Use the per-change buttons, or accept everything.</span>
          <div className="ml-auto flex gap-2">
            <button onClick={onReject} className="h-7 rounded-control border border-border-strong px-3 text-sm text-fg hover:bg-hover">
              Reject
            </button>
            <button onClick={onAccept} className="h-7 rounded-control bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover">
              Accept &amp; save
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {buf && (
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3 text-xs text-faint">
          <span className="truncate font-mono" title={active}>{active}</span>
          <div className="flex items-center gap-1">
            <button onClick={copy} aria-label="Copy file contents" className="grid h-6 w-6 place-items-center rounded hover:bg-hover hover:text-fg">
              <FiCopy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button onClick={download} aria-label="Download file" className="grid h-6 w-6 place-items-center rounded hover:bg-hover hover:text-fg">
              <FiDownload className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => onSave(active)}
              disabled={!dirty[active] || reviewing}
              className="ml-1 flex h-6 items-center gap-1 rounded px-2 text-fg enabled:hover:bg-hover disabled:text-faint"
              title={`Save (${mod}S)`}
            >
              <FiCheck className="h-3.5 w-3.5" aria-hidden="true" /> Save
            </button>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="min-h-0 flex-1 overflow-hidden bg-bg">
        {buf && (
          <CodeView
            key={`${active}:${reviewing ? 'diff' : 'edit'}`}
            path={active}
            value={buf.text}
            original={reviewing ? proposal.original : undefined}
            onChange={(text) => onChange(active, text)}
            onSave={() => onSave(active)}
          />
        )}
      </div>
    </div>
  );
}
