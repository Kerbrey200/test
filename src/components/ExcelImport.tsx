import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useLanguage } from '../context/LanguageContext';
import { FileSpreadsheet, AlertCircle, CheckCircle2, RefreshCcw } from 'lucide-react';
import { Material, Inventory } from '../types';

interface ExcelImportProps {
  onCompare: (data: any[]) => void;
  onImport?: (data: any[]) => void;
  importLabel?: string;
  materials: Material[];
  inventory: Inventory[];
}

export default function ExcelImport({ onCompare, onImport, importLabel, materials, inventory }: ExcelImportProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any[]>([]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    
    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          
          // Use defval to treat empty cells as empty string, and header: 1 to get raw rows
          // If the user's excel file structure is complex, this allows safer processing.
          const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
          console.log('Raw Excel Rows:', rawData);

          console.log(`DEBUG: Scanning ${rawData.length} rows for header.`, rawData.slice(0, 5));
          
          for (let i = 0; i < Math.min(rawData.length, 50); i++) {
              const row = rawData[i].map((c: any) => String(c || '').toLowerCase().trim());
              
              let score = 0;
              if (row.some(c => c.includes('name') || c.includes('nom') || c.includes('наименование'))) score += 5;
              if (row.some(c => c.includes('qty') || c.includes('кол-во') || c.includes('miqdor') || c.includes('количество'))) score += 5;
              if (row.some(c => c.includes('code') || c.includes('kod') || c.includes('шифр'))) score += 3;
              
              if (score > maxHeaderScore) {
                  maxHeaderScore = score;
                  headerRowIndex = i;
              }
          }
          
          console.log(`DEBUG: headerRowIndex: ${headerRowIndex}, maxHeaderScore: ${maxHeaderScore}`);
          
          if (headerRowIndex === -1) {
              // Fallback: assume first row is header if none detected
              headerRowIndex = 0;
              console.log(`DEBUG: No header detected, fallback to row 0`);
          }
          
          // Extract headers
          let headers = rawData[headerRowIndex].map((h, i) => String(h || '').trim() || `col_${i}`);
          console.log(`DEBUG: Headers parsed:`, headers);
          
          // Data starts from next row
          const json = rawData.slice(headerRowIndex + 1).map(row => {
              const obj: any = {};
              headers.forEach((h: any, i: number) => {
                  obj[h] = row[i];
              });
              return obj;
          });
          console.log(`DEBUG: JSON parsed:`, json.slice(0, 5));
          
          // Add data mapping
          const comparison = json.map((row: any) => {
            const rowKeys = Object.keys(row);
            
            const nameKey = rowKeys.find(k => /наименование|номи|name|работы/i.test(k));
            const codeKey = rowKeys.find(k => /код|шифр|артикул/i.test(k));
            let qtyKey = rowKeys.find(k => /проект|qty|количество|кол-во|miqdori|mqdor/i.test(k));
            if (!qtyKey) qtyKey = rowKeys.find(k => /бщ|данным|общая|на\.ед/i.test(k));
            
            const excelName = nameKey ? String(row[nameKey] || '') : '';
            const excelCode = codeKey ? String(row[codeKey] || '').trim() : '';

            let excelQty = 0;
            if (qtyKey) {
                const qtyVal = String(row[qtyKey] || 0).replace(/\s/g, '').replace(',', '.');
                excelQty = parseFloat(qtyVal);
                if (isNaN(excelQty)) excelQty = 0;
            }
            
            if (!excelName || excelName.trim() === '' || excelName.trim().length < 2) return null;
            if (!isNaN(Number(excelName.replace(/\s/g, '')))) return null;

            const normalize = (str: string) => String(str).toLowerCase().replace(/[^a-z0-9а-яё]/g, '');

            let matchedMaterial = (excelCode && normalize(excelCode).length > 2)
                ? materials.find(m => m.code && normalize(m.code) === normalize(excelCode))
                : null;
            
            if (!matchedMaterial) {
                const normExcelName = normalize(excelName);
                if (normExcelName.length > 2) {
                    matchedMaterial = materials.find(m => {
                        const normMatName = normalize(m.name);
                        return normMatName === normExcelName || 
                               normMatName.includes(normExcelName) || 
                               normExcelName.includes(normMatName);
                    });
                }
            }

            const systemInv = matchedMaterial ? inventory.find(i => i.materialId === matchedMaterial.id) : null;
            const systemQty = systemInv ? systemInv.balance : 0;

            return {
              name: excelName,
              code: excelCode,
              excelQty,
              systemQty,
              matched: !!matchedMaterial,
              diff: excelQty - (systemQty || 0),
              materialId: matchedMaterial?.id,
              columnsInfo: { name: nameKey, qty: qtyKey, code: codeKey }
            };
          }).filter(Boolean);

          setResults(comparison);
          onCompare(comparison);
          setLoading(false);
        } catch (err) {
          console.error('Error parsing Excel:', err);
          setError('Excel faylni o\'qib bo\'lmadi');
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError('Excel faylni o\'qib bo\'lmadi');
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-[2rem] p-8 text-white">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xl font-black uppercase italic tracking-tighter">{t('import')}</h3>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{t('compare')}</p>
        </div>
        <div className="flex items-center gap-4">
          {results.length > 0 && onImport && (
            <button 
              onClick={() => onImport(results)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
            >
              {importLabel || "Hisobot yaratish (M-29)"}
            </button>
          )}
          <FileSpreadsheet className="w-8 h-8 text-blue-500" />
        </div>
      </div>

      <div className="relative group">
        <input 
          type="file" 
          accept=".xlsx, .xls" 
          onChange={handleFile}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="border-2 border-dashed border-slate-700 group-hover:border-blue-500 rounded-2xl p-10 flex flex-col items-center transition-all bg-slate-800/50">
          <RefreshCcw className={`w-8 h-8 text-slate-500 mb-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          <p className="font-black text-xs uppercase tracking-widest text-slate-400">
            {loading ? 'Yuklanmoqda...' : 'Faylni tanlang yoki shu yerga tashlang'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-3 text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-400/20">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-xs font-bold uppercase tracking-tight">{error}</span>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-8 space-y-3">
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/50 mb-4">
             <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Column Mapping Info:</h4>
             <ul className="text-[10px] sm:text-xs text-slate-300 space-y-1 font-mono">
               <li><span className="text-blue-400">Name Column:</span> {results[0]?.columnsInfo?.name || "Not Found"}</li>
               <li><span className="text-blue-400">Qty Column:</span> {results[0]?.columnsInfo?.qty || "Not Found"}</li>
               <li><span className="text-blue-400">Code Column:</span> {results[0]?.columnsInfo?.code || "Not Found"}</li>
             </ul>
             <div className="mt-3 pt-3 border-t border-slate-700/50 text-[10px] text-slate-400 italic">
               Note: If items show "0" in the Tizim column, it means they couldn't be automatically matched by name or code to your system inventory. Make sure your system materials names match exactly (ignoring case/symbols).
             </div>
          </div>
          
          <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">
            <span>Material</span>
            <div className="flex gap-8">
              <span>Excel</span>
              <span>Tizim</span>
              <span>Farq</span>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {results.map((res, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 group hover:border-blue-500/50 transition-all">
                <div className="flex items-center gap-3">
                  {res.matched ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-orange-500" />}
                  <span className="font-bold text-xs uppercase italic tracking-tight truncate max-w-[150px]">{res.name}</span>
                </div>
                <div className="flex items-center gap-6 font-mono text-xs">
                  <span className="text-slate-400">{res.excelQty}</span>
                  <span className="text-blue-400">{res.systemQty}</span>
                  <span className={`font-black ${res.diff === 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {res.diff > 0 ? `+${res.diff}` : res.diff}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
