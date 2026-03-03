import React, { useState } from 'react';
import { db } from '../../services/storage';
import { Upload, FolderInput, FileJson, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';

export default function TestResultsImport() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => setLogs(prev => [msg, ...prev]);

  const processFileContent = async (content: string, filename: string) => {
    try {
      const json = JSON.parse(content);
      // El endpoint espera un array, si es un objeto único lo envolvemos
      const data = Array.isArray(json) ? json : [json];
      
      if (data.length === 0) {
         addLog(`[WARN] ${filename}: Archivo vacío o sin datos válidos.`);
         return;
      }

      await db.importTestResults(data);
      addLog(`[OK] ${filename}: ${data.length} registros importados.`);
    } catch (e: any) {
      addLog(`[ERROR] ${filename}: ${e.message}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setLogs([]);
    addLog(`Iniciando procesamiento de ${files.length} archivo(s)...`);

    const fileArray = Array.from(files);
    
    // Procesar secuencialmente para no saturar el navegador/servidor
    for (const file of fileArray) {
        if (!file.name.toLowerCase().endsWith('.json')) {
            addLog(`[SKIP] ${file.name}: No es un archivo JSON.`);
            continue;
        }

        try {
            const text = await file.text();
            await processFileContent(text, file.name);
        } catch (err: any) {
            addLog(`[FAIL] ${file.name}: Error de lectura - ${err.message}`);
        }
    }

    setLoading(false);
    addLog('Proceso finalizado.');
    e.target.value = ''; // Reset input
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border border-slate-200 h-full flex flex-col">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Upload className="text-blue-600" /> Importar Resultados de Prueba
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Single/Multiple Files */}
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors group">
            <FileJson size={48} className="text-slate-400 mb-4 group-hover:text-blue-500 transition-colors" />
            <h3 className="font-bold text-slate-700 mb-2">Archivos Individuales</h3>
            <p className="text-sm text-slate-500 mb-4">Selecciona uno o más archivos .json</p>
            <label className={`bg-blue-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-blue-700 font-medium transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                Seleccionar Archivos
                <input type="file" className="hidden" accept=".json" multiple onChange={handleFileUpload} disabled={loading} />
            </label>
        </div>

        {/* Folder Upload */}
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors group">
            <FolderInput size={48} className="text-slate-400 mb-4 group-hover:text-slate-600 transition-colors" />
            <h3 className="font-bold text-slate-700 mb-2">Carpeta Completa</h3>
            <p className="text-sm text-slate-500 mb-4">Procesar todos los .json de una carpeta</p>
            <label className={`bg-slate-800 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-slate-900 font-medium transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                Seleccionar Carpeta
                <input 
                    type="file" 
                    className="hidden" 
                    {...{ webkitdirectory: "", directory: "" } as any} 
                    onChange={handleFileUpload} 
                    disabled={loading} 
                />
            </label>
        </div>
      </div>

      {/* Logs Console */}
      <div className="flex-1 bg-slate-900 rounded-lg p-4 font-mono text-xs overflow-y-auto shadow-inner border border-slate-800">
        <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
            <span className="text-slate-400 font-bold uppercase">Consola de Importación</span>
            {loading && <span className="flex items-center gap-2 text-blue-400"><Loader2 className="animate-spin" size={14}/> Procesando...</span>}
        </div>
        
        {logs.length === 0 && !loading && <p className="text-slate-600 italic mt-4 text-center">Esperando archivos para procesar...</p>}
        
        {logs.map((log, i) => {
            let color = "text-slate-300";
            if (log.startsWith('[OK]')) color = "text-green-400";
            if (log.startsWith('[ERROR]') || log.startsWith('[FAIL]')) color = "text-red-400";
            if (log.startsWith('[WARN]') || log.startsWith('[SKIP]')) color = "text-yellow-400";
            return <div key={i} className={`${color} mb-1 break-all`}>{log}</div>
        })}
      </div>
    </div>
  );
}