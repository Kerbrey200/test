import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ASTScanner } from '../core/ast_scanner.js';
import { createTempDir, cleanupTempDirs } from './helpers/fixtures.js';

describe('EvoCore AST Scanner: Multi-Language Structure Extractor', () => {

  const tempDir = createTempDir();
  after(cleanupTempDirs);

  it('scans JavaScript and extracts functions, classes, and exports', () => {
    const jsPath = path.join(tempDir, 'sample.js');
    const jsCode = `
      import fs from 'node:fs';
      export class Calculator {
        add(a, b) { return a + b; }
      }
      export function multiply(x, y) {
        return x * y;
      }
      const subtract = (m, n) => m - n;
    `;
    fs.writeFileSync(jsPath, jsCode, 'utf8');

    const result = ASTScanner.scanFile(jsPath);
    assert.strictEqual(result.classes.length, 1);
    assert.strictEqual(result.classes[0].name, 'Calculator');
    assert.ok(result.functions.some(f => f.name === 'multiply'));
    assert.ok(result.imports.includes('node:fs'));
    assert.ok(result.exports.includes('Calculator'));
    assert.ok(result.exports.includes('multiply'));
  });

  it('scans Python and extracts defs and imports', () => {
    const pyPath = path.join(tempDir, 'sample.py');
    const pyCode = `
import math
from typing import List

def calculate_sma(prices: List[float], period: int):
    return sum(prices) / period

def execute_order(symbol, volume):
    pass
    `;
    fs.writeFileSync(pyPath, pyCode, 'utf8');

    const result = ASTScanner.scanFile(pyPath);
    assert.strictEqual(result.functions.length, 2);
    assert.strictEqual(result.functions[0].name, 'calculate_sma');
    assert.ok(result.imports.includes('math'));
  });

  it('scans MQL4/MQL5 code and extracts OnInit, OnTick, and helper signatures', () => {
    const mqlPath = path.join(tempDir, 'expert.mq5');
    const mqlCode = `
      int OnInit() {
        return(INIT_SUCCEEDED);
      }
      void OnTick() {
        CalculateLots(1.5);
      }
      double CalculateLots(double risk) {
        return 0.1;
      }
    `;
    fs.writeFileSync(mqlPath, mqlCode, 'utf8');

    const result = ASTScanner.scanFile(mqlPath);
    assert.strictEqual(result.functions.length, 3);
    assert.ok(result.functions.some(f => f.name === 'OnInit'));
    assert.ok(result.functions.some(f => f.name === 'OnTick'));
    assert.ok(result.functions.some(f => f.name === 'CalculateLots'));
  });

});

describe('EvoCore AST Scanner: accuracy (regression: O4)', () => {

  it('finds async defs and return-annotated Python functions, ignoring comments and strings', () => {
    const res = ASTScanner.scanSource([
      'import os, sys as system',
      'from .local import helper',
      '',
      'class Strategy(Base, metaclass=Meta):',
      '    async def fetch(self, url: str) -> dict:',
      '        return {}',
      '',
      'def typed(a: int,',
      '          b: tuple[int, int] = (1, 2)) -> int:',
      '    return a',
      '# def commented_out(x):',
      'DOC = """',
      'def inside_docstring(y):',
      '"""'
    ].join('\n'), '.py');

    assert.deepEqual(res.functions.map(f => f.name), ['fetch', 'typed']);
    assert.equal(res.functions[0].async, true);
    assert.equal(res.functions[0].line, 5);
    assert.deepEqual(res.functions[1].params, ['a: int', 'b: tuple[int, int] = (1, 2)']);
    assert.deepEqual(res.classes, [{ name: 'Strategy', extends: 'Base', line: 4 }]);
    assert.deepEqual(res.imports, ['.local', 'os', 'sys']);
  });

  it('handles arrow functions without parentheses, generators, TS types and ignores ghosts', () => {
    const res = ASTScanner.scanSource([
      '// function ghost(a) {}',
      'const s = "function fake() {}";',
      'const sq = x => x * x;',
      'export const load = async (id: string): Promise<User> => fetchUser(id);',
      'const notAFunction = (a + b) * 2;',
      'export default async function* stream(source) { yield* source; }',
      'export class Repo<T> extends Base {',
      '  async find<K>(key: K, opts: Map<string, number>): Promise<T> {',
      '    if (key) { return null; }',
      '  }',
      '  #secret() {}',
      '}',
      "import { a } from './a.js';",
      "const lazy = await import('./lazy.js');",
      "const cjs = require('cjs-module');",
      "export { sq, notAFunction as alias };"
    ].join('\n'), '.ts');

    const names = res.functions.map(f => f.name);
    assert.deepEqual(names, ['sq', 'load', 'stream', 'find', '#secret']);
    assert.deepEqual(res.functions.find(f => f.name === 'find').params, ['key: K', 'opts: Map<string, number>']);
    assert.deepEqual(res.classes, [{ name: 'Repo', extends: 'Base', line: 7 }]);
    assert.deepEqual(res.imports, ['./a.js', './lazy.js', 'cjs-module']);
    assert.deepEqual(res.exports, ['load', 'stream', 'Repo', 'sq', 'alias']);
  });

  it('reads MQL #include, class inheritance and multi-line signatures with line numbers', () => {
    const res = ASTScanner.scanSource([
      '#include <Trade\\Trade.mqh>',
      'class CSignal : public CExpertSignal {',
      '};',
      'int OnCalculate(const int rates_total,',
      '                const int prev_calculated,',
      '                const double &price[])',
      '  {',
      '   if (rates_total < 2) return(0);',
      '   return(rates_total);',
      '  }',
      'void CSignal::Refresh() const {',
      '}'
    ].join('\n'), '.mq5');

    assert.deepEqual(res.imports, ['Trade\\Trade.mqh']);
    assert.deepEqual(res.classes, [{ name: 'CSignal', extends: 'CExpertSignal', line: 2 }]);
    assert.deepEqual(res.functions.map(f => [f.name, f.line]), [['OnCalculate', 4], ['CSignal::Refresh', 11]]);
    assert.equal(res.functions[0].params.length, 3);
  });

  it('rejects missing files and directories with clear errors', () => {
    const dir = createTempDir();
    assert.throws(() => ASTScanner.scanFile(path.join(dir, 'missing.js')), /File not found/);
    assert.throws(() => ASTScanner.scanFile(dir), /Not a file/);
    cleanupTempDirs();
  });

});
