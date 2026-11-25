import { Command } from 'cmdk';

const itemCls =
  'flex h-9 cursor-pointer items-center justify-between rounded-control px-3 text-sm text-fg aria-selected:bg-accent/20 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-40';

export default function CommandPalette({ open, onOpenChange, commands, files, onOpenFile }) {
  const run = (fn) => () => {
    onOpenChange(false);
    // let the dialog close (and return focus) before the action steals it
    setTimeout(fn, 0);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      overlayClassName="fixed inset-0 z-40 bg-black/50"
      contentClassName="fixed left-1/2 top-[18%] z-50 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-panel border border-border-strong bg-panel shadow-pop"
    >
      <Command.Input
        placeholder="Type a command or file name…"
        className="h-11 w-full border-b border-border bg-transparent px-4 text-sm text-fg placeholder:text-faint focus:outline-none focus-visible:outline-none"
      />
      <Command.List className="max-h-[320px] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-sm text-faint">No results.</Command.Empty>

        <Command.Group heading="Actions" className="text-xs text-faint [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
          {commands.map((c) => (
            <Command.Item key={c.id} value={c.label} disabled={c.disabled} onSelect={run(c.run)} className={itemCls}>
              <span>{c.label}</span>
              {c.hint && <kbd className="rounded border border-border px-1 font-mono text-[11px] text-faint">{c.hint}</kbd>}
            </Command.Item>
          ))}
        </Command.Group>

        {files.length > 0 && (
          <Command.Group heading="Open file" className="text-xs text-faint [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
            {files.map((p) => (
              <Command.Item key={p} value={`file ${p}`} onSelect={run(() => onOpenFile(p))} className={itemCls}>
                <span className="truncate font-mono text-xs">{p}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
