import React, { useState, useEffect } from 'react';
import TestResultsImport from './TestResultsImport';
import { db } from '../../services/storage';
import { Star, Trash2, Plus, Upload, List } from 'lucide-react';

const TestAdmin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'IMPORT' | 'GOLDEN'>('IMPORT');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-6 mb-6 border-b border-slate-200 pb-1">
        <button 
          onClick={() => setActiveTab('IMPORT')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${activeTab === 'IMPORT' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Upload size={18} /> Importar Resultados
        </button>
        <button 
          onClick={() => setActiveTab('GOLDEN')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${activeTab === 'GOLDEN' ? 'border-yellow-500 text-yellow-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Star size={18} /> Seriales Golden
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'IMPORT' ? <TestResultsImport /> : <GoldenSerialsManager />}
      </div>
    </div>
  );
};

const GoldenSerialsManager: React.FC = () => {
  const [serials, setSerials] = useState<{ SerialNumber: string, Type: 'M3' | 'HUB' }[]>([]);
  const [newSerial, setNewSerial] = useState('');
  const [newType, setNewType] = useState<'M3' | 'HUB'>('M3');
  const [loading, setLoading] = useState(false);

  const fetchSerials = async () => {
    try {
      const data = await db.getGoldenSerials();
      setSerials(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchSerials(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSerial) return;
    setLoading(true);
    try {
      await db.addGoldenSerial(newSerial, newType);
      setNewSerial('');
      fetchSerials();
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (sn: string) => {
    if (!confirm('¿Eliminar serial golden?')) return;
    try {
      await db.deleteGoldenSerial(sn);
      fetchSerials();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border border-slate-200 h-full flex flex-col">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Star className="text-yellow-500" /> Gestión de Seriales Golden
      </h2>

      <form onSubmit={handleAdd} className="flex gap-4 mb-8 bg-slate-50 p-4 rounded-lg border border-slate-200 items-end">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 mb-1">Número de Serie</label>
          <input type="text" value={newSerial} onChange={e => setNewSerial(e.target.value)} className="w-full p-2 border rounded" placeholder="Ej. 332509..." required />
        </div>
        <div className="w-32">
          <label className="block text-xs font-bold text-slate-500 mb-1">Tipo</label>
          <select value={newType} onChange={e => setNewType(e.target.value as any)} className="w-full p-2 border rounded bg-white">
            <option value="M3">M3 (Sensor)</option>
            <option value="HUB">HUB</option>
          </select>
        </div>
        <button disabled={loading} type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 font-medium">
          <Plus size={18} /> Agregar
        </button>
      </form>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
            <tr>
              <th className="p-3">Serial</th>
              <th className="p-3">Tipo</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {serials.map(s => (
              <tr key={s.SerialNumber} className="hover:bg-slate-50">
                <td className="p-3 font-mono font-medium">{s.SerialNumber}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${s.Type === 'M3' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                    {s.Type}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => handleDelete(s.SerialNumber)} className="text-red-500 hover:bg-red-50 p-2 rounded">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {serials.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-400">No hay seriales golden definidos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TestAdmin;