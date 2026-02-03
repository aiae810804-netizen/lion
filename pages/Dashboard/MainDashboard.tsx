import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/storage';
import { SerialUnit, Operation, ProcessRoute, PartNumber } from '../../types';
import { BarChart3, TrendingUp, CheckCircle, AlertOctagon, RefreshCw, Clock, Timer, Filter, Calendar, Layers, Activity } from 'lucide-react';

// --- SERIALS PROGRESS BAR COMPONENT ---
//import React from 'react';

function SerialStationProgressBar({ progressByStation }: { progressByStation?: { stationName: string; completed: boolean }[] }) {
    if (!progressByStation || progressByStation.length === 0) return <span className="text-slate-400">-</span>;
    return (
        <div className="flex gap-1 min-w-[60px]">
            {progressByStation.map((station, idx) => (
                <div key={station.stationName + idx} className="flex flex-col items-center">
                    <div
                        className={`h-3 rounded-full transition-all duration-300 ${station.completed ? 'bg-green-500' : 'bg-gray-200'}`}
                        style={{ width: '16px', height: '16px', border: '1px solid #cbd5e1' }}
                        title={`Estación: ${station.stationName} (${station.completed ? 'Completado' : 'Pendiente'})`}
                    />
                </div>
            ))}
        </div>
    );
}

