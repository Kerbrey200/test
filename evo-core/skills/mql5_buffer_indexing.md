---
name: MQL5 Buffer Indexing
description: Ensures correct reverse time-series indexing for MQL5 indicator calculation buffers
domain: MQL_TRADING
version: 1.0.0
utility_score: 1.0
updated_at: 2026-10-25T17:35:00Z
tags: [mql5, buffers, arraysetasseries, indexing]
---

# MQL5 Buffer Indexing

## ⚠️ Muammo va Asosiy Sabab (Root Cause)
MQL4 da barcha indikator massivlari avtomatik ravishda `Series` (0-indeks eng yangi o'ng tomondagi bar) bo'ladi. MQL5 da esa oddiy dinamik massivlar standart C++ kabi 0-indeks eng eski chap tomondagi bar bo'ladi. Agar `ArraySetAsSeries()` chaqirilmasa, indikator chiziqlari teskari chiziladi yoki `Array out of range` xatosi yuzaga keladi.

## 🛡️ Yechim Qoidasi (Actionable Rule)
`OnInit()` funksiyasi ichida har bir `SetIndexBuffer` dan so'ng darhol `ArraySetAsSeries(buffer, true)` chaqirilishi shart.

## 💻 Tekshirilgan Kod Namunasi (Verified Example)
```cpp
int OnInit()
{
   SetIndexBuffer(0, MainBuffer, INDICATOR_DATA);
   ArraySetAsSeries(MainBuffer, true);

   SetIndexBuffer(1, SignalBuffer, INDICATOR_DATA);
   ArraySetAsSeries(SignalBuffer, true);

   return(INIT_SUCCEEDED);
}
```
