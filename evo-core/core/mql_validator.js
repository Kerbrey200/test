/**
 * EVO-CORE MQL4 TO MQL5 TRADING VALIDATOR & AUDITOR
 * Specialized domain engine for algorithmic trading code, indicators, and expert advisors.
 * Detects legacy MQL4 antipatterns and verifies MQL5 API compliance.
 */

export class MQLValidator {
  /**
   * Audits MQL4/MQL5 code for migration compatibility and algorithmic risks.
   */
  static auditMQL(code = '') {
    const issues = [];
    const lines = code.split('\n');

    // 1. Deprecated IndicatorCounted() in MQL5
    if (/IndicatorCounted\s*\(/i.test(code)) {
      issues.push({
        id: 'MQL5-01',
        severity: 'CRITICAL',
        title: 'Deprecated IndicatorCounted() call',
        description: 'MQL5 replaces IndicatorCounted() with OnCalculate(rates_total, prev_calculated, ...).',
        recommendedFix: 'Use "int limit = rates_total - prev_calculated;" in OnCalculate.'
      });
    }

    // 2. Buffer Indexing & ArraySetAsSeries()
    const hasBuffer = /SetIndexBuffer\s*\(/i.test(code);
    const hasSetAsSeries = /ArraySetAsSeries\s*\(/i.test(code);
    if (hasBuffer && !hasSetAsSeries) {
      issues.push({
        id: 'MQL5-02',
        severity: 'CRITICAL',
        title: 'Missing ArraySetAsSeries() for indicator buffer',
        description: 'MQL5 buffers default to normal array indexing (0 = oldest bar). MT4/MT5 indicators require reverse series indexing.',
        recommendedFix: 'Add ArraySetAsSeries(buffer, true); inside OnInit().'
      });
    }

    // 3. OnInit() Return Code Verification
    if (/int\s+OnInit\s*\(/i.test(code)) {
      if (!/return\s*\(\s*INIT_SUCCEEDED\s*\)/i.test(code) && !/return\s+INIT_SUCCEEDED/i.test(code)) {
        issues.push({
          id: 'MQL5-03',
          severity: 'WARNING',
          title: 'OnInit() does not return INIT_SUCCEEDED',
          description: 'MQL5 standard requires returning INIT_SUCCEEDED on successful initialization.',
          recommendedFix: 'Ensure OnInit returns INIT_SUCCEEDED.'
        });
      }
    }

    // 4. MQL4 OrderSend vs MQL5 Trade Request
    if (/OrderSend\s*\(\s*Symbol\s*\(\s*\)/i.test(code)) {
      issues.push({
        id: 'MQL5-04',
        severity: 'CRITICAL',
        title: 'Legacy MQL4 OrderSend() detected',
        description: 'MQL5 requires MqlTradeRequest and MqlTradeResult structures or CTrade class.',
        recommendedFix: 'Migrate to #include <Trade\\Trade.mqh> and use CTrade::Buy/Sell.'
      });
    }

    // 5. Legacy Digits and Point variables
    if (/\bDigits\b/.test(code) && !/\b_Digits\b/.test(code)) {
      issues.push({
        id: 'MQL5-05',
        severity: 'INFO',
        title: 'Legacy Digits variable',
        description: 'In MQL5, preferred pre-defined variable is _Digits.',
        recommendedFix: 'Replace Digits with _Digits.'
      });
    }

    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const warningCount = issues.filter(i => i.severity === 'WARNING').length;

    return {
      passed: criticalCount === 0,
      totalIssues: issues.length,
      criticalCount,
      warningCount,
      issues
    };
  }
}
