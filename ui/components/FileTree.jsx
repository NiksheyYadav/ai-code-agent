import { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronDown, FiChevronRight, FiFile, FiFolder, FiRefreshCw } from 'react-icons/fi';

// Flatten visible rows so the tree can be keyboard-navigated like a listbox.
function flatten(nodes, expanded, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.type === 'directory' && expanded.has(n.path)) flatten(n.children || [], expanded, depth + 1, out);
  }
  return out;
}

function allDirs(nodes, out = []) {
  for (const n of nodes) {
    if (n.type === 'directory') {
      out.push(n.path);
      allDirs(n.children || [], out);
    }
  }
  return out;
}

export default function FileTree({ tree, activePath, onOpen, onRefresh, loaded }) {
  const [expanded, setExpanded] = useState(new Set());
  const [focused, setFocused] = useState(null);
  const seen = useRef(new Set());
  const listRef = useRef(null);

  // New folders start expanded the first time we see them.
  useEffect(() => {
    const fresh = allDirs(tree).filter((p) => !seen.current.has(p));
    if (!fresh.length) return;
    fresh.forEach((p) => seen.current.add(p));
    setExpanded((e) => new Set([...e, ...fresh]));
  }, [tree]);

  const rows = useMemo(() => flatten(tree, expanded), [tree, expanded]);
  const current = focused && rows.some((r) => r.path === focused) ? focused : activePath && rows.some((r) => r.path === activePath) ? activePath : rows[0]?.path;

  const toggle = (path, force) =>
    setExpanded((e) => {
      const next = new Set(e);
      const want = force ?? !next.has(path);
      want ? next.add(path) : next.delete(path);
      return next;
    });

  const focusRow = (path) => {
    setFocused(path);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-path="${CSS.escape(path)}"]`)?.focus());
  };

  const onKeyDown = (e) => {
    const i = rows.findIndex((r) => r.path === current);
    if (i < 0) return;
    const row = rows[i];
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[i + 1] && focusRow(rows[i + 1].path); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); rows[i - 1] && focusRow(rows[i - 1].path); }
    else if (e.key === 'ArrowRight' && row.type === 'directory') { e.preventDefault(); toggle(row.path, true); }
    else if (e.key === 'ArrowLeft' && row.type === 'directory') { e.preventDefault(); toggle(row.path, false); }
    else if (e.key === 'Home') { e.preventDefault(); focusRow(rows[0].path); }
    else if (e.key === 'End') { e.preventDefault(); focusRow(rows[rows.length - 1].path); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      row.type === 'directory' ? toggle(row.path) : onOpen(row.path);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Files</h2>
        <button onClick={onRefresh} aria-label="Refresh files" className="grid h-6 w-6 place-items-center rounded text-faint hover:bg-hover hover:text-fg">
          <FiRefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {!loaded ? (
          <div className="space-y-2 p-2" aria-hidden="true">
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-3 text-sm text-faint">No files yet. Describe what to build in the agent panel.</p>
        ) : (
          <ul ref={listRef} role="tree" aria-label="Project files" onKeyDown={onKeyDown}>
            {rows.map((r) => {
              const isDir = r.type === 'directory';
              const isActive = r.path === activePath;
              return (
                <li key={r.path} role="none">
                  <button
                    role="treeitem"
                    data-path={r.path}
                    aria-level={r.depth + 1}
                    aria-expanded={isDir ? expanded.has(r.path) : undefined}
                    aria-selected={isActive}
                    tabIndex={r.path === current ? 0 : -1}
                    onFocus={() => setFocused(r.path)}
                    onClick={() => (isDir ? toggle(r.path) : onOpen(r.path))}
                    style={{ paddingLeft: 8 + r.depth * 14 }}
                    className={`flex h-7 w-full items-center gap-1.5 rounded-control pr-2 text-left text-sm transition-colors duration-100 ${
                      isActive ? 'bg-accent/20 text-fg' : 'text-muted hover:bg-hover hover:text-fg'
                    }`}
                  >
                    {isDir ? (
                      expanded.has(r.path) ? <FiChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <FiChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    {isDir ? <FiFolder className="h-3.5 w-3.5 shrink-0 text-accent-text" aria-hidden="true" /> : <FiFile className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden="true" />}
                    <span className="truncate">{r.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
