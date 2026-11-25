import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { FiArrowUp } from 'react-icons/fi';

const MODES = [
  { id: 'generate', label: 'Generate', hint: 'Create new files' },
  { id: 'edit', label: 'Edit', hint: 'Change the open file' },
  { id: 'fix', label: 'Fix', hint: 'Repair the open file' },
];

/**
 * Prompt box. `variant="hero"` is the centred first-run composer (generate only);
 * `variant="dock"` is the agent-panel composer with a Generate / Edit / Fix switch.
 */
const Composer = forwardRef(function Composer(
  { value, onChange, onSubmit, busy, mode, onModeChange, hasFile, variant = 'dock', mod, autoFocus },
  ref
) {
  const area = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

  // Auto-grow up to ~8 lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, variant === 'hero' ? 220 : 180)}px`;
  }, [value, variant]);

  const canSubmit = !busy && (mode === 'fix' ? hasFile : value.trim().length > 0 && (mode === 'generate' || hasFile));
  const submit = () => canSubmit && onSubmit();

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const placeholder =
    mode === 'generate'
      ? 'Describe what to build…'
      : mode === 'edit'
        ? 'Describe the change to make to the open file…'
        : 'Optional: describe the problem (or just press Fix)';

  return (
    <div className={`border border-border-strong bg-panel shadow-pop transition-colors duration-150 focus-within:border-accent ${variant === 'hero' ? 'rounded-composer p-3' : 'rounded-panel p-2'}`}>
      <label htmlFor={`composer-${variant}`} className="sr-only">
        Prompt
      </label>
      <textarea
        id={`composer-${variant}`}
        ref={area}
        rows={variant === 'hero' ? 3 : 2}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`w-full resize-none bg-transparent px-2 py-1 text-fg placeholder:text-faint focus:outline-none focus-visible:outline-none ${variant === 'hero' ? 'text-lg' : 'text-sm'}`}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        {variant === 'dock' ? (
          <div role="radiogroup" aria-label="Action" className="flex rounded-control bg-raised p-0.5">
            {MODES.map((m) => {
              const disabled = m.id !== 'generate' && !hasFile;
              return (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={mode === m.id}
                  disabled={disabled}
                  title={disabled ? 'Open a file first' : m.hint}
                  onClick={() => onModeChange(m.id)}
                  className={`h-6 rounded px-2.5 text-xs font-medium transition-colors duration-100 ${
                    mode === m.id ? 'bg-panel text-fg shadow-sm' : 'text-muted enabled:hover:text-fg'
                  } disabled:opacity-40`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="px-2 text-xs text-faint">
            <kbd className="rounded border border-border px-1">{mod}↵</kbd> to generate
          </span>
        )}
        <button
          onClick={submit}
          disabled={!canSubmit}
          aria-label={busy ? 'Working' : mode === 'generate' ? 'Generate' : mode === 'edit' ? 'Edit file' : 'Fix file'}
          title={variant === 'dock' ? `Run (${mod}↵)` : undefined}
          className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white transition-all duration-150 enabled:hover:bg-accent-hover enabled:active:scale-95 disabled:bg-raised disabled:text-faint"
        >
          {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" /> : <FiArrowUp className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
});

export default Composer;
