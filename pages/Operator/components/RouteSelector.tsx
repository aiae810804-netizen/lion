import React from 'react';
import { ProcessRoute } from '../../../types';
import { GitMerge, ChevronRight } from 'lucide-react';

export default function RouteSelector({ routes, onSelectRoute }: { routes: ProcessRoute[]; onSelectRoute: (r: ProcessRoute) => void }) {
  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Selección de Ruta</h1>
        <p className="text-slate-500">Seleccione el proceso en el que va a trabajar.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {routes.map(route => (
          <button
            key={route.id}
            onClick={() => onSelectRoute(route)}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-lg transition-all text-left group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="bg-blue-50 p-3 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <GitMerge size={24} />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">{route.name}</h3>
            <p className="text-sm text-slate-500 line-clamp-2">{route.description}</p>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center text-xs text-slate-400 font-mono">
              {route.steps.length} Operaciones Config.
              <ChevronRight className="ml-auto" size={16} />
            </div>
          </button>
        ))}

        {routes.length === 0 && (
          <div className="col-span-3 text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            No hay rutas configuradas. Contacte al administrador.
          </div>
        )}
      </div>
    </div>
  );
}