export default function MainDashboard() {
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [serials, setSerials] = useState<SerialUnit[]>([]);
  const [ops, setOps] = useState<Operation[]>([]);
  const [routes, setRoutes] = useState<ProcessRoute[]>([]);
  const [parts, setParts] = useState<PartNumber[]>([]);

  // Filter State
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [selectedOpId, setSelectedOpId] = useState<string>('');
  const [dateStart, setDateStart] = useState(new Date().toISOString().split('T')[0]);
  const [dateEnd, setDateEnd] = useState(new Date().toISOString().split('T')[0]);
  
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [sData, oData, rData, pData] = await Promise.all([
        db.getSerials(),
        db.getOperations(),
        db.getRoutes(),
        db.getParts()
      ]);

      setSerials(sData);
      setOps(oData);
      setRoutes(rData);
      setParts(pData);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error("Dashboard Load Error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 60000); // Auto-refresh every minute
    return () => clearInterval(interval);
  }, []);

  // --- CALCULATION LOGIC ---
  const stats = useMemo(() => {
      // 1. Identify Scope (Route & Operation)
      const currentRoute = routes.find(r => r.id === selectedRouteId);
      
      // Determine which Operation to track for "Output"
      // If user selected an Op, use it. 
      // If not, use the Final Op of the selected Route.
      // If no Route selected, default to any Final Op (Global).
      let targetOpId = selectedOpId;
      
      if (!targetOpId && currentRoute) {
          // Find final step in route
          const steps = [...currentRoute.steps].sort((a,b) => a.stepOrder - b.stepOrder);
          // We look for the operation flagged as Final in the Ops list that matches the step
          // Or simply take the last step if no specific "IsFinal" logic matches context
          const lastStep = steps[steps.length - 1];
          if (lastStep) targetOpId = lastStep.operationId;
      }

      // 2. Filter Serials by Route (via PartNumber)
      let relevantSerials = serials;
      
      if (selectedRouteId) {
          // Get IDs of parts assigned to this route
          const routePartIds = parts.filter(p => p.processRouteId === selectedRouteId).map(p => p.id);
          relevantSerials = relevantSerials.filter(s => routePartIds.includes(s.partNumberId));
      }

      // 3. Filter History by Date Range & Target Operation
      // We need to count how many units passed the `targetOpId` within the `dateRange`.
      
      const start = new Date(dateStart); start.setHours(0,0,0,0);
      const end = new Date(dateEnd); end.setHours(23,59,59,999);

      let producedCount = 0;
      let activeWipCount = 0;
      let totalTimeMs = 0;
      let cycleCount = 0;
      
      const hourlyMap = new Map<string, number>();
      // Initialize hours 06:00 to 22:00 (Standard Shift)
      for(let i=6; i<=22; i++) hourlyMap.set(`${i}:00`, 0);

      relevantSerials.forEach(s => {
          // Check for Output (Production)
          // We look for a history entry matching targetOpId in the date range
          const productionEntries = s.history.filter(h => {
              const d = new Date(h.timestamp);
              // Match Operation
              const opMatch = targetOpId ? h.operationId === targetOpId : s.isComplete; // If no target defined (Global view), count completions
              // Match Date
              const dateMatch = d >= start && d <= end;
              return opMatch && dateMatch;
          });

          if (productionEntries.length > 0) {
              producedCount++;
              
              // HxH Mapping (Use the latest entry for this op if multiple exists, though usually 1 per op per unit)
              const lastEntry = productionEntries[productionEntries.length - 1];
              const h = new Date(lastEntry.timestamp).getHours();
              const key = `${h}:00`;
              // Only track if within our visualization window (or add dynamic key)
              // We'll add dynamic key if it's outside 6-22
              const finalKey = (h >= 6 && h <= 22) ? key : `${h}:00`; 
              hourlyMap.set(finalKey, (hourlyMap.get(finalKey) || 0) + 1);

              // Cycle Time (Approximate)
              // If looking at a specific Route, time = First Op -> Target Op
              // If Global, time = First Log -> Last Log
              if (s.history.length > 1) {
                  const sorted = [...s.history].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                  const t1 = new Date(sorted[0].timestamp).getTime();
                  const t2 = new Date(lastEntry.timestamp).getTime();
                  const diff = t2 - t1;
                  if (diff > 0 && diff < 172800000) { // < 48h check
                      totalTimeMs += diff;
                      cycleCount++;
                  }
              }
          }

          // WIP Logic
          // Unit is WIP if it is NOT complete AND it belongs to the route
          if (!s.isComplete) {
              activeWipCount++;
          }
      });

      const avgCycleTimeMins = cycleCount > 0 ? Math.round((totalTimeMs / cycleCount) / 60000) : 0;
      const fpy = producedCount > 0 ? 99.2 : 100; // Hardcoded simulation as requested previously, or implement calculation

      // Convert Map to Array and Sort by Hour
      const hourlyData = Array.from(hourlyMap.entries()).map(([hour, count]) => {
          return { hour, count, sortVal: parseInt(hour.split(':')[0]) };
      }).sort((a,b) => a.sortVal - b.sortVal);

      return {
          producedCount,
          activeWipCount,
          fpy,
          avgCycleTimeMins,
          hourlyData,
          targetOpName: ops.find(o => o.id === targetOpId)?.name || (selectedRouteId ? 'Final (Salida)' : 'Global')
      };

  }, [serials, selectedRouteId, selectedOpId, dateStart, dateEnd, routes, parts, ops]);

  // Filter Ops dropdown based on Route
  const availableOps = useMemo(() => {
      if (!selectedRouteId) return [];
      const route = routes.find(r => r.id === selectedRouteId);
      if (!route) return [];
      
      const routeOps: Operation[] = [];
      route.steps.sort((a,b) => a.stepOrder - b.stepOrder).forEach(step => {
          const op = ops.find(o => o.id === step.operationId);
          if (op) routeOps.push(op);
      });
      return routeOps;
  }, [selectedRouteId, routes, ops]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER & REFRESH */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard de Producción</h1>
            <p className="text-slate-500 flex items-center mt-1 text-sm">
                <Clock size={14} className="mr-1"/> Datos actualizados: {lastRefreshed.toLocaleTimeString()}
            </p>
        </div>
        <button 
            onClick={loadDashboardData} 
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm"
        >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
          
          {/* Route Selector */}
          <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-bold text-slate-500 mb-1 flex items-center"><Layers size={12} className="mr-1"/> Ruta / Proceso</label>
              <select 
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedRouteId}
                onChange={e => { setSelectedRouteId(e.target.value); setSelectedOpId(''); }}
              >
                  <option value="">-- Vista Global --</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
          </div>

          {/* Operation Selector */}
          <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-bold text-slate-500 mb-1 flex items-center"><Activity size={12} className="mr-1"/> Operación (Opcional)</label>
              <select 
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                value={selectedOpId}
                onChange={e => setSelectedOpId(e.target.value)}
                disabled={!selectedRouteId}
              >
                  <option value="">-- Salida Final (Default) --</option>
                  {availableOps.map(o => (
                      <option key={o.id} value={o.id}>
                          {o.name} {o.isFinal ? '(Fin)' : ''}
                      </option>
                  ))}
              </select>
          </div>

          {/* Date Range */}
          <div className="w-[160px]">
              <label className="text-xs font-bold text-slate-500 mb-1 flex items-center"><Calendar size={12} className="mr-1"/> Desde</label>
              <input type="date" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={dateStart} onChange={e => setDateStart(e.target.value)} />
          </div>
          <div className="w-[160px]">
              <label className="text-xs font-bold text-slate-500 mb-1 flex items-center"><Calendar size={12} className="mr-1"/> Hasta</label>
              <input type="date" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
          </div>
          
      </div>

      {/* CONTEXT TITLE */}
      <div className="flex items-center gap-2">
         <span className="px-3 py-1 bg-slate-800 text-white text-xs font-bold rounded-full uppercase tracking-wider">
             Alcance: {selectedRouteId ? routes.find(r => r.id === selectedRouteId)?.name : "Planta Completa"}
         </span>
         <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full uppercase tracking-wider">
             Punto de Medición: {stats.targetOpName}
         </span>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Produced */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Salida (Output)</p>
                <h2 className="text-4xl font-black text-slate-800 mt-2">{stats.producedCount}</h2>
                <p className="text-[10px] text-green-600 font-medium mt-1 flex items-center">
                    <TrendingUp size={10} className="mr-1" /> Unidades Procesadas
                </p>
            </div>
            <div className="bg-blue-50 p-4 rounded-full text-blue-600">
                <BarChart3 size={28} />
            </div>
        </div>

        {/* FPY */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">FPY (Calidad)</p>
                <h2 className="text-4xl font-black text-slate-800 mt-2">{stats.fpy}%</h2>
                <p className="text-[10px] text-slate-400 font-medium mt-1">First Pass Yield</p>
            </div>
            <div className={`p-4 rounded-full ${stats.fpy > 90 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                <CheckCircle size={28} />
            </div>
        </div>

        {/* Avg Cycle Time */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tiempo Ciclo</p>
                <h2 className="text-4xl font-black text-slate-800 mt-2">{stats.avgCycleTimeMins} <span className="text-lg font-normal text-slate-400">min</span></h2>
                <p className="text-[10px] text-purple-500 font-medium mt-1">Promedio en Selección</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-full text-purple-600">
                <Timer size={28} />
            </div>
        </div>

        {/* WIP */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">WIP Activo</p>
                <h2 className="text-4xl font-black text-slate-800 mt-2">{stats.activeWipCount}</h2>
                <p className="text-[10px] text-orange-600 font-medium mt-1">En Proceso (Ruta)</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-full text-orange-600">
                <AlertOctagon size={28} />
            </div>
        </div>
      </div>

      {/* CHART SECTION */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
            <BarChart3 className="mr-2 text-blue-600"/> Hora por Hora: {stats.targetOpName}
        </h3>
        <div className="h-72 w-full flex items-end justify-between space-x-2 border-b border-slate-100 pb-2">
            {stats.hourlyData.map((item, idx) => {
                const counts = stats.hourlyData.map(d => d.count);
                const maxVal = Math.max(...counts, 5); 
                const scaleMax = maxVal * 1.2;
                const heightPct = (item.count / scaleMax) * 100;
                return (
                    <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                         {/* Tooltip on Hover */}
                         <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-slate-800 text-white text-xs rounded px-2 py-1 pointer-events-none transition-opacity z-10 whitespace-nowrap">
                             {item.hour}: {item.count} pzas
                         </div>

                         {/* Count Label (Visible) */}
                         <div className={`text-xs font-bold mb-1 transition-all ${item.count > 0 ? 'text-slate-700 opacity-100' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
                            {item.count}
                         </div>
                         
                         {/* Bar */}
                         <div 
                            className={`w-full rounded-t-sm transition-all duration-1000 ease-out ${item.count > 0 ? 'bg-blue-600 hover:bg-blue-500 shadow-sm' : 'bg-slate-100 h-1'}`}
                            style={{ height: item.count > 0 ? `${heightPct}%` : '4px' }}
                         ></div>
                         
                         {/* Axis Label */}
                         <div className="absolute -bottom-8 w-full text-center">
                            <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap block transform -rotate-45 sm:rotate-0 origin-center">
                                {item.hour}
                            </span>
                         </div>
                    </div>
                )
            })}
        </div>
        <div className="mt-8 text-center text-xs text-slate-400">
            Horas (Formato 24h)
        </div>

        {/* TABLA DE PROGRESO POR ESTACIÓN POR SERIAL */}
        <div className="mt-12">
          <h4 className="text-md font-bold text-slate-700 mb-4 flex items-center"><TrendingUp className="mr-2 text-green-600"/> Progreso por Estación (Seriales recientes)</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-3">Serial</th>
                  <th className="p-3">Orden</th>
                  <th className="p-3">Progreso por Estación</th>
                  <th className="p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {serials.slice(0, 20).map((serial) => {
                  // Transformar progressByStation (objeto) a array de estaciones para el componente
                  let progressArr: { stationName: string; completed: boolean }[] = [];
                  if (serial.progressByStation && typeof serial.progressByStation === 'object' && !Array.isArray(serial.progressByStation)) {
                    // Buscar nombres de estación desde ops
                    progressArr = Object.entries(serial.progressByStation).map(([opId, count]) => {
                      const op = ops.find(o => o.id === opId);
                      return {
                        stationName: op ? op.name : opId,
                        completed: Number(count) > 0
                      };
                    });
                  } else if (Array.isArray(serial.progressByStation)) {
                    progressArr = serial.progressByStation;
                  }
                  return (
                    <tr key={serial.serialNumber} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-800">{serial.serialNumber}</td>
                      <td className="p-3 text-slate-600">{serial.orderNumber}</td>
                      <td className="p-3">
                        <SerialStationProgressBar progressByStation={progressArr} />
                      </td>
                      <td className="p-3">
                        {serial.isComplete ? <span className="text-green-600 font-bold">Completado</span> : <span className="text-blue-600 font-bold">En Proceso</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
