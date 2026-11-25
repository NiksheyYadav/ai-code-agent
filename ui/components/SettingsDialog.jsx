import { useEffect, useRef, useState } from 'react';
import { API_URL, getApiKey, setApiKey } from '../lib/api';

// Native <dialog>: focus trap, Esc to close and aria-modal come for free.
export default function SettingsDialog({ open, onClose, authRequired, onSaved }) {
  const ref = useRef(null);
  const [key, setKey] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setKey(getApiKey());
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const submit = (e) => {
    e.preventDefault();
    setApiKey(key.trim());
    onSaved();
    onClose();
  };

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
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full rounded-control border border-border-strong bg-bg px-3 text-fg placeholder:text-faint focus:border-accent focus:outline-none"
            placeholder={authRequired ? 'Paste your key' : 'Optional'}
          />
        </label>
        <p className="text-xs text-faint">
          API: <span className="font-mono">{API_URL}</span>
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 rounded-control border border-border-strong px-3 text-sm hover:bg-hover">
            Cancel
          </button>
          <button type="submit" className="h-8 rounded-control bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
