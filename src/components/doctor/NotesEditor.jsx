import { useCallback, useEffect, useId, useRef } from 'react';
import { List, ListOrdered, Plus } from 'lucide-react';
import './NotesEditor.css';

/* Structured composer for the clinical note.
   ---------------------------------------------------------------------------
   Deliberately NOT a rich-text editor. `doctorNotes` is a plain string on the
   API and the patient reads it back through a bare <p> in PastAssessmentDetail,
   so anything that stored HTML would either show the patient raw markup or
   force a sanitiser and a renderer onto the patient bundle for a field that is
   read once. What a reviewer actually needs from an editor here is structure
   and speed — lists that continue themselves and the recommendations they type
   on every other case — and all of that survives as plain text with pre-wrap.

   The bullet is U+2022 rather than "-" because it round-trips as something a
   patient reads as a list rather than as a stray dash. */

const BULLET = '• ';
const ORDERED_RE = /^(\s*)(\d+)\.\s/;
const BULLET_RE = new RegExp(`^(\\s*)${BULLET}`);

/* Phrases a reviewer repeats across a shift. Kept short so a chip row does not
   become a form of its own — these are openers to edit, not canned verdicts. */
const QUICK_PHRASES = [
  'Advise review in 10-14 days.',
  'Refer to Oral Medicine.',
  'Biopsy recommended.',
  'Counselled on tobacco cessation.',
  'No suspicious features on the images provided.',
];

function lineBoundsAt(value, index) {
  const start = value.lastIndexOf('\n', index - 1) + 1;
  const foundEnd = value.indexOf('\n', index);
  return [start, foundEnd === -1 ? value.length : foundEnd];
}

export default function NotesEditor({ id, value, onChange, placeholder, rows = 6 }) {
  const textareaRef = useRef(null);
  const hintId = `${useId()}-hint`;

  // Grow with the note instead of making the reviewer scroll a 6-row window;
  // the manual resize handle stays off because the height is driven here.
  const autoSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 150)}px`;
  }, []);

  useEffect(autoSize, [autoSize, value]);

  /* Every edit funnels through here so the undo stack, the caret and the
     controlled value stay in step. execCommand('insertText') is what keeps
     native undo working — writing to .value directly would silently break it.

     `defer` exists because Chrome ignores execCommand while a key event is
     still being dispatched on the target, so the list-continuation path below
     has to let the keydown finish before it writes. Toolbar clicks are already
     clear of that and stay synchronous. */
  const replaceRange = useCallback((start, end, text, { caretAt, defer } = {}) => {
    const apply = () => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
      let inserted = false;
      try {
        // Fires a real input event, so React's onChange still drives the value.
        inserted = document.execCommand('insertText', false, text);
      } catch {
        inserted = false;
      }
      if (!inserted) {
        onChange(`${el.value.slice(0, start)}${text}${el.value.slice(end)}`);
      }
      /* The caret has to be restored after React has re-rendered from the input
         event, not before, or the commit puts it back at the end of the value.
         A timeout rather than requestAnimationFrame: rAF never fires while the
         tab is in the background, which would strand the caret on any edit made
         to a note left open in an inactive tab. */
      const caret = caretAt ?? start + text.length;
      setTimeout(() => {
        el.setSelectionRange(caret, caret);
        autoSize();
      }, 0);
    };

    if (defer) setTimeout(apply, 0);
    else apply();
  }, [autoSize, onChange]);

  /* Toggle across whatever lines the selection touches, matching how a list
     button behaves everywhere else: if every touched line is already in this
     list style, strip it; otherwise convert the lot. */
  function toggleList(ordered) {
    const el = textareaRef.current;
    if (!el) return;
    const [blockStart, blockEnd] = [
      lineBoundsAt(el.value, el.selectionStart)[0],
      lineBoundsAt(el.value, el.selectionEnd)[1],
    ];
    const lines = el.value.slice(blockStart, blockEnd).split('\n');
    const matcher = ordered ? ORDERED_RE : BULLET_RE;
    const allMarked = lines.every((line) => !line.trim() || matcher.test(line));

    let counter = 0;
    const next = lines.map((line) => {
      if (!line.trim()) return line;
      const bare = line.replace(ORDERED_RE, '$1').replace(BULLET_RE, '$1');
      if (allMarked) return bare;
      counter += 1;
      return ordered ? `${counter}. ${bare.trimStart()}` : `${BULLET}${bare.trimStart()}`;
    }).join('\n');

    replaceRange(blockStart, blockEnd, next, { caretAt: blockStart + next.length });
  }

  function insertPhrase(phrase) {
    const el = textareaRef.current;
    if (!el) return;
    const needsBreak = el.value.trim() && !el.value.endsWith('\n');
    const text = `${needsBreak ? '\n' : ''}${phrase}`;
    replaceRange(el.value.length, el.value.length, text);
  }

  /* Enter continues the list the caret is sitting in. Pressing it on an empty
     marker ends the list rather than laying down another one — without that,
     leaving a list means deleting the bullet the editor just wrote for you. */
  function handleKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) return;
    const el = event.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;

    const [lineStart] = lineBoundsAt(el.value, el.selectionStart);
    const line = el.value.slice(lineStart, el.selectionStart);
    const ordered = ORDERED_RE.exec(line);
    const bulleted = BULLET_RE.exec(line);
    if (!ordered && !bulleted) return;

    event.preventDefault();
    const marker = ordered
      ? `${ordered[1]}${Number(ordered[2]) + 1}. `
      : `${bulleted[1]}${BULLET}`;

    // An empty item: clear it and drop out of the list.
    if (line.length === (ordered ? ordered[0].length : bulleted[0].length)) {
      replaceRange(lineStart, el.selectionStart, '', { defer: true });
      return;
    }
    replaceRange(el.selectionStart, el.selectionStart, `\n${marker}`, { defer: true });
  }

  return (
    <div className="notes-editor">
      <div className="notes-editor__toolbar">
        <div className="notes-editor__tools" role="group" aria-label="Formatting">
          <button type="button" title="Bullet list" aria-label="Bullet list" onClick={() => toggleList(false)}>
            <List size={15} />
          </button>
          <button type="button" title="Numbered list" aria-label="Numbered list" onClick={() => toggleList(true)}>
            <ListOrdered size={15} />
          </button>
        </div>
        <div className="notes-editor__phrases" role="group" aria-label="Insert a common recommendation">
          {QUICK_PHRASES.map((phrase) => (
            <button type="button" key={phrase} onClick={() => insertPhrase(phrase)}>
              <Plus size={12} /> {phrase.replace(/\.$/, '')}
            </button>
          ))}
        </div>
      </div>

      <textarea
        id={id}
        ref={textareaRef}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={autoSize}
      />

      <p className="notes-editor__hint" id={hintId}>
        <span>Enter continues a list &middot; {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}&#8629; saves the review</span>
        <span className="notes-editor__count">{value.trim().length} characters</span>
      </p>
    </div>
  );
}
