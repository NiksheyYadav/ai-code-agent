import { FiCommand, FiKey, FiMoon, FiSidebar, FiSun } from 'react-icons/fi';

function StatusPill({ health }) {
  let tone = 'bg-faint';
  let label = 'Connecting…';
  if (health.state === 'offline') {
    tone = 'bg-danger';
    label = 'Offline';
  } else if (health.state === 'ok') {
    const demo = health.backend === 'mock';
    tone = demo ? 'bg-warn' : 'bg-success';
    label = demo ? 'Demo model' : health.backend.replace(/^hosted:|^local:/, '');
  }
  return (
    <span
      role="status"
      title={health.state === 'ok' ? `Backend: ${health.backend}` : label}
      className="hidden max-w-[180px] items-center gap-1.5 truncate rounded-full border border-border px-2.5 py-1 text-xs text-muted sm:inline-flex"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

const iconBtn = 'grid h-8 w-8 place-items-center rounded-control text-muted transition-colors duration-100 hover:bg-hover hover:text-fg';

export default function Header({ health, theme, onToggleTheme, onPalette, onSettings, onToggleFiles, showFilesToggle, mod }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-panel px-3">
      <div className="flex items-center gap-2">
        {showFilesToggle && (
          <button onClick={onToggleFiles} aria-label="Toggle files" title={`Toggle files (${mod}B)`} className={iconBtn}>
            <FiSidebar className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-xs font-semibold text-white" aria-hidden="true">
          C
        </span>
        <span className="text-sm font-semibold tracking-tight">CodeNex</span>
      </div>

      <div className="flex items-center gap-1.5">
        <StatusPill health={health} />
        <button
          onClick={onPalette}
          className="hidden h-8 items-center gap-2 rounded-control border border-border px-2.5 text-xs text-muted transition-colors hover:border-border-strong hover:text-fg sm:flex"
        >
          <FiCommand className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Commands</span>
          <kbd className="rounded border border-border px-1 font-mono text-[11px]">{mod}K</kbd>
        </button>
        <button onClick={onPalette} aria-label="Open command palette" className={`${iconBtn} sm:hidden`}>
          <FiCommand className="h-4 w-4" aria-hidden="true" />
        </button>
        <button onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} className={iconBtn}>
          {theme === 'dark' ? <FiSun className="h-4 w-4" aria-hidden="true" /> : <FiMoon className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button onClick={onSettings} aria-label="Settings" className={iconBtn}>
          <FiKey className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
