import React from 'react';
import { FileDown, Printer, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface ExportButtonProps {
  data: any[];
  headers: string[];
  title: string;
  filename: string;
}

export default function ExportButton({ data, headers, title, filename }: ExportButtonProps) {
  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF() as any;
    doc.text(title, 14, 15);
    const tableData = data.map(obj => Object.values(obj));
    doc.autoTable({
      head: [headers],
      body: tableData,
      startY: 20,
    });
    doc.save(`${filename}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex space-x-2 no-print">
      <button 
        onClick={handlePrint}
        className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 shadow-sm transition-all"
        title="Печать"
      >
        <Printer className="w-4 h-4" />
      </button>
      <button 
        onClick={exportToPDF}
        className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 shadow-sm transition-all"
        title="PDF"
      >
        <FileDown className="w-4 h-4" />
      </button>
      <button 
        onClick={exportToExcel}
        className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 shadow-sm transition-all"
        title="Excel"
      >
        <FileSpreadsheet className="w-4 h-4" />
      </button>
    </div>
  );
}
