import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { unifiedMergeView } from '@codemirror/merge';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';

const c = (name, alpha) => (alpha ? `rgb(var(--${name}) / ${alpha})` : `rgb(var(--${name}))`);

// Colours come from CSS variables, so light/dark switching needs no editor rebuild.
const chrome = EditorView.theme({
  '&': { color: c('fg'), backgroundColor: 'transparent' },
  '.cm-content': { caretColor: c('accent-text'), padding: '12px 0' },
  '.cm-cursor': { borderLeftColor: c('accent-text') },
  '.cm-gutters': { backgroundColor: 'transparent', color: c('faint'), border: 'none' },
  '.cm-activeLine': { backgroundColor: c('hover', '0.5') },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: c('muted') },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: c('accent', '0.35') },
  '.cm-changedLine': { backgroundColor: c('success', '0.10') },
  '.cm-deletedChunk': { backgroundColor: c('danger', '0.10'), paddingLeft: '6px' },
  '.cm-deletedChunk .cm-deletedLine, .cm-deletedLine': { backgroundColor: c('danger', '0.12') },
  '.cm-insertedLine': { backgroundColor: c('success', '0.14') },
  '.cm-changedText': { backgroundColor: c('success', '0.28') },
  '.cm-deletedText': { backgroundColor: c('danger', '0.28') },
  '.cm-chunkButtons button': {
    background: c('raised'), color: c('fg'), border: `1px solid ${c('border-strong')}`,
    borderRadius: '6px', padding: '1px 8px', fontSize: '12px', cursor: 'pointer',
  },
  '.cm-chunkButtons button[name=accept]': { color: c('success') },
  '.cm-chunkButtons button[name=reject]': { color: c('danger') },
});

const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: c('syn-keyword') },
    { tag: [t.string, t.special(t.string), t.regexp], color: c('syn-string') },
    { tag: [t.number, t.bool, t.null, t.atom], color: c('syn-number') },
    { tag: [t.comment, t.lineComment, t.blockComment], color: c('syn-comment'), fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: c('syn-func') },
    { tag: [t.typeName, t.className, t.namespace], color: c('syn-type') },
    { tag: [t.propertyName, t.attributeName], color: c('syn-type') },
    { tag: [t.heading, t.strong], fontWeight: '600' },
  ])
);

export default function CodeView({ path, value, onChange, onSave, original }) {
  const [lang, setLang] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLang(null);
    const desc = LanguageDescription.matchFilename(languages, path);
    if (desc) desc.load().then((support) => !cancelled && setLang(support)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);

  const extensions = useMemo(() => {
    const ext = [
      chrome,
      highlight,
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (onSave?.(), true) },
        ])
      ),
    ];
    if (lang) ext.push(lang);
    if (original != null) ext.push(unifiedMergeView({ original, mergeControls: true, gutter: true }));
    return ext;
    // original is captured when a proposal opens; the component is keyed on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, original != null]);

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme="none"
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ foldGutter: false, autocompletion: false, highlightActiveLine: true, highlightSelectionMatches: false }}
      aria-label={`Editor for ${path}`}
      style={{ height: '100%' }}
    />
  );
}
