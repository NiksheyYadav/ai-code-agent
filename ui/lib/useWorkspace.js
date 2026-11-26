import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, getApiKey } from './api';

let nextId = 1;

/**
 * All workspace state in one place: file tree, open tabs, per-file buffers,
 * the pending edit/fix proposal (shown as a diff), and the agent thread.
 */
export function useWorkspace() {
  const [health, setHealth] = useState({ state: 'loading' });
  const [tree, setTree] = useState([]);
  const [treeLoaded, setTreeLoaded] = useState(false);
  const [open, setOpen] = useState([]); // tab order
  const [active, setActive] = useState(null);
  const [buffers, setBuffers] = useState({}); // path -> { saved, text }
  const [proposal, setProposal] = useState(null); // { path, original }
  const [thread, setThread] = useState([]);
  const [busy, setBusy] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);

  const buffersRef = useRef(buffers);
  const busyRef = useRef(false);
  const proposalRef = useRef(null);
  buffersRef.current = buffers;
  proposalRef.current = proposal;

  const handleError = useCallback((e) => {
    if (e && e.status === 401) setNeedsKey(true);
    toast.error(e?.message || 'Something went wrong');
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const h = await apiFetch('/api/health');
      setHealth({ state: 'ok', backend: h.backend, authRequired: !!h.auth_required });
      setNeedsKey(!!h.auth_required && !getApiKey());
    } catch {
      setHealth({ state: 'offline' });
    }
  }, []);

  const loadTree = useCallback(async () => {
    try {
      const data = await apiFetch('/api/tree');
      setTree(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e.status === 401) setNeedsKey(true);
      else if (e.status === undefined) setHealth({ state: 'offline' });
    } finally {
      setTreeLoaded(true);
    }
  }, []);

  const reload = useCallback(async () => {
    await refreshHealth();
    await loadTree();
  }, [refreshHealth, loadTree]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ---- files ----------------------------------------------------------------
  const activate = useCallback((path) => {
    setOpen((o) => (o.includes(path) ? o : [...o, path]));
    setActive(path);
  }, []);

  const openFile = useCallback(
    async (path) => {
      if (buffersRef.current[path]) return activate(path);
      try {
        const data = await apiFetch(`/api/files/content?path=${encodeURIComponent(path)}`);
        const text = data.content || '';
        setBuffers((b) => ({ ...b, [path]: { saved: text, text } }));
        activate(path);
      } catch (e) {
        handleError(e);
      }
    },
    [activate, handleError]
  );

  const setText = useCallback((path, text) => {
    setBuffers((b) => (b[path] ? { ...b, [path]: { ...b[path], text } } : b));
  }, []);

  const saveFile = useCallback(
    async (path) => {
      const buf = buffersRef.current[path];
      if (!buf) return false;
      try {
        await apiFetch('/api/files/save', { method: 'POST', body: { path, content: buf.text } });
        setBuffers((b) => ({ ...b, [path]: { saved: buf.text, text: buf.text } }));
        toast.success(`Saved ${path}`, { id: `save-${path}` });
        setProposal((p) => (p && p.path === path ? null : p)); // saving while reviewing = accept
        return true;
      } catch (e) {
        handleError(e);
        return false;
      }
    },
    [handleError]
  );

  const closeTab = useCallback((path) => {
    const p = proposalRef.current;
    setBuffers((b) => {
      const buf = b[path];
      if (!buf) return b;
      // closing mid-review rejects the proposal; clean buffers are dropped so reopening re-reads the disk
      const text = p && p.path === path ? p.original : buf.text;
      if (text === buf.saved) {
        const { [path]: _gone, ...rest } = b;
        return rest;
      }
      return { ...b, [path]: { ...buf, text } };
    });
    setProposal((cur) => (cur && cur.path === path ? null : cur));
    setOpen((o) => o.filter((x) => x !== path));
    setActive((a) => (a === path ? null : a));
  }, []);

  // ---- agent ----------------------------------------------------------------
  const patchThread = (id, patch) => setThread((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const run = useCallback(
    async (kind, prompt) => {
      const text = (prompt || '').trim();
      if (busyRef.current) return false;
      if (kind !== 'fix' && !text) return false;
      if (kind !== 'generate' && proposalRef.current) {
        toast.error('Accept or reject the pending changes first.');
        return false;
      }
      const path = active;
      if (kind !== 'generate' && !path) {
        toast.error('Open a file first');
        return false;
      }

      const id = nextId++;
      setThread((t) => [...t, { id, kind, prompt: text, path: kind === 'generate' ? null : path, status: 'running', stage: 'Thinking…' }]);
      busyRef.current = true;
      setBusy(true);
      try {
        if (kind === 'generate') {
          const res = await apiFetch('/api/generate', { method: 'POST', body: { prompt: text } });
          patchThread(id, { stage: 'Writing files…' });
          if (res.file_path && typeof res.code === 'string') {
            // generate rewrites files on disk: drop cached copies of every written file so tabs never show stale content
            const written = new Set(res.files || [res.file_path]);
            setBuffers((b) => {
              const next = { ...b };
              written.forEach((p) => delete next[p]);
              next[res.file_path] = { saved: res.code, text: res.code };
              return next;
            });
            setOpen((o) => o.filter((p) => !written.has(p) || p === res.file_path));
            activate(res.file_path);
          }
          await loadTree();
          patchThread(id, { status: 'done', message: res.message, files: res.files || [] });
          if (res.warnings?.length) toast.warning(res.warnings[0]);
        } else {
          const current = buffersRef.current[path]?.text ?? '';
          const res = await apiFetch(`/api/${kind}`, {
            method: 'POST',
            body: { prompt: text, file_path: path, content: current, preview: true },
          });
          if (res.code === current) {
            patchThread(id, {
              status: 'done',
              message: kind === 'edit' ? 'No changes were needed. The file already does this.' : res.message || 'No changes needed.',
              files: [path],
            });
          } else {
            setProposal({ path, original: current });
            setText(path, res.code);
            patchThread(id, { status: 'done', message: `${res.message}. Review the diff, then accept or reject.`, files: [path] });
          }
        }
        return true;
      } catch (e) {
        patchThread(id, { status: 'error', message: e.message });
        handleError(e);
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [active, activate, loadTree, setText, handleError]
  );

  const acceptProposal = useCallback(async () => {
    if (!proposal) return;
    const ok = await saveFile(proposal.path);
    if (ok) setProposal(null);
  }, [proposal, saveFile]);

  const rejectProposal = useCallback(() => {
    if (!proposal) return;
    setText(proposal.path, proposal.original);
    setProposal(null);
  }, [proposal, setText]);

  const dirty = useMemo(() => {
    const d = {};
    for (const [p, b] of Object.entries(buffers)) d[p] = b.text !== b.saved;
    return d;
  }, [buffers]);

  return {
    health, tree, treeLoaded, open, active, buffers, dirty, proposal, thread, busy, needsKey,
    setNeedsKey, reload, openFile, setActive, setText, saveFile, closeTab, run, acceptProposal, rejectProposal,
  };
}
