// Print-safe text input: a character limit with a live counter, and input filtering.
// Generic on purpose — any field marked data-maxlen="N" gets both, so later free-text fields
// need no new code here. Catching this at typing time is what replaces a pile of repair scripts
// at print time (over-long text that does not fit its frame, and glyphs the print font has no shape for).

// Characters that have a sensible print equivalent: map them instead of dropping them.
const MAP = [
  [/\r\n?/g, '\n'],
  [/[‘’‚‛′ʼ´`]/g, "'"],   // curly single quotes, prime, acute
  [/[“”„‟″«»]/g, '"'],         // curly double quotes, guillemets
  [/[‐‑‒–—―−]/g, '-'],         // dashes and minus
  [/…/g, '...'],
  [/[  -   　]/g, ' '],              // non-breaking and exotic spaces
  [/[|¦｜]/g, ' '],                                      // the pipe breaks CSV and tagged-text exports
];

// Dropped outright: pictographs, variation selectors, bidi and zero-width controls, control codes.
// \n is deliberately outside the control range below so multi-line fields survive.
const DROP = /[\p{Extended_Pictographic}︀-️⃣​-‏‪-‮⁠-⁤⁦-⁩﻿­\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu;

// What the print font is trusted to have: Hebrew (letters, niqqud, geresh, gershayim, maqaf),
// Latin, digits, and a small punctuation set.
const OK_CHAR = /[\p{Script=Hebrew}A-Za-z0-9 \n.,:;!?'"()\[\]\-\/&%+=@#*]/u;

// Cleans a value for print. multiline keeps line breaks; single-line collapses everything to spaces.
export function sanitizeText(value, { multiline = false } = {}) {
  let s = String(value ?? '').normalize('NFC');
  for (const [re, to] of MAP) s = s.replace(re, to);
  s = s.replace(DROP, '');
  if (multiline) {
    s = s.split('\n').map(l => l.replace(/[^\S\n]+/g, ' ').trim()).join('\n');
    s = s.replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  } else {
    s = s.replace(/\s+/g, ' ').trim();
  }
  return s;
}

// Characters left over that the print font is not trusted to have. Empty array means clean.
export function badChars(value) {
  return [...new Set([...String(value ?? '')].filter(c => !OK_CHAR.test(c)))];
}

const len = s => [...s].length;   // count code points, so a surrogate pair is one character

// Wires every [data-maxlen] field inside scope: a counter that updates as you type, a hard cap,
// and print cleaning on blur and on paste. Idempotent, so re-rendering a dialog body is safe.
export function wireTextFields(scope = document) {
  for (const el of scope.querySelectorAll('[data-maxlen]')) {
    if (el._textWired) continue;
    el._textWired = true;
    const max = Math.max(1, +el.dataset.maxlen || 1);
    const multiline = el.tagName === 'TEXTAREA';
    // Quiet by default: a short field shows its counter only once the limit is in reach.
    // data-count="always" keeps it visible, which is what a long free-text field wants.
    const always = el.dataset.count === 'always';
    el.setAttribute('maxlength', String(max));

    const note = document.createElement('small');
    note.className = 'charcount';
    note.setAttribute('aria-live', 'polite');
    (el.closest('label') || el.parentNode).append(note);

    const paint = (extra = '') => {
      const left = max - len(el.value);
      const near = left <= Math.max(8, Math.round(max * 0.3));
      const count = left >= 0 ? `נותרו ${left} תווים` : `${-left} תווים מעל המותר`;
      note.textContent = always || near || extra ? count + extra : '';
      note.classList.toggle('near', left >= 0 && left <= Math.max(8, Math.round(max * 0.15)));
      note.classList.toggle('over', left < 0);
    };
    const trim = () => { if (len(el.value) > max) el.value = [...el.value].slice(0, max).join(''); };
    // Returns true when the value had to be changed, so a caller can tell the user.
    const clean = () => {
      trim();
      const out = sanitizeText(el.value, { multiline });
      const changed = out !== el.value;
      el.value = out;
      const odd = badChars(out);
      paint(changed ? ' · תווים שהדפוס לא מכיר הוסרו' : odd.length ? ` · בדקו את התווים ${odd.join(' ')}` : '');
      return changed;
    };

    el.addEventListener('input', () => { trim(); paint(); });
    el.addEventListener('blur', clean);
    el.addEventListener('paste', () => setTimeout(clean, 0));
    el._cleanText = clean;
    el._paintText = paint;   // for a field another field writes into
    paint();
  }
}

// Cleans every wired field in scope right before a save. True when something was changed.
export function cleanTextFields(scope = document) {
  let changed = false;
  for (const el of scope.querySelectorAll('[data-maxlen]')) if (el._cleanText?.()) changed = true;
  return changed;
}
