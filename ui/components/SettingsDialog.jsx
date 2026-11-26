import { useEffect, useRef, useState } from 'react';
import { API_URL, apiFetch, getApiKey, setApiKey } from '../lib/api';

// Native <dialog>: focus trap, Esc to close and aria-modal come for free.
export default function SettingsDialog({ open, onClose, authRequired, onSaved, notice }) {
  const ref = useRef(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setKey(getApiKey());
      setError('');
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    // Remove any whitespace/newlines picked up when copying.
    const clean = key.replace(/\s+/g, '');
    setKey(clean);
    setError('');

    if (clean.includes(',')) {
      setError('That looks like several keys joined by commas. Paste just one key.');
      return;
    }
    if (authRequired && !clean) {
      setError('This server needs an API key.');
      return;
    }

    // Check the key BEFORE closing, so a wrong key shows a message instead of looping.
    if (clean) {
      setChecking(true);
      try {
        await apiFetch('/api/tree', { apiKey: clean });
      } catch (err) {
        setChecking(false);
        setError(
          err.status === 401
            ? 'That key was not accepted. Check for a missing or extra character, and for a capital letter added by your keyboard.'
            : err.message
        );
        return;
      }
      setChecking(false);
    }
    setApiKey(clean);
    onSaved();
    onClose();
  };

  const message = error || notice;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="settings-title"
      className="w-[min(420px,calc(100vw-24px))] rounded-panel border border-border-strong bg-panel p-0 text-fg shadow-pop backdrop:bg-black/50"
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <h2 id="settings-title" className="text-base font-semibold">
            Settings
          </h2>
          <p className="mt-1 text-sm text-muted">
            {authRequired ? 'This server requires an API key.' : 'This server does not require an API key.'} It is stored only in this browser.
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">API key</span>
          <input
            type="password"
            name="api-key"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError('');
            }}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={!!message}
            aria-describedby="key-message"
            className="h-9 w-full rounded-control border border-border-strong bg-bg px-3 text-fg placeholder:text-faint focus:border-accent focus:outline-none"
            placeholder={authRequired ? 'Paste one key, e.g. cnx_…' : 'Optional'}
          />
        </label>
        <p id="key-message" role="alert" className={`min-h-[20px] text-sm ${message ? 'text-danger' : 'text-faint'}`}>
          {message || ''}
        </p>
        <p className="text-xs text-faint">
          API: <span className="font-mono">{API_URL}</span>
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 rounded-control border border-border-strong px-3 text-sm hover:bg-hover">
            Cancel
          </button>
          <button
            type="submit"
            disabled={checking}
            className="h-8 rounded-control bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
