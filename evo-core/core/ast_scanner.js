/**
 * EVO-CORE AST CONTEXT SCANNER
 * Lightweight, zero-dependency static structural scanner for JS/TS/Python/MQL files.
 * Extracts function signatures (with line numbers), classes, imports and exports prior
 * to code mutation. Comments and string contents are blanked first, so commented-out
 * code and code inside strings are never reported.
 */

import fs from 'node:fs';
import path from 'node:path';
import { blankSource, languageOf, lineLocator, matchBracket, splitTopLevel } from './source_utils.js';

const MAX_SCAN_BYTES = 5 * 1024 * 1024;
const C_LIKE_EXTENSIONS = new Set(['.mq4', '.mq5', '.mqh', '.c', '.cc', '.cpp', '.h', '.hpp']);
const NOT_FUNCTIONS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'else', 'do', 'case', 'new', 'delete',
  'throw', 'typeof', 'function', 'with', 'await', 'yield', 'void', 'super', 'import', 'constructor'
]);
const C_TYPE_BLOCKERS = new Set(['return', 'else', 'new', 'delete', 'throw', 'case', 'goto', 'typedef']);

function paramsOf(cleaned, openIndex, { angles = false } = {}) {
  const close = matchBracket(cleaned, openIndex);
  if (close === -1) return null;
  return { close, params: splitTopLevel(cleaned.slice(openIndex + 1, close), { angles }) };
}

function skipSpace(text, index) {
  while (index < text.length && /\s/.test(text[index])) index++;
  return index;
}

