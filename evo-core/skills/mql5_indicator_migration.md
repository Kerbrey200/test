---
name: MQL5 Indicator Migration
description: Converts MQL4 IndicatorCounted loop into MQL5 OnCalculate rates_total architecture
domain: MQL_TRADING
version: 1.0.0
utility_score: 1.0
updated_at: 2026-10-25T17:35:00Z
tags: [mql5, indicator, oncalculate, migration]
---

# MQL5 Indicator Migration

## ⚠️ Muammo va Asosiy Sabab (Root Cause)
MQL4 da ishlatilgan `IndicatorCounted()` funksiyasi MQL5 da mavjud emas. Uni to'g'ridan-to'g'ri ko'chirilsa, kompilyatsiya xatosi beradi yoki har bir yangi tick'da barcha tarixiy barlar qayta hisoblanib, terminalni qotirib qo'yadi.

## 🛡️ Yechim Qoidasi (Actionable Rule)
MQL5 da `OnCalculate` parametri sifatida beriladigan `rates_total` (jami barlar soni) va `prev_calculated` (oldin hisoblangan barlar) orqali `limit` hisoblanadi:
```cpp
int limit = rates_total - prev_calculated;
if (prev_calculated > 0) limit++; // Oxirgi o'zgaruvchan barni qayta hisoblash
```

## 💻 Tekshirilgan Kod Namunasi (Verified Example)
```cpp
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   if (rates_total < 2) return(0);

   int limit = rates_total - prev_calculated;
   if (prev_calculated > 0) limit++;

   for (int i = limit - 1; i >= 0; i--) {
      Buffer[i] = (high[i] + low[i]) / 2.0;
   }

   return(rates_total);
}
```
