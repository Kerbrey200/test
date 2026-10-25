import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MQLValidator } from '../core/mql_validator.js';

describe('EvoCore Domain Engine: MQL4/MQL5 Trading Code Validator', () => {

  it('detects deprecated IndicatorCounted() and flags CRITICAL', () => {
    const code = `
      int start() {
        int counted = IndicatorCounted();
        return(0);
      }
    `;
    const audit = MQLValidator.auditMQL(code);
    assert.strictEqual(audit.passed, false);
    assert.ok(audit.issues.some(i => i.id === 'MQL5-01' && i.severity === 'CRITICAL'));
  });

  it('detects missing ArraySetAsSeries on indicator buffer', () => {
    const code = `
      int OnInit() {
        SetIndexBuffer(0, MyBuffer, INDICATOR_DATA);
        return(INIT_SUCCEEDED);
      }
    `;
    const audit = MQLValidator.auditMQL(code);
    assert.ok(audit.issues.some(i => i.id === 'MQL5-02'));
  });

  it('passes fully compliant MQL5 indicator code', () => {
    const code = `
      int OnInit() {
        SetIndexBuffer(0, MyBuffer, INDICATOR_DATA);
        ArraySetAsSeries(MyBuffer, true);
        return(INIT_SUCCEEDED);
      }

      int OnCalculate(const int rates_total, const int prev_calculated) {
        int limit = rates_total - prev_calculated;
        return(rates_total);
      }
    `;
    const audit = MQLValidator.auditMQL(code);
    assert.strictEqual(audit.passed, true);
    assert.strictEqual(audit.criticalCount, 0);
  });

});

describe('EvoCore MQL Validator: precision (regression: O5)', () => {

  it('ignores legacy calls inside comments and strings', () => {
    const audit = MQLValidator.auditMQL([
      '// int counted = IndicatorCounted();',
      '/* OrderSend(Symbol(), OP_BUY, 0.1, Ask, 3, 0, 0); */',
      'string note = "IndicatorCounted() was removed";'
    ].join('\n'));
    assert.equal(audit.totalIssues, 0, JSON.stringify(audit.issues));
  });

  it('accepts valid MQL5 calls that share names with MQL4 APIs', () => {
    const audit = MQLValidator.auditMQL([
      '#include <Trade\\Trade.mqh>',
      'CTrade trade;',
      'int handle;',
      'int OnInit() {',
      '   handle = iMA(_Symbol, _Period, 14, 0, MODE_SMA, PRICE_CLOSE);',
      '   return(INIT_SUCCEEDED);',
      '}',
      'void OnTick() {',
      '   int d = Digits();',
      '   double p = _Point;',
      '   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);',
      '   if (PositionSelect(_Symbol)) trade.OrderModify(1, 1.0, 0, 0, ORDER_TIME_GTC, 0);',
      '   MqlTradeRequest request = {};',
      '   MqlTradeResult result = {};',
      '   OrderSend(request, result);',
      '}'
    ].join('\n'));
    assert.equal(audit.totalIssues, 0, JSON.stringify(audit.issues));
    assert.equal(audit.passed, true);
  });

  it('detects MQL4 predefined variables, order pool, indicator signatures, entry points and legacy API', () => {
    const code = [
      'int init() { IndicatorBuffers(2); return(0); }',
      'int start() {',
      '   double a = Ask;',
      '   double c = Close[1] + Point;',
      '   double m = iMA(NULL, 0, 14, 0, MODE_SMA, PRICE_CLOSE, 1);',
      '   double spread = MarketInfo(Symbol(), MODE_SPREAD);',
      '   if (OrderSelect(0, SELECT_BY_POS, MODE_TRADES)) OrderClose(OrderTicket(), OrderLots(), Bid, 3);',
      '   return(0);',
      '}'
    ].join('\n');
    const audit = MQLValidator.auditMQL(code);
    const ids = audit.issues.map(i => i.id).sort();
    assert.deepEqual(ids, ['MQL5-05', 'MQL5-06', 'MQL5-07', 'MQL5-08', 'MQL5-09', 'MQL5-11', 'MQL5-12']);
    assert.equal(audit.issues.find(i => i.id === 'MQL5-06').line, 3);
    assert.equal(audit.issues.find(i => i.id === 'MQL5-09').line, 5);
    assert.equal(audit.issues.find(i => i.id === 'MQL5-06').occurrences, 2);
    assert.equal(audit.passed, false);
  });

  it('checks ArraySetAsSeries per buffer and escalates MQL4-style count-down loops', () => {
    const base = [
      'int OnInit() {',
      '   SetIndexBuffer(0, Fast, INDICATOR_DATA);',
      '   SetIndexBuffer(1, Slow, INDICATOR_DATA);',
      '   ArraySetAsSeries(Fast, true);',
      '   return(INIT_SUCCEEDED);',
      '}'
    ];
    const plain = MQLValidator.auditMQL(base.join('\n')).issues.find(i => i.id === 'MQL5-02');
    assert.equal(plain.severity, 'WARNING');
    assert.match(plain.description, /Slow/);
    assert.doesNotMatch(plain.description, /Fast/);

    const loop = MQLValidator.auditMQL([...base, 'void Calc(int limit) { for (int i = limit - 1; i >= 0; i--) Slow[i] = 1; }'].join('\n'));
    assert.equal(loop.issues.find(i => i.id === 'MQL5-02').severity, 'CRITICAL');
  });

  it('flags indicator handles stored as prices and grades OnInit return values', () => {
    const audit = MQLValidator.auditMQL([
      'int OnInit() { return(0); }',
      'void OnTick() { double v = iRSI(_Symbol, _Period, 14, PRICE_CLOSE); }'
    ].join('\n'));
    assert.equal(audit.issues.find(i => i.id === 'MQL5-10').severity, 'WARNING');
    assert.equal(audit.issues.find(i => i.id === 'MQL5-03').severity, 'INFO');
    assert.equal(audit.infoCount, 1);

    const failing = MQLValidator.auditMQL('int OnInit() { if (x) return(INIT_FAILED); return(INIT_PARAMETERS_INCORRECT); }');
    assert.equal(failing.issues.find(i => i.id === 'MQL5-03').severity, 'WARNING');
  });

});
