import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useLanguage } from '../context/LanguageContext';
import { FileSpreadsheet, AlertCircle, CheckCircle2, RefreshCcw, X } from 'lucide-react';
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
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    setResults([]);
    setFileName('');
    setError('');
    setSelectedRows(new Set());
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    
    try {
      setFileName(file.name);
      setSelectedRows(new Set());
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];

          const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
          console.log('Parsed JSON:', json.slice(0, 5));

          if (json.length === 0) {
            throw new Error('Fayl bo\'sh yoki format noto\'g\'ri.');
          }

          const comparison = json.map((row: any) => {
            const rowKeys = Object.keys(row);
            
            const nameKey = rowKeys.find(k => /наименование|номи|name|работы/i.test(k));
            const codeKey = rowKeys.find(k => /код|шифр|артикул/i.test(k));
            let qtyKey = rowKeys.find(k => /проект|qty|количество|кол-во|miqdori|mqdor|бщ|данным|общая|на\.ед/i.test(k));
            let unitKey = rowKeys.find(k => /birlik|o['']lchov|ед\.изм|единица|unit/i.test(k));
            
            const excelName = nameKey ? String(row[nameKey] || '') : '';
            const excelCode = codeKey ? String(row[codeKey] || '').trim() : '';
            const excelUnit = unitKey ? String(row[unitKey] || '').trim() : '';

            let excelQty = 0;
            if (qtyKey) {
                const qtyVal = String(row[qtyKey] || 0).replace(/[^\d.,]/g, '').replace(',', '.');
                excelQty = parseFloat(qtyVal);
                if (isNaN(excelQty)) excelQty = 0;
            }
            
            if (!excelName || excelName.trim() === '' || excelName.trim().length < 2) return null;
            if (excelQty <= 0) return null; // Skip non-positive quantities

            const normalize = (str: string) => String(str).toLowerCase().replace(/[^a-z0-9а-яё]/g, '');

            let matchedMaterial = (excelCode && normalize(excelCode).length > 2)
                ? materials.find(m => m.code && normalize(m.code) === normalize(excelCode))
                : null;
            
            if (!matchedMaterial && excelName) {
                const normExcelName = normalize(excelName);
                matchedMaterial = materials.find(m => normalize(m.name).includes(normExcelName) || normExcelName.includes(normalize(m.name)));
            }

            const systemInv = matchedMaterial ? inventory.find(i => i.materialId === matchedMaterial.id) : null;
            const systemQty = systemInv ? systemInv.balance : 0;

            return {
              name: excelName,
              code: excelCode,
              excelQty,
              excelUnit,
              systemQty,
              matched: !!matchedMaterial,
              diff: excelQty - (systemQty || 0),
              materialId: matchedMaterial?.id,
              unit: matchedMaterial?.unit || excelUnit || 'dona',
            };
          }).filter((item): item is NonNullable<typeof item> => item !== null);

          setResults(comparison);
          setSelectedRows(new Set(comparison.map((_, i) => i)));
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
          <FileSpreadsheet className="w-8 h-8 text-blue-500" />
        </div>
      </div>

      <div className="relative group">
        <input 
          type="file" 
          ref={inputRef}
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

      {fileName && (
        <div className="mt-3 flex items-center justify-between bg-slate-700/50 px-4 py-2 rounded-xl">
          <span className="text-xs text-green-400 font-bold truncate">{fileName}</span>
          <button onClick={handleReset} className="text-slate-400 hover:text-red-400 transition-colors ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-center gap-3 text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-400/20">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-xs font-bold uppercase tracking-tight">{error}</span>
        </div>
      )}

       {results.length > 0 && (
        <div className="mt-8 space-y-3">
           <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-white">{results.length}</p>
              <p className="text-[9px] text-slate-400 uppercase font-bold">Jami qatorlar</p>
            </div>
            <div className="bg-green-900/30 rounded-xl p-3 text-center border border-green-700/30">
              <p className="text-2xl font-black text-green-400">{results.filter(r => r.matched).length}</p>
              <p className="text-[9px] text-slate-400 uppercase font-bold">Tizimda mavjud</p>
            </div>
            <div className="bg-orange-900/20 rounded-xl p-3 text-center border border-orange-700/20">
              <p className="text-2xl font-black text-orange-400">{results.length - results.filter(r => r.matched).length}</p>
              <p className="text-[9px] text-slate-400 uppercase font-bold">Yangi material</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-4">
            <div className="flex items-center gap-2">
               <input 
                  type="checkbox"
                  checked={selectedRows.size === results.length}
                  onChange={(e) => {
                    e.target.checked 
                      ? setSelectedRows(new Set(results.map((_, i) => i)))
                      : setSelectedRows(new Set());
                  }}
                  className="w-4 h-4 rounded accent-blue-500"
               />
               <span>Material</span>
            </div>
            <div className="flex gap-8">
              <span>Excel</span>
              <span>Tizim</span>
              <span>Farq</span>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {results.map((res, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 group hover:border-blue-500/50 transition-all">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(i)}
                    onChange={(e) => {
                      const next = new Set(selectedRows);
                      e.target.checked ? next.add(i) : next.delete(i);
                      setSelectedRows(next);
                    }}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  {res.matched ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-orange-500" />}
                  <span className="font-bold text-xs uppercase italic tracking-tight truncate max-w-[150px]">{res.name}</span>
                </div>
                <div className="flex items-center gap-6 font-mono text-xs">
                  <span className="text-slate-400">{res.excelQty} {res.excelUnit}</span>
                  <span className="text-blue-400">{res.systemQty} {res.unit}</span>
                  <span className={`font-black ${res.diff === 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {res.diff > 0 ? `+${res.diff}` : res.diff}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {onImport && selectedRows.size > 0 && (
            <button
              onClick={() => onImport(results.filter((_, i) => selectedRows.has(i)))}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
            >
              Tanlangan ({selectedRows.size} ta) → Saqlash
            </button>
          )}
        </div>
      )}
    </div>
  );
}
