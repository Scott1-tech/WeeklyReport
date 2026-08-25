import { useRef, useState } from 'react';
import { UploadCloud, X, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { readMasterDataSheet, parseMasterDataRows } from '../lib/importMasterData';

// Lets the office update the whole roster from a weekly export instead of
// clicking through the Add Driver / Add Truck forms one at a time. Parsing
// happens in the browser (this sandbox's own network can't reach the
// deployed API), then the parsed rows are posted to /api/import, which
// upserts them — matching drivers by name+company and trucks by unit — and
// never deletes anything that isn't in the uploaded file.
export default function ImportPanel({ onImported }) {
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null); // { drivers, trucks, stats }
  const [parseError, setParseError] = useState(null);
  const [importState, setImportState] = useState('idle'); // 'idle' | 'importing' | 'done' | 'error'
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);

  const reset = () => {
    setFileName('');
    setPreview(null);
    setParseError(null);
    setImportState('idle');
    setImportResult(null);
    setImportError(null);
  };

  const close = () => {
    setIsOpen(false);
    reset();
  };

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setPreview(null);
    setImportState('idle');
    setImportResult(null);
    setImportError(null);

    try {
      const { sheetName, aoa } = await readMasterDataSheet(file);
      const parsed = parseMasterDataRows(aoa);
      setPreview({ ...parsed, sheetName });
    } catch (err) {
      console.error('[ImportPanel] parse failed', err);
      setParseError(err.message || 'Could not read that file. Make sure it is a .xlsx export.');
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImportState('importing');
    setImportError(null);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drivers: preview.drivers, trucks: preview.trucks })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Import failed (${res.status})`);
      }
      const result = await res.json();
      setImportState('done');
      setImportResult(result);
      onImported?.();
    } catch (err) {
      console.error('[ImportPanel] import failed', err);
      setImportState('error');
      setImportError(err.message || 'Import failed');
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900 text-white text-xs font-bold shadow-lg hover:bg-slate-800 transition-colors"
      >
        <UploadCloud className="w-4 h-4" />
        Import Excel
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">Import Weekly Data</h3>
              </div>
              <button onClick={close} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Upload the weekly "Master Data" export (.xlsx). Drivers are matched by name + carrier, trucks by
              unit number — existing records are updated, new ones are added. Nothing already in the database is
              ever removed by an import.
            </p>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-stone-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors text-xs font-semibold"
              >
                <UploadCloud className="w-6 h-6" />
                {fileName ? fileName : 'Click to choose a .xlsx file'}
              </button>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            {preview && importState === 'idle' && (
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-slate-700 space-y-1">
                <div className="font-bold text-slate-900">
                  Found {preview.stats.driversFound} drivers and {preview.stats.trucksFound} trucks
                </div>
                <div className="text-slate-500">
                  Sheet "{preview.sheetName}" · header row {preview.stats.headerRow} · {preview.stats.rowsScanned} rows scanned
                  {preview.stats.skippedUnrecognizedCompany > 0 && (
                    <> · {preview.stats.skippedUnrecognizedCompany} rows skipped (unrecognized carrier)</>
                  )}
                </div>
              </div>
            )}

            {importState === 'done' && importResult && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Import complete</div>
                  <div>
                    Drivers: {importResult.drivers.inserted} added, {importResult.drivers.updated} updated
                    <br />
                    Trucks: {importResult.trucks.inserted} added, {importResult.trucks.updated} updated
                  </div>
                </div>
              </div>
            )}

            {importState === 'error' && importError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-3 border-t border-stone-100">
              <button
                onClick={close}
                className="flex-1 py-2 font-bold text-slate-600 bg-stone-100 hover:bg-stone-200 rounded-xl text-xs"
              >
                {importState === 'done' ? 'Close' : 'Cancel'}
              </button>
              {importState !== 'done' && (
                <button
                  onClick={confirmImport}
                  disabled={!preview || importState === 'importing'}
                  className="flex-1 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-stone-300 disabled:cursor-not-allowed rounded-xl text-xs flex items-center justify-center gap-1.5"
                >
                  {importState === 'importing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {importState === 'importing' ? 'Importing…' : 'Confirm Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