export class ASTScanner {
  /**
   * Scans a file and extracts structural metadata.
   */
  static scanFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found for AST scan: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);
    if (stat.size > MAX_SCAN_BYTES) throw new Error(`File too large for AST scan (${stat.size} bytes): ${filePath}`);

    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    return { filePath, ...ASTScanner.scanSource(content, ext) };
  }

  /**
   * Scans source text directly (used by the web API, where no file exists).
   */
  static scanSource(content = '', ext = '.js') {
    const text = String(content).replace(/\r\n/g, '\n');
    const lowerExt = String(ext).toLowerCase();
    const code = blankSource(text, lowerExt, { keepStrings: false });
    const withStrings = blankSource(text, lowerExt, { keepStrings: true });
    const lineOf = lineLocator(text);

    return {
      ext: lowerExt,
      lineCount: text.split('\n').length,
      functions: ASTScanner.extractFunctions(code, lowerExt, lineOf),
      classes: ASTScanner.extractClasses(code, lowerExt, lineOf),
      imports: ASTScanner.extractImports(withStrings, lowerExt),
      exports: ASTScanner.extractExports(code, lowerExt)
    };
  }

  /**
   * Extracts function names, parameter lists and 1-based line numbers.
   * @param {string} code Source with comments and strings blanked
   */
  static extractFunctions(code, ext, lineOf = lineLocator(code)) {
    let found;
    if (languageOf(ext) === 'python') found = ASTScanner.pythonFunctions(code);
    else if (C_LIKE_EXTENSIONS.has(ext)) found = ASTScanner.cLikeFunctions(code);
    else found = ASTScanner.jsFunctions(code);

    const seen = new Set();
    return found
      .sort((a, b) => a.index - b.index)
      .filter(f => (seen.has(f.index) ? false : seen.add(f.index)))
      .map(({ index, ...fn }) => ({ ...fn, line: lineOf(index) }));
  }

  static pythonFunctions(code) {
    const functions = [];
    const defRegex = /^[ \t]*(async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(/gm;
    let match;
    while ((match = defRegex.exec(code)) !== null) {
      const parsed = paramsOf(code, match.index + match[0].length - 1, { angles: false });
      if (!parsed) continue;
      functions.push({
        name: match[2],
        params: parsed.params,
        type: 'python',
        async: Boolean(match[1]),
        index: match.index + match[0].indexOf(match[2])
      });
    }
    return functions;
  }

  static cLikeFunctions(code) {
    const functions = [];
    const nameRegex = /([A-Za-z_~][\w]*(?:::[A-Za-z_~]\w*)*)[ \t]*\(/g;
    let match;
    while ((match = nameRegex.exec(code)) !== null) {
      const name = match[1];
      const bare = name.split('::').pop();
      if (NOT_FUNCTIONS.has(bare)) continue;

      // Must be preceded by a return type (identifier, * or &), not by an operator, '.' or a keyword.
      const before = code.slice(Math.max(0, match.index - 80), match.index);
      const typeMatch = before.match(/([A-Za-z_]\w*)[\s*&]+$/);
      if (!typeMatch || C_TYPE_BLOCKERS.has(typeMatch[1])) continue;

      const parsed = paramsOf(code, match.index + match[0].length - 1);
      if (!parsed) continue;
      // Definition: ')' [const] [export|override] '{'
      const after = code.slice(parsed.close + 1, parsed.close + 60);
      if (!/^\s*(?:const\s*)?(?:export\s*)?(?:override\s*)?\{/.test(after)) continue;

      functions.push({ name, params: parsed.params, type: 'mql_c', index: match.index });
    }
    return functions;
  }

  static jsFunctions(code) {
    const functions = [];
    let match;

    // function name(...) / async function* name(...)
    const declRegex = /\b(async\s+)?function\b\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/g;
    while ((match = declRegex.exec(code)) !== null) {
      const parsed = paramsOf(code, match.index + match[0].length - 1, { angles: true });
      if (!parsed) continue;
      functions.push({ name: match[2], params: parsed.params, type: 'js_function', async: Boolean(match[1]), index: match.index + match[0].indexOf(match[2], (match[1] || '').length) });
    }

    // const name = (...) => / const name = async x => / const name = function (...)
    const bindingRegex = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(async\s+)?(?:(function\b\s*\*?\s*[\w$]*\s*\()|(\()|([A-Za-z_$][\w$]*)\s*=>)/g;
    while ((match = bindingRegex.exec(code)) !== null) {
      const [, name, isAsync, fnExpr, paren, singleParam] = match;
      const nameIndex = match.index + match[0].indexOf(name);
      if (singleParam) {
        functions.push({ name, params: [singleParam], type: 'js_arrow', async: Boolean(isAsync), index: nameIndex });
        continue;
      }
      const parsed = paramsOf(code, match.index + match[0].length - 1, { angles: true });
      if (!parsed) continue;
      if (fnExpr) {
        functions.push({ name, params: parsed.params, type: 'js_function', async: Boolean(isAsync), index: nameIndex });
      } else if (paren && /^\s*(?::[^=]+?)?=>/.test(code.slice(parsed.close + 1, parsed.close + 120))) {
        functions.push({ name, params: parsed.params, type: 'js_arrow', async: Boolean(isAsync), index: nameIndex });
      }
    }

    // Class / object methods at the start of a line: [modifiers] name(...) [: Type] {
    const methodRegex = /^[ \t]*(?:(?:public|private|protected|static|async|get|set|override|readonly|abstract)\s+)*\*?\s*(#?[A-Za-z_$][\w$]*)\s*(?:<[^>\n]*>)?\s*\(/gm;
    while ((match = methodRegex.exec(code)) !== null) {
      const name = match[1];
      if (NOT_FUNCTIONS.has(name)) continue;
      const parsed = paramsOf(code, match.index + match[0].length - 1, { angles: true });
      if (!parsed) continue;
      const brace = skipSpace(code, parsed.close + 1);
      const afterParams = code.slice(brace, brace + 200);
      if (!/^(?::[^{;]+)?\{/.test(afterParams)) continue;
      functions.push({ name, params: parsed.params, type: 'js_method', async: /\basync\s/.test(match[0]), index: match.index + match[0].lastIndexOf(name) });
    }

    return functions;
  }

  /**
   * Extracts class definitions (JS/TS, Python and C++/MQL syntax).
   */
  static extractClasses(code, ext, lineOf = lineLocator(code)) {
    const classes = [];
    let match;

    if (languageOf(ext) === 'python') {
      const pyClass = /^[ \t]*class[ \t]+([A-Za-z_]\w*)[ \t]*(?:\(([^)]*)\))?[ \t]*:/gm;
      while ((match = pyClass.exec(code)) !== null) {
        const bases = splitTopLevel(match[2] || '').filter(b => !/^metaclass\s*=/.test(b));
        classes.push({ name: match[1], extends: bases[0] || null, line: lineOf(match.index) });
      }
      return classes;
    }

    if (C_LIKE_EXTENSIONS.has(ext)) {
      const cppClass = /\b(?:class|struct)\s+([A-Za-z_]\w*)\s*(?::\s*(?:public|protected|private)?\s*([A-Za-z_]\w*))?\s*\{/g;
      while ((match = cppClass.exec(code)) !== null) {
        classes.push({ name: match[1], extends: match[2] || null, line: lineOf(match.index) });
      }
      return classes;
    }

    const jsClass = /\bclass\s+([A-Za-z_$][\w$]*)(?:\s*<[^>]*>)?(?:\s+extends\s+([A-Za-z_$][\w$.]*))?/g;
    while ((match = jsClass.exec(code)) !== null) {
      classes.push({ name: match[1], extends: match[2] || null, line: lineOf(match.index) });
    }
    return classes;
  }

  /**
   * Extracts imported dependencies.
   * @param {string} code Source with comments blanked but string contents kept
   */
  static extractImports(code, ext) {
    const imports = [];
    let match;

    if (languageOf(ext) === 'python') {
      const fromImport = /^[ \t]*from[ \t]+([.\w]+)[ \t]+import\b/gm;
      while ((match = fromImport.exec(code)) !== null) imports.push(match[1]);
      const plainImport = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*)/gm;
      while ((match = plainImport.exec(code)) !== null) {
        for (const part of match[1].split(',')) imports.push(part.trim().split(/\s+as\s+/)[0]);
      }
    } else if (C_LIKE_EXTENSIONS.has(ext)) {
      const include = /^[ \t]*#include[ \t]*[<"]([^>"\n]+)[>"]/gm;
      while ((match = include.exec(code)) !== null) imports.push(match[1].trim());
    } else {
      const patterns = [
        /\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?['"]([^'"\n]+)['"]/g,
        /\bexport\s+(?:\*|\{[^}]*\})(?:\s+as\s+[\w$]+)?\s+from\s+['"]([^'"\n]+)['"]/g,
        /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
        /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g
      ];
      for (const pattern of patterns) {
        while ((match = pattern.exec(code)) !== null) imports.push(match[1]);
      }
    }

    return [...new Set(imports)];
  }

  /**
   * Extracts exported symbols (JS/TS).
   */
  static extractExports(code, ext) {
    if (languageOf(ext) === 'python' || C_LIKE_EXTENSIONS.has(ext)) return [];
    const exportsList = [];
    let match;

    const declared = /\bexport\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
    while ((match = declared.exec(code)) !== null) exportsList.push(match[1]);

    const named = /\bexport\s*\{([^}]*)\}/g;
    while ((match = named.exec(code)) !== null) {
      for (const item of match[1].split(',')) {
        const name = item.trim().split(/\s+as\s+/).pop();
        if (name) exportsList.push(name);
      }
    }

    return [...new Set(exportsList)];
  }
}
