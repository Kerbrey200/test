/**
 * EVO-CORE SOURCE TEXT UTILITIES
 * Tiny language-aware helpers shared by the AST scanner and the MQL validator:
 * comment/string blanking that preserves offsets and line numbers, balanced
 * bracket matching and top-level argument splitting.
 */

const PYTHON_EXTENSIONS = new Set(['.py', '.pyw']);

export function languageOf(ext = '') {
  return PYTHON_EXTENSIONS.has(String(ext).toLowerCase()) ? 'python' : 'c';
}

/**
 * Replaces comments (and optionally string contents) with spaces. Newlines are kept,
 * so every index and line number in the result matches the original text.
 * @param {string} content
 * @param {string} ext File extension deciding the comment syntax ('.py' or C-like)
 * @param {{keepStrings?: boolean}} [options]
 */
export function blankSource(content = '', ext = '.js', { keepStrings = true } = {}) {
  const src = String(content);
  const out = src.split('');
  const python = languageOf(ext) === 'python';
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (!python && ch === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
    } else if (!python && ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (python && ch === '#') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
    } else if (ch === '"' || ch === "'" || (!python && ch === '`')) {
      const triple = python && src.startsWith(ch.repeat(3), i);
      const delimiter = triple ? ch.repeat(3) : ch;
      let j = i + delimiter.length;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src.startsWith(delimiter, j)) break;
        if (!triple && ch !== '`' && src[j] === '\n') break; // unterminated single-line string
        j++;
      }
      const contentEnd = Math.min(j, src.length);
      if (!keepStrings) blank(i + delimiter.length, contentEnd);
      i = src.startsWith(delimiter, j) ? j + delimiter.length : contentEnd;
    } else {
      i++;
    }
  }

  return out.join('');
}

/**
 * Returns the index of the bracket that closes the one at `openIndex`, or -1.
 */
export function matchBracket(text, openIndex) {
  const open = text[openIndex];
  const close = { '(': ')', '[': ']', '{': '}' }[open];
  if (!close) return -1;
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Splits an argument list on top-level commas (ignores commas nested in brackets).
 * @param {string} text
 * @param {{angles?: boolean}} [options] Treat <> as brackets (TypeScript generics); off for
 *        call arguments, where < and > are comparison operators.
 */
export function splitTopLevel(text, { angles = false } = {}) {
  const opening = angles ? '([{<' : '([{';
  const closing = angles ? ')]}>' : ')]}';
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of String(text)) {
    if (opening.includes(ch)) depth++;
    else if (closing.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * Builds a fast index -> 1-based line number lookup for a text.
 */
export function lineLocator(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}
