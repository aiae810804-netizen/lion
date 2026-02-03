import React from 'react';
import { Operation, ProcessRoute } from '../../../types';
import { Scan, Box, Lock, ArrowRight } from 'lucide-react';

export default function OperationSelector({ operations, onSelectOp, onBack, route }: { operations: Operation[]; onSelectOp: (o: Operation) => void; onBack: () => void; route: ProcessRoute }) {
  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{route.name}</h1>
          <p className="text-slate-500">Seleccione la operación activa para comenzar.</p>
        </div>
        <button onClick={onBack} className="flex items-center text-sm text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-2 rounded-lg">
          <ArrowRight size={16} className="mr-2" /> Cambiar Ruta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative">
        {operations.map((op, idx) => (
          <div key={op.id} className="relative">
            {idx > 0 && (
              <div className="hidden lg:block absolute -left-4 top-1/2 transform -translate-y-1/2 -translate-x-full text-slate-300">
                <ArrowRight size={24} />
              </div>
            )}
            <button onClick={() => onSelectOp(op)} className="w-full flex flex-col items-center p-8 bg-white rounded-2xl shadow-sm border-2 border-transparent hover:border-blue-500 hover:shadow-xl transition-all group relative overflow-hidden h-full">
              <div className={`p-4 rounded-full mb-4 transition-transform group-hover:scale-110 ${op.isInitial ? 'bg-green-100 text-green-600' : op.isFinal ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                {op.isFinal ? <Box size={32} /> : <Scan size={32} />}
              </div>
              <h3 className="text-xl font-bold text-slate-800 group-hover:text-blue-600 text-center">{op.name}</h3>
              <span className="text-xs font-mono text-slate-400 mt-2 bg-slate-50 px-2 py-1 rounded">PASO: {idx + 1}</span>
              {(op as any).activeOperatorId && (
                <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl-lg flex items-center">
                  <Lock size={10} className="mr-1" /> {(op as any).activeOperatorName || 'Ocupado'}
                </div>
              )}
              {op.isInitial && <span className="absolute top-3 left-3 w-2 h-2 bg-green-500 rounded-full"></span>}
            </button>
          </div>
        ))}

        {operations.length === 0 && (
          <div className="col-span-3 text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Esta ruta no tiene operaciones asignadas.
          </div>
        )}
      </div>
    </div>
  );
}
