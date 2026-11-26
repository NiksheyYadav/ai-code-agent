import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { AnimatePresence, m } from 'framer-motion';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Toaster } from 'sonner';
import AgentPanel from '../components/AgentPanel';
import CommandPalette from '../components/CommandPalette';
import Composer from '../components/Composer';
import EditorPane from '../components/EditorPane';
import FileTree from '../components/FileTree';
import Header from '../components/Header';
import SettingsDialog from '../components/SettingsDialog';
import { API_URL } from '../lib/api';
import { useIsMac, useMediaQuery, useTheme } from '../lib/hooks';
import { useWorkspace } from '../lib/useWorkspace';

const SUGGESTIONS = [
  'A FastAPI todo API with tests',
  'A React login form with validation',
  'A Python script that renames files by date',
  'A Flask app with three JSON routes',
];

const fade = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } };

function flattenFiles(nodes, out = []) {
  for (const n of nodes) (n.type === 'directory' ? flattenFiles(n.children || [], out) : out.push(n.path));
  return out;
}

export default function Home() {
  const ws = useWorkspace();
  const { theme, toggle: toggleTheme } = useTheme();
  const mac = useIsMac();
  const mod = mac ? '⌘' : 'Ctrl+';
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('generate');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState('agent');
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const filesPanel = useRef(null);
  const composer = useRef(null);

  const hasFile = !!ws.active;
  const effectiveMode = hasFile ? mode : 'generate';
  const hasWorkspace = ws.tree.length > 0 || ws.open.length > 0;

  useEffect(() => {
    if (ws.needsKey) setSettingsOpen(true);
  }, [ws.needsKey]);

  const handleRun = useCallback(async () => {
    const ok = await ws.run(effectiveMode, prompt);
    if (ok) {
      setPrompt('');
      setMobileTab('code');
    }
  }, [ws, effectiveMode, prompt]);

  const openFile = useCallback(
    async (p) => {
      await ws.openFile(p);
      setMobileTab('code');
    },
    [ws]
  );

  const toggleFiles = useCallback(() => {
    if (isMobile) return setMobileTab('files');
    const p = filesPanel.current;
    if (!p) return;
    p.isCollapsed() ? p.expand() : p.collapse();
  }, [isMobile]);

  const focusComposer = useCallback((nextMode) => {
    if (nextMode) setMode(nextMode);
    setMobileTab('agent');
    setTimeout(() => composer.current?.focus(), 0);
  }, []);

  // Global shortcuts. The editor handles its own Mod-S and marks the event handled.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.defaultPrevented) return;
      const k = e.key.toLowerCase();
      if (k === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); }
      else if (k === 's') { e.preventDefault(); if (ws.active) ws.saveFile(ws.active); }
      else if (k === 'b') { e.preventDefault(); toggleFiles(); }
      else if (k === '/') { e.preventDefault(); focusComposer(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ws, toggleFiles, focusComposer]);

  const commands = useMemo(
    () => [
      { id: 'gen', label: 'Generate new files…', hint: `${mod}/`, run: () => focusComposer('generate') },
      { id: 'edit', label: 'Edit the open file…', disabled: !hasFile, run: () => focusComposer('edit') },
      { id: 'fix', label: 'Fix the open file', disabled: !hasFile, run: () => ws.run('fix', prompt) },
      { id: 'save', label: 'Save file', hint: `${mod}S`, disabled: !hasFile, run: () => ws.active && ws.saveFile(ws.active) },
      { id: 'files', label: 'Toggle file tree', hint: `${mod}B`, run: toggleFiles },
      { id: 'theme', label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`, run: toggleTheme },
      { id: 'refresh', label: 'Refresh files', run: ws.reload },
      { id: 'settings', label: 'Settings / API key', run: () => setSettingsOpen(true) },
    ],
    [mod, hasFile, ws, prompt, theme, toggleFiles, toggleTheme, focusComposer]
  );

  const composerProps = {
    value: prompt,
    onChange: setPrompt,
    onSubmit: handleRun,
    busy: ws.busy,
    mode: effectiveMode,
    onModeChange: setMode,
    hasFile,
    mod,
  };

  const filesNode = (
    <FileTree tree={ws.tree} loaded={ws.treeLoaded} activePath={ws.active} onOpen={openFile} onRefresh={ws.reload} />
  );
  const editorNode = (
    <EditorPane
      open={ws.open}
      active={ws.active}
      buffers={ws.buffers}
      dirty={ws.dirty}
      proposal={ws.proposal}
      onSelect={ws.setActive}
      onClose={ws.closeTab}
      onChange={ws.setText}
      onSave={ws.saveFile}
      onAccept={ws.acceptProposal}
      onReject={ws.rejectProposal}
      mod={mod}
    />
  );
  const agentNode = <AgentPanel thread={ws.thread} composerProps={composerProps} composerRef={composer} />;

  const last = ws.thread[ws.thread.length - 1];

  return (
    <>
      <Head>
        <title>CodeNex — AI code workspace</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Describe what to build. Review every change before it is saved." />
      </Head>

      <div className="flex h-full flex-col">
        <Header
          health={ws.health}
          theme={theme}
          onToggleTheme={toggleTheme}
          onPalette={() => setPaletteOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onToggleFiles={toggleFiles}
          showFilesToggle={hasWorkspace && !isMobile}
          mod={mod}
        />

        <main className="min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            {!ws.treeLoaded ? (
              <m.div key="loading" {...fade} className="h-full" />
            ) : !hasWorkspace ? (
              /* ---------------- Empty state: one centred composer ---------------- */
              <m.div key="hero" {...fade} className="grid h-full place-items-center overflow-y-auto px-4 py-10">
                <div className="w-full max-w-[680px]">
                  <h1 className="text-2xl font-semibold tracking-tight">What do you want to build?</h1>
                  <p className="mb-5 mt-1 text-base text-muted">Describe it in plain English. Edits and fixes are shown as a diff for you to accept before anything is saved.</p>

                  <Composer ref={composer} variant="hero" autoFocus {...composerProps} mode="generate" />

                  <div className="mt-4 flex flex-wrap gap-2" aria-label="Suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => { setPrompt(s); composer.current?.focus(); }}
                        className="rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors duration-100 hover:border-border-strong hover:bg-hover hover:text-fg"
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <div role="status" aria-live="polite" className="mt-5 min-h-[24px] text-sm">
                    {ws.busy && <span className="text-muted">{last?.stage || 'Working…'}</span>}
                    {!ws.busy && last?.status === 'error' && <span className="text-danger">{last.message}</span>}
                    {ws.health.state === 'offline' && (
                      <p className="text-warn">
                        Can’t reach the API at <span className="font-mono">{API_URL}</span>. Start it with{' '}
                        <span className="font-mono">uvicorn agent.server:create_app --factory --port 8000</span>.
                      </p>
                    )}
                  </div>
                </div>
              </m.div>
            ) : isMobile ? (
              /* ---------------- Mobile: one pane at a time ---------------- */
              <m.div key="mobile" {...fade} className="flex h-full flex-col">
                <div className="min-h-0 flex-1 bg-panel">
                  {mobileTab === 'files' && filesNode}
                  {mobileTab === 'code' && editorNode}
                  {mobileTab === 'agent' && agentNode}
                </div>
                <div role="tablist" aria-label="Workspace view" className="grid shrink-0 grid-cols-3 border-t border-border bg-panel">
                  {[['files', 'Files'], ['code', 'Code'], ['agent', 'Agent']].map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={mobileTab === id}
                      onClick={() => setMobileTab(id)}
                      className={`h-12 text-sm font-medium ${mobileTab === id ? 'text-accent-text' : 'text-muted'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </m.div>
            ) : (
              /* ---------------- Desktop: three resizable panes ---------------- */
              <m.div key="workspace" {...fade} className="h-full">
                <PanelGroup direction="horizontal" autoSaveId="codenex-layout">
                  <Panel
                    id="files" order={1} ref={filesPanel} defaultSize={18} minSize={12} maxSize={32}
                    collapsible collapsedSize={0}
                    onCollapse={() => setFilesCollapsed(true)} onExpand={() => setFilesCollapsed(false)}
                    className="bg-panel"
                  >
                    {!filesCollapsed && filesNode}
                  </Panel>
                  <PanelResizeHandle className="w-px" />
                  <Panel id="editor" order={2} minSize={30}>
                    {editorNode}
                  </Panel>
                  <PanelResizeHandle className="w-px" />
                  <Panel id="agent" order={3} defaultSize={28} minSize={20} maxSize={45} className="bg-panel">
                    {agentNode}
                  </Panel>
                </PanelGroup>
              </m.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} files={flattenFiles(ws.tree)} onOpenFile={openFile} />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); ws.setNeedsKey(false); ws.setKeyRejected(false); }}
        notice={ws.keyRejected ? 'Your saved key was rejected by the server. Enter a valid key.' : ''}
        authRequired={ws.health.authRequired}
        onSaved={ws.reload}
      />
      <Toaster theme={theme} position="bottom-right" closeButton />
    </>
  );
}
