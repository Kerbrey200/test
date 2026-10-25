/**
 * EVO-CORE MQL4 TO MQL5 TRADING VALIDATOR & AUDITOR
 * Specialized domain engine for algorithmic trading code, indicators, and expert advisors.
 * Detects legacy MQL4 antipatterns and verifies MQL5 API compliance.
 * Comments and string literals are ignored, calls are matched by argument count
 * (MQL4 and MQL5 share function names with different signatures), and every issue
 * carries the line of its first occurrence.
 */

import { blankSource, lineLocator, matchBracket, splitTopLevel } from './source_utils.js';

// Indicator functions: MQL4 argument count (value-returning, with shift) -> MQL5 argument count (handle).
const INDICATOR_SIGNATURES = {
  iMA: { mql4: 7, mql5: 6 },
  iRSI: { mql4: 5, mql5: 4 },
  iATR: { mql4: 4, mql5: 3 },
  iCCI: { mql4: 5, mql5: 4 },
  iMomentum: { mql4: 5, mql5: 4 },
  iMACD: { mql4: 8, mql5: 6 },
  iBands: { mql4: 8, mql5: 6 },
  iStochastic: { mql4: 9, mql5: 7 },
  iADX: { mql4: 6, mql5: 3 }
};

const LEGACY_ORDER_FUNCTIONS = ['OrderClose', 'OrderCloseBy', 'OrderModify', 'OrderTicket', 'OrderLots',
  'OrderOpenPrice', 'OrderClosePrice', 'OrderMagicNumber', 'OrderType', 'OrderProfit', 'OrderSymbol',
  'OrderStopLoss', 'OrderTakeProfit', 'OrderOpenTime', 'OrderComment', 'OrdersHistoryTotal'];

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class MQLValidator {
  /**
   * Finds free-function calls `name(...)` (not obj.name(...), not part of a longer identifier).
   */
  static findCalls(code, name) {
    const calls = [];
    const regex = new RegExp(`(^|[^\\w.>:])(${escapeRegex(name)})\\s*\\(`, 'g');
    let match;
    while ((match = regex.exec(code)) !== null) {
      const nameIndex = match.index + match[1].length;
      const open = match.index + match[0].length - 1;
      const close = matchBracket(code, open);
      const args = close === -1 ? [] : splitTopLevel(code.slice(open + 1, close));
      calls.push({ index: nameIndex, args });
    }
    return calls;
  }

  /**
   * Returns the body of `<type> name(...) { ... }` or null.
   */
  static functionBody(code, name) {
    const regex = new RegExp(`\\b${escapeRegex(name)}\\s*\\(`, 'g');
    let match;
    while ((match = regex.exec(code)) !== null) {
      const close = matchBracket(code, match.index + match[0].length - 1);
      if (close === -1) continue;
      const brace = code.slice(close + 1).search(/\S/);
      if (brace !== -1 && code[close + 1 + brace] === '{') {
        const start = close + 1 + brace;
        const end = matchBracket(code, start);
        return { index: match.index, body: code.slice(start, end === -1 ? code.length : end + 1) };
      }
    }
    return null;
  }

  /**
   * Audits MQL4/MQL5 code for migration compatibility and algorithmic risks.
   */
  static auditMQL(source = '') {
    const text = String(source).replace(/\r\n/g, '\n');
    const code = blankSource(text, '.mq5', { keepStrings: false });
    const lineOf = lineLocator(text);
    const issues = [];
    const add = (issue, index, occurrences = 1) => issues.push({ ...issue, line: index === undefined ? null : lineOf(index), occurrences });
    const firstIndex = (regex) => {
      const match = regex.exec(code);
      return match ? match.index + (match[1] ? match[0].indexOf(match[1]) : 0) : -1;
    };

    // 1. Deprecated IndicatorCounted() in MQL5
    const counted = MQLValidator.findCalls(code, 'IndicatorCounted');
    if (counted.length > 0) {
      add({
        id: 'MQL5-01',
        severity: 'CRITICAL',
        title: 'Deprecated IndicatorCounted() call',
        description: 'MQL5 replaces IndicatorCounted() with OnCalculate(rates_total, prev_calculated, ...).',
        recommendedFix: 'Use "int limit = rates_total - prev_calculated;" in OnCalculate.'
      }, counted[0].index, counted.length);
    }

    // 2. Buffer Indexing & ArraySetAsSeries(), checked per buffer
    const buffers = MQLValidator.findCalls(code, 'SetIndexBuffer')
      .map(call => ({ index: call.index, name: (call.args[1] || '').replace(/[&\s]/g, '') }))
      .filter(b => /^[A-Za-z_]\w*$/.test(b.name));
    const seriesBuffers = new Set(MQLValidator.findCalls(code, 'ArraySetAsSeries')
      .filter(call => /^true$/i.test(call.args[1] || ''))
      .map(call => (call.args[0] || '').replace(/\s/g, '')));
    const unseries = buffers.filter(b => !seriesBuffers.has(b.name));
    if (unseries.length > 0) {
      // A count-down loop (i >= 0; i--) indexing these buffers is the classic MQL4-style bug.
      const countDownLoop = /for\s*\([^;]*;\s*\w+\s*>=?\s*0\s*;\s*\w+\s*--\s*\)/.test(code);
      const indexed = unseries.some(b => new RegExp(`\\b${escapeRegex(b.name)}\\s*\\[`).test(code));
      const names = [...new Set(unseries.map(b => b.name))];
      add({
        id: 'MQL5-02',
        severity: countDownLoop && indexed ? 'CRITICAL' : 'WARNING',
        title: 'Missing ArraySetAsSeries() for indicator buffer',
        description: `Buffer(s) ${names.join(', ')} use MQL5 default indexing (0 = oldest bar). MQL4-style loops that treat 0 as the newest bar draw reversed lines or go out of range.`,
        recommendedFix: `Add ArraySetAsSeries(${names[0]}, true); after SetIndexBuffer in OnInit(), or iterate oldest -> newest.`
      }, unseries[0].index, unseries.length);
    }

    // 3. OnInit() Return Code Verification
    const onInit = /\bint\s+OnInit\s*\(/.test(code) ? MQLValidator.functionBody(code, 'OnInit') : null;
    if (onInit) {
      const returns = [...onInit.body.matchAll(/\breturn\s*\(?\s*([^;)]*?)\s*\)?\s*;/g)].map(m => m[1].trim());
      if (!returns.includes('INIT_SUCCEEDED')) {
        const returnsZero = returns.includes('0');
        add({
          id: 'MQL5-03',
          severity: returnsZero ? 'INFO' : 'WARNING',
          title: 'OnInit() does not return INIT_SUCCEEDED',
          description: returnsZero
            ? 'return(0) works (INIT_SUCCEEDED == 0) but hides intent.'
            : 'MQL5 standard requires returning INIT_SUCCEEDED on successful initialization.',
          recommendedFix: 'Ensure OnInit returns INIT_SUCCEEDED.'
        }, onInit.index);
      }
    }

    // 4. MQL4 OrderSend vs MQL5 Trade Request
    const legacySends = MQLValidator.findCalls(code, 'OrderSend').filter(call => call.args.length >= 7);
    const opConstant = firstIndex(/\b(OP_(?:BUY|SELL)(?:LIMIT|STOP)?)\b/);
    if (legacySends.length > 0 || opConstant !== -1) {
      add({
        id: 'MQL5-04',
        severity: 'CRITICAL',
        title: 'Legacy MQL4 OrderSend() detected',
        description: 'MQL5 requires MqlTradeRequest and MqlTradeResult structures or CTrade class; OP_BUY/OP_SELL do not exist.',
        recommendedFix: 'Migrate to #include <Trade\\Trade.mqh> and use CTrade::Buy/Sell.'
      }, legacySends[0]?.index ?? opConstant, Math.max(legacySends.length, 1));
    }

    // 5. Legacy predefined variables (MQL5 has _Digits/_Point and Digits()/Point()/Bars())
    const legacyVar = /(^|[^\w.])(Digits|Point|Bars)\b(?!\s*\()/g;
    const legacyVars = [...code.matchAll(legacyVar)];
    if (legacyVars.length > 0) {
      const names = [...new Set(legacyVars.map(m => m[2]))];
      add({
        id: 'MQL5-05',
        severity: 'WARNING',
        title: 'Legacy Digits / Point / Bars variable',
        description: `MQL4 predefined variable(s) ${names.join(', ')} are not variables in MQL5.`,
        recommendedFix: 'Replace Digits with _Digits, Point with _Point, Bars with Bars(_Symbol, _Period) or rates_total.'
      }, legacyVars[0].index + legacyVars[0][1].length, legacyVars.length);
    }

    // 6. Ask / Bid predefined variables (undeclared identifiers in MQL5)
    const declaresAskBid = /\b(?:double|float)\s+(?:Ask|Bid)\b/.test(code);
    const askBid = declaresAskBid ? [] : [...code.matchAll(/(^|[^\w.])(Ask|Bid)\b(?!\s*\()/g)];
    if (askBid.length > 0) {
      add({
        id: 'MQL5-06',
        severity: 'CRITICAL',
        title: 'MQL4 Ask / Bid variables',
        description: 'Ask and Bid are not predefined in MQL5.',
        recommendedFix: 'Use SymbolInfoDouble(_Symbol, SYMBOL_ASK / SYMBOL_BID) or SymbolInfoTick(_Symbol, tick).'
      }, askBid[0].index + askBid[0][1].length, askBid.length);
    }

    // 7. Predefined MQL4 timeseries arrays Close[], Open[], ...
    const seriesUse = [...code.matchAll(/(^|[^\w.])(Close|Open|High|Low|Time|Volume)\s*\[/g)]
      .filter(m => !new RegExp(`\\b(?:double|datetime|long|int)\\s*&?\\s*${m[2]}\\s*\\[`).test(code));
    if (seriesUse.length > 0) {
      add({
        id: 'MQL5-07',
        severity: 'CRITICAL',
        title: 'MQL4 predefined timeseries array',
        description: `${[...new Set(seriesUse.map(m => `${m[2]}[]`))].join(', ')} do not exist in MQL5.`,
        recommendedFix: 'Use the OnCalculate price arrays, CopyClose/CopyRates or iClose(_Symbol, _Period, shift).'
      }, seriesUse[0].index + seriesUse[0][1].length, seriesUse.length);
    }

    // 8. MQL4 order pool (OrderSelect by position, OrderClose, OrderTicket, ...)
    const poolConstant = firstIndex(/\b(SELECT_BY_POS|SELECT_BY_TICKET|MODE_TRADES|MODE_HISTORY)\b/);
    const poolCalls = LEGACY_ORDER_FUNCTIONS.flatMap(name => MQLValidator.findCalls(code, name));
    if (poolConstant !== -1 || poolCalls.length > 0) {
      const index = Math.min(...[poolConstant, ...poolCalls.map(c => c.index)].filter(i => i !== -1));
      add({
        id: 'MQL5-08',
        severity: 'CRITICAL',
        title: 'MQL4 order pool functions',
        description: 'MQL5 separates orders, positions and deals; OrderClose/OrderModify/OrderTicket and SELECT_BY_POS are MQL4-only.',
        recommendedFix: 'Use PositionSelect/PositionGetTicket and CTrade::PositionClose / PositionModify.'
      }, index, poolCalls.length + (poolConstant !== -1 ? 1 : 0));
    }

    // 9-10. Indicator functions: MQL4 value signature vs MQL5 handle misuse
    for (const [name, sig] of Object.entries(INDICATOR_SIGNATURES)) {
      const calls = MQLValidator.findCalls(code, name);
      const legacy = calls.filter(call => call.args.length === sig.mql4);
      if (legacy.length > 0) {
        add({
          id: 'MQL5-09',
          severity: 'CRITICAL',
          title: `MQL4 signature of ${name}()`,
          description: `${name}() with ${sig.mql4} arguments returns a value in MQL4; in MQL5 it takes ${sig.mql5} arguments and returns an indicator handle.`,
          recommendedFix: `Create the handle once in OnInit (int h = ${name}(...)) and read values with CopyBuffer(h, 0, shift, count, buffer).`
        }, legacy[0].index, legacy.length);
      }
      const handleAsValue = [...code.matchAll(new RegExp(`\\b(?:double|float)\\s+\\w+\\s*=\\s*(${name})\\s*\\(`, 'g'))]
        .filter(m => {
          const open = m.index + m[0].length - 1;
          const close = matchBracket(code, open);
          return close !== -1 && splitTopLevel(code.slice(open + 1, close)).length === sig.mql5;
        });
      if (handleAsValue.length > 0) {
        add({
          id: 'MQL5-10',
          severity: 'WARNING',
          title: `${name}() handle stored as a price`,
          description: `In MQL5 ${name}() returns an int handle, not an indicator value.`,
          recommendedFix: `Store the handle in an int and read values with CopyBuffer().`
        }, handleAsValue[0].index + handleAsValue[0][0].indexOf(name), handleAsValue.length);
      }
    }

    // 11. Legacy entry points never called by MQL5
    const legacyEntry = [...code.matchAll(/\b(?:int|void)\s+(start|init|deinit)\s*\(\s*\)/g)];
    if (legacyEntry.length > 0) {
      add({
        id: 'MQL5-11',
        severity: 'CRITICAL',
        title: 'Legacy MQL4 entry point',
        description: `${legacyEntry.map(m => `${m[1]}()`).join(', ')} are never called by the MQL5 terminal.`,
        recommendedFix: 'Rename to OnTick()/OnCalculate(), OnInit() and OnDeinit(const int reason).'
      }, legacyEntry[0].index + legacyEntry[0][0].indexOf(legacyEntry[0][1]), legacyEntry.length);
    }

    // 12. Legacy market information and indicator setup API
    const legacyApi = ['MarketInfo', 'IndicatorBuffers', 'SetIndexStyle', 'IndicatorDigits', 'SetIndexDrawBegin']
      .flatMap(name => MQLValidator.findCalls(code, name).map(call => ({ ...call, name })))
      .sort((a, b) => a.index - b.index);
    if (legacyApi.length > 0) {
      add({
        id: 'MQL5-12',
        severity: 'CRITICAL',
        title: 'Legacy MQL4 API call',
        description: `${[...new Set(legacyApi.map(c => `${c.name}()`))].join(', ')} do not exist in MQL5.`,
        recommendedFix: 'Use SymbolInfoDouble/SymbolInfoInteger, #property indicator_buffers and PlotIndexSetInteger/PlotIndexSetString.'
      }, legacyApi[0].index, legacyApi.length);
    }

    issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.id.localeCompare(b.id));
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const warningCount = issues.filter(i => i.severity === 'WARNING').length;

    return {
      passed: criticalCount === 0,
      totalIssues: issues.length,
      criticalCount,
      warningCount,
      infoCount: issues.filter(i => i.severity === 'INFO').length,
      issues
    };
  }
}
