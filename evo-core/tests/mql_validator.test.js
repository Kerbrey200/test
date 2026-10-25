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
