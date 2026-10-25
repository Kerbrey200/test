import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ASTScanner } from '../core/ast_scanner.js';

describe('EvoCore AST Scanner: Multi-Language Structure Extractor', () => {

  const tempDir = path.resolve('storage', 'test_scratch');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

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
