import React, { useState, useEffect, useContext, useMemo } from 'react';
import { db } from '../../services/storage';
import { WorkOrder, SerialUnit, PartNumber, Operation, PrintLog, UserRole } from '../../types';
import { Search, Lock, Unlock, Monitor, Eye, X, History, Trash2, Printer, AlertCircle, CheckCircle, RefreshCw, Edit2, Save, Filter, Package } from 'lucide-react';
import { useAlert } from '../../context/AlertContext';
import { AuthContext } from '../../context/AuthContext';

export default function SupervisorDashboard() {
  const [activeTab, setActiveTab] = useState<'orders' | 'trace' | 'stations'>('orders');

  return (
    <div>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Producción</h1>
          <p className="text-slate-500">Órdenes de trabajo y rastreabilidad de producto.</p>
        </div>
      </div>

      <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm inline-flex mb-6">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'orders' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Órdenes de Trabajo
        </button>
        <button
          onClick={() => setActiveTab('trace')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'trace' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Rastreabilidad (Logs)
        </button>
        <button
          onClick={() => setActiveTab('stations')}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'stations' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Monitor de Estaciones
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[600px]">
        {activeTab === 'orders' && <OrdersManager />}
        {activeTab === 'trace' && <TraceabilityView />}
        {activeTab === 'stations' && <StationsMonitor />}
      </div>
    </div>
  );
}

function StationsMonitor() {
  const [ops, setOps] = useState<(Operation & { activeOperatorName?: string, activeOperatorId?: string })[]>([]);
  const [historyToday, setHistoryToday] = useState<any[]>([]);
  const { showConfirm, showAlert, showLoading, hideLoading } = useAlert();

  const loadData = async () => {
    const data = await db.getOperations();
    setOps(data);

    // Load History Today
    const allSerials = await db.getSerials();
    const todayStr = new Date().toISOString().split('T')[0];
    const flatHistory: any[] = [];
    
    // Flatten history to find items from today
    allSerials.forEach(s => {
        if (s.history && Array.isArray(s.history)) {
            s.history.forEach(h => {
                 if (h.timestamp.startsWith(todayStr)) {
                     flatHistory.push({
                         serial: s.serialNumber,
                         order: s.orderNumber,
                         time: new Date(h.timestamp).toLocaleTimeString(),
                         operator: h.operatorName || h.operatorId,
                         operation: h.operationName || h.operationId,
                         rawTime: new Date(h.timestamp).getTime()
                     });
                 }
            });
        }
    });

    // Sort by latest
    setHistoryToday(flatHistory.sort((a, b) => b.rawTime - a.rawTime));
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const handleUnlock = async (opId: string) => {
    const confirmed = await showConfirm(
      "Confirmar Desbloqueo",
      "¿Forzar el desbloqueo de esta estación? Esto expulsará al operador actual."
    );
    
    if (!confirmed) return;

    try {
        showLoading("Liberando Estación...");
        await db.unlockStation(opId);
        await loadData();
        hideLoading();
        showAlert("Éxito", "Estación liberada correctamente", "success");
    } catch (e:any) {
        hideLoading();
        showAlert("Error", "Error al desbloquear: " + e.message, "error");
    }
  };

  return (
    <div>
      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><Monitor className="mr-2"/> Estado de Estaciones</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {ops.map(op => (
            <div key={op.id} className={`p-4 rounded-xl border ${op.activeOperatorId ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-slate-800">{op.name}</h4>
                    {op.activeOperatorId ? <Lock size={18} className="text-red-500"/> : <Unlock size={18} className="text-green-500"/>}
                </div>
                <div className="text-sm mb-4">
                    {op.activeOperatorId ? (
                        <span className="text-red-700 font-medium">Ocupado por: {op.activeOperatorName || op.activeOperatorId}</span>
                    ) : (
                        <span className="text-green-700 font-medium">Disponible</span>
                    )}
                </div>
                {op.activeOperatorId && (
                    <button onClick={() => handleUnlock(op.id)} className="w-full text-xs bg-white border border-red-200 text-red-600 py-2 rounded hover:bg-red-100 font-semibold">
                        Liberar Estación
                    </button>
                )}
            </div>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-6">
         <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><History className="mr-2"/> Actividad del Día</h3>
         <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-96 overflow-y-auto">
             <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600 sticky top-0">
                    <tr>
                        <th className="p-3">Hora</th>
                        <th className="p-3">Operador</th>
                        <th className="p-3">Estación</th>
                        <th className="p-3">Serial</th>
                        <th className="p-3">Orden</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {historyToday.map((h, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 font-mono text-xs">{h.time}</td>
                            <td className="p-3">{h.operator}</td>
                            <td className="p-3 font-medium">{h.operation}</td>
                            <td className="p-3 font-mono">{h.serial}</td>
                            <td className="p-3">{h.order}</td>
                        </tr>
                    ))}
                    {historyToday.length === 0 && (
                        <tr><td colSpan={5} className="p-4 text-center text-slate-400">Sin actividad registrada hoy.</td></tr>
                    )}
                </tbody>
             </table>
         </div>
      </div>
    </div>
  )
}

function OrdersManager() {
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [parts, setParts] = useState<PartNumber[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const { showAlert, showConfirm, showLoading, hideLoading } = useAlert();
  
  // Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  // Modal for managing serials in an order
  const [managingOrder, setManagingOrder] = useState<WorkOrder | null>(null);
  const [orderSerials, setOrderSerials] = useState<SerialUnit[]>([]);
  const [managingOrderPart, setManagingOrderPart] = useState<PartNumber | null>(null);

  // Editing Order State
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);

  const loadData = async () => {
    try {
        const [o, p, allSerials] = await Promise.all([
            db.getOrders(), 
            db.getParts(),
            db.getSerials()
        ]);
        setOrders(o);
        setParts(p);

        // Calculate counts
        const counts: Record<string, number> = {};
        allSerials.forEach(s => {
            counts[s.orderNumber] = (counts[s.orderNumber] || 0) + 1;
        });
        setOrderCounts(counts);

    } catch (e: any) {
        console.error("Error loading orders data", e);
        showAlert("Error", "Error cargando datos: " + e.message, "error");
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleRefresh = async () => {
      showLoading("Actualizando...");
      await loadData();
      hideLoading();
  }

  // --- ORDER EDITING LOGIC ---
  const handleEditOrder = (order: WorkOrder) => {
      setEditingOrder({ ...order });
  };

  const handleSaveOrder = async () => {
      if (!editingOrder) return;
      showLoading("Guardando...");
      try {
          await db.updateOrder(editingOrder.id, {
              quantity: editingOrder.quantity,
              status: editingOrder.status
          });
          await loadData();
          setEditingOrder(null);
          hideLoading();
      } catch (e: any) {
          hideLoading();
          showAlert("Error", e.message, "error");
      }
  };

  const handleDeleteOrder = async (orderId: string) => {
      const confirmed = await showConfirm("Eliminar Orden", "¿Está seguro? Esto fallará si existen seriales asociados.");
      if (!confirmed) return;
      
      showLoading("Eliminando...");
      try {
          await db.deleteOrder(orderId);
          await loadData();
          hideLoading();
      } catch (e: any) {
          hideLoading();
          showAlert("Error", e.message, "error");
      }
  };

  // --- SERIAL MANAGEMENT ---
  const openManageSerials = async (order: WorkOrder) => {
      showLoading("Cargando Seriales...");
      setManagingOrder(order);
      const allSerials = await db.getSerials();
      const filtered = allSerials.filter(s => s.orderNumber === order.orderNumber);
      setOrderSerials(filtered);
      // Buscar el part para saber si es ACCESSORIES
      const part = parts.find(p => p.id === order.partNumberId) || null;
      setManagingOrderPart(part);
      hideLoading();
  }

  const closeManageSerials = () => {
      setManagingOrder(null);
      setOrderSerials([]);
      setManagingOrderPart(null);
      loadData(); // Refresh counts on close
  }

  const handleRemoveSerial = async (serialNumber: string) => {
      const confirmed = await showConfirm(
          "¿Retirar Serial?", 
          `¿Está seguro de retirar el serial ${serialNumber} de esta orden? Esto eliminará su historial y lo dejará libre para asignarse nuevamente.`
      );
      
      if (!confirmed) return;

      try {
          showLoading("Eliminando Serial...");
          await db.deleteSerial(serialNumber);
          // Refresh list
          const allSerials = await db.getSerials();
          const filtered = allSerials.filter(s => s.orderNumber === managingOrder!.orderNumber);
          setOrderSerials(filtered);
          hideLoading();
      } catch (e:any) {
          hideLoading();
          showAlert("Error", "Error al eliminar serial: " + e.message, "error");
      }
  }

  const getPartCode = (id: string) => parts.find(p => p.id === id)?.partNumber || id;

  // Filtered Logic
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
        // Search Term (Lot Number or SAP Order)
        const term = searchTerm.toLowerCase();
        const matchesTerm = (o.orderNumber || '').toLowerCase().includes(term) || (o.sapOrderNumber || '').toLowerCase().includes(term);
        if (!matchesTerm) return false;

        // Status Filter
        if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;

        // Date Range
        if (dateStart) {
            const start = new Date(dateStart).setHours(0,0,0,0);
            const ordDate = new Date(o.createdAt).setHours(0,0,0,0);
            if (ordDate < start) return false;
        }
        if (dateEnd) {
            const end = new Date(dateEnd).setHours(23,59,59,999);
            const ordDate = new Date(o.createdAt).getTime();
            if (ordDate > end) return false;
        }

        return true;
    });
  }, [orders, searchTerm, statusFilter, dateStart, dateEnd]);

  const isAdmin = user?.role === UserRole.ADMIN;
  const isSupervisor = user?.role === UserRole.SUPERVISOR;

  return (
    <div className="space-y-6 relative">
      
      {/* FILTER BAR */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-bold text-slate-500 mb-1 block">Buscar (Orden / SAP)</label>
              <div className="relative">
                 <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                 <input 
                    type="text" 
                    placeholder="Buscar..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                 />
              </div>
          </div>
          
          <div className="w-[150px]">
              <label className="text-xs font-bold text-slate-500 mb-1 block">Estatus</label>
              <select 
                className="w-full p-2 border rounded-lg text-sm bg-white"
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
              >
                  <option value="ALL">Todos</option>
                  <option value="OPEN">Abierta</option>
                  <option value="CLOSED">Cerrada</option>
              </select>
          </div>

          <div className="w-[150px]">
              <label className="text-xs font-bold text-slate-500 mb-1 block">Desde</label>
              <input type="date" className="w-full p-2 border rounded-lg text-sm bg-white" value={dateStart} onChange={e => setDateStart(e.target.value)} />
          </div>
          <div className="w-[150px]">
              <label className="text-xs font-bold text-slate-500 mb-1 block">Hasta</label>
              <input type="date" className="w-full p-2 border rounded-lg text-sm bg-white" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
          </div>

          <div className="flex gap-2 ml-auto">
             <button onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setDateStart(''); setDateEnd(''); }} className="px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-lg">
                 Limpiar Filtros
             </button>
             <button onClick={handleRefresh} className="flex items-center text-sm text-slate-600 hover:text-blue-600 bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-sm hover:shadow transition-all">
                <RefreshCw size={16} className="mr-2"/> Refrescar
             </button>
          </div>
      </div>

      <div className="flex justify-end mb-2">
         <p className="text-xs text-slate-400 italic">* Mostrando {filteredOrders.length} ordenes.</p>
      </div>

      {/* Orders Table */}
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-100 text-slate-600 font-semibold">
          <tr>
            <th className="p-4 rounded-tl-lg">Lote Interno</th>
            <th className="p-4 text-blue-700">Orden SAP</th>
            <th className="p-4">Número Parte</th>
            <th className="p-4">Asignado / Total</th>
            <th className="p-4">Fecha</th>
            <th className="p-4">Estatus</th>
            <th className="p-4 rounded-tr-lg text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map(o => {
            const assigned = orderCounts[o.orderNumber] || 0;
            const progress = Math.min((assigned / o.quantity) * 100, 100);
            
            // Logic: Can edit if Admin OR if Order is not Closed
            const canEdit = isAdmin || (o.status !== 'CLOSED');

            return (
                <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-4 font-bold text-slate-800">{o.orderNumber}</td>
                <td className="p-4 font-mono font-medium text-blue-700">{o.sapOrderNumber || '-'}</td>
                <td className="p-4">{getPartCode(o.partNumberId)}</td>
                <td className="p-4">
                    <div className="flex flex-col w-32">
                        <span className="font-bold text-slate-700 text-xs mb-1">
                            {assigned} / {o.quantity}
                        </span>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                                className={`h-1.5 rounded-full ${progress >= 100 ? 'bg-green-500' : 'bg-blue-600'}`}
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>
                </td>
                <td className="p-4 text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${o.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>
                    {o.status}
                    </span>
                </td>
                <td className="p-4 flex justify-end gap-2">
                    <button onClick={() => openManageSerials(o)} className="text-blue-600 hover:text-blue-800 border border-blue-200 p-1.5 rounded hover:bg-blue-50" title="Ver Seriales">
                        <Eye size={16} />
                    </button>
                    {canEdit && (
                        <button onClick={() => handleEditOrder(o)} className="text-slate-600 hover:text-slate-800 border border-slate-200 p-1.5 rounded hover:bg-slate-50" title="Editar Orden">
                            <Edit2 size={16} />
                        </button>
                    )}
                </td>
                </tr>
            );
          })}
          {filteredOrders.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">No se encontraron órdenes con los filtros actuales.</td></tr>}
        </tbody>
      </table>

      {/* Edit Order Modal */}
      {editingOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                  <h3 className="text-lg font-bold mb-4">Editar Orden {editingOrder.orderNumber}</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500">Cantidad Total</label>
                          <input 
                            type="number" 
                            className="w-full p-2 border rounded" 
                            value={editingOrder.quantity} 
                            onChange={e => setEditingOrder({...editingOrder, quantity: Number(e.target.value)})}
                          />
                      </div>
                      
                      {/* Only Admin can change Status or Delete */}
                      {isAdmin && (
                        <div>
                             <label className="block text-xs font-bold text-slate-500">Estatus</label>
                             <select 
                                className="w-full p-2 border rounded"
                                value={editingOrder.status}
                                onChange={(e: any) => setEditingOrder({...editingOrder, status: e.target.value})}
                             >
                                 <option value="OPEN">ABIERTA</option>
                                 <option value="CLOSED">CERRADA</option>
                             </select>
                        </div>
                      )}

                      <div className="flex gap-2 pt-4">
                          <button onClick={() => setEditingOrder(null)} className="flex-1 p-2 border rounded text-slate-600 hover:bg-slate-50">Cancelar</button>
                          <button onClick={handleSaveOrder} className="flex-1 p-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center">
                              <Save size={16} className="mr-2"/> Guardar
                          </button>
                      </div>

                      {isAdmin && (
                          <div className="border-t pt-4 mt-2">
                              <button onClick={() => { setEditingOrder(null); handleDeleteOrder(editingOrder.id); }} className="w-full p-2 text-red-600 text-sm hover:underline text-center">
                                  Eliminar Orden (Admin)
                              </button>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Manage Serials Modal */}
      {managingOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <div>
                        <h3 className="text-xl font-bold text-slate-800">Gestión de Seriales</h3>
                        <p className="text-sm text-slate-500">Orden: {managingOrder.orderNumber} | Asignados: {orderSerials.length} / {managingOrder.quantity}</p>
                      </div>
                      <button onClick={closeManageSerials} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                      {managingOrderPart?.serialGenType === 'ACCESSORIES' ? (
                        <div className="text-center text-slate-500 py-12 text-lg font-bold">
                          Este es un lote de accesorios no serializados. No existen seriales individuales para este lote.
                        </div>
                      ) : orderSerials.length === 0 ? (
                          <p className="text-center text-slate-400 py-8">No hay seriales asignados a esta orden aún.</p>
                      ) : (
                        <table className="w-full text-sm text-left bg-white rounded-lg shadow-sm overflow-hidden">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="p-3">Serial</th>
                                    <th className="p-3">Estado</th>
                                    {(isAdmin || isSupervisor) && <th className="p-3 text-right">Acción</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {orderSerials.map(s => (
                                    <tr key={s.serialNumber}>
                                        <td className="p-3 font-mono font-medium">{s.serialNumber}</td>
                                        <td className="p-3">
                                            {s.isComplete ? <span className="text-green-600 font-bold text-xs">Completado</span> : <span className="text-blue-600 font-bold text-xs">En Proceso</span>}
                                        </td>
                                        {(isAdmin || isSupervisor) && (
                                            <td className="p-3 text-right">
                                                <button 
                                                onClick={() => handleRemoveSerial(s.serialNumber)}
                                                className="text-red-600 hover:text-red-800 text-xs font-bold hover:underline flex items-center justify-end w-full"
                                                >
                                                    <Trash2 size={14} className="mr-1"/> Retirar / Eliminar
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                      )}
                  </div>
                  <div className="p-4 border-t border-slate-100 text-xs text-slate-400 text-center">
                      * Al retirar un serial, este se elimina del sistema y podrá ser asignado a una nueva orden en la operación inicial.
                  </div>
              </div>
          </div>
      )}
    </div>
  )
}

function TraceabilityView() {
  const [traceType, setTraceType] = useState<'SERIAL' | 'LOT'>('SERIAL');
  const [serials, setSerials] = useState<SerialUnit[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [parts, setParts] = useState<PartNumber[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Selection State
  const [selectedSerial, setSelectedSerial] = useState<SerialUnit | null>(null);
  const [selectedLot, setSelectedLot] = useState<WorkOrder | null>(null);

  useEffect(() => {
    const load = async () => {
       const [s, o, p] = await Promise.all([db.getSerials(), db.getOrders(), db.getParts()]);
       setSerials(s.reverse());
       setOrders(o.reverse()); // Latest first
       setParts(p);
    }
    load();
  }, []);

  const getPartDetails = (pid: string) => parts.find(p => p.id === pid);

  // Filter Logic
  const filtered = useMemo(() => {
      if (traceType === 'SERIAL') {
          // Filtrar fuera los seriales de lotes ACCESSORIES
          return serials.filter(s => {
            const part = getPartDetails(s.partNumberId);
            return part?.serialGenType !== 'ACCESSORIES' && ((s.serialNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) || (s.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()));
          });
      } else {
          // Filter Orders that are ACCESSORIES
          return orders.filter(o => {
              const part = getPartDetails(o.partNumberId);
              const isAccessory = part?.serialGenType === 'ACCESSORIES';
              const matchesSearch = (o.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) || (o.sapOrderNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
              return isAccessory && matchesSearch;
          });
      }
  }, [traceType, serials, orders, searchTerm, parts]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setTraceType('SERIAL')} className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${traceType === 'SERIAL' ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}>
                Serializados
            </button>
            <button onClick={() => setTraceType('LOT')} className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${traceType === 'LOT' ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}>
                Lotes (Accesorios)
            </button>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input 
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder={traceType === 'SERIAL' ? "Buscar Serial..." : "Buscar Lote / Orden..."}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-800 text-white">
            <tr>
              {traceType === 'SERIAL' ? (
                <>
                    <th className="p-3">Serial</th>
                    <th className="p-3">Lote</th>
                    <th className="p-3">Parte</th>
                    <th className="p-3">Último Evento</th>
                </>
              ) : (
                <>
                    <th className="p-3">Lote (Orden)</th>
                    <th className="p-3">Orden SAP</th>
                    <th className="p-3">Parte</th>
                    <th className="p-3">Cantidad</th>
                    <th className="p-3">Estatus</th>
                </>
              )}
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((item, i) => {
              if (traceType === 'SERIAL') {
                  const s = item as SerialUnit;
                  const p = getPartDetails(s.partNumberId);
                  const lastHistory = s.history && s.history.length > 0 ? s.history[s.history.length - 1] : null;
                  return (
                    <tr key={i} className="hover:bg-blue-50 cursor-pointer" onClick={() => setSelectedSerial(s)}>
                      <td className="p-3 font-mono font-medium text-blue-700">{s.serialNumber}</td>
                      <td className="p-3">{s.orderNumber}</td>
                      <td className="p-3">{p?.productCode || '-'}</td>
                      <td className="p-3 text-slate-500">
                        {lastHistory ? new Date(lastHistory.timestamp).toLocaleString() : 'Sin registro'}
                      </td>
                      <td className="p-3 text-right"><Eye size={16} className="text-slate-400"/></td>
                    </tr>
                  );
              } else {
                  const o = item as WorkOrder;
                  const p = getPartDetails(o.partNumberId);
                  return (
                    <tr key={i} className="hover:bg-blue-50 cursor-pointer" onClick={() => setSelectedLot(o)}>
                      <td className="p-3 font-mono font-medium text-blue-700">{o.orderNumber}</td>
                      <td className="p-3">{o.sapOrderNumber || '-'}</td>
                      <td className="p-3">{p?.productCode || '-'}</td>
                      <td className="p-3">{o.quantity}</td>
                      <td className="p-3"><span className={`px-2 py-1 text-xs rounded-full ${o.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{o.status}</span></td>
                      <td className="p-3 text-right"><Eye size={16} className="text-slate-400"/></td>
                    </tr>
                  );
              }
            })}
          </tbody>
        </table>
      </div>

      {selectedSerial && (
          <SerialDetailModal 
            serial={selectedSerial} 
            part={getPartDetails(selectedSerial.partNumberId)} 
            onClose={() => setSelectedSerial(null)} 
          />
      )}
      
      {selectedLot && (
          <LotDetailModal
             order={selectedLot}
             part={getPartDetails(selectedLot.partNumberId)}
             onClose={() => setSelectedLot(null)}
          />
      )}
    </div>
  )
}

function LotDetailModal({ order, part, onClose }: { order: WorkOrder, part?: PartNumber, onClose: () => void }) {
    const [logs, setLogs] = useState<SerialUnit[]>([]); // Using SerialUnit structure but filtering for Logs
    const { showAlert, showLoading, hideLoading } = useAlert();
    const [isReprinting, setIsReprinting] = useState(false);
    const [reprintQty, setReprintQty] = useState(1);

    useEffect(() => {
        // Fetch logs where SerialNumber (in Logs) == OrderNumber (for lots)
        const fetchLogs = async () => {
            // We need to fetch all serials to get logs, OR create a specific API for logs.
            // Reusing getSerials logic is inefficient but works for now if we filter by matching SN.
            // Better: use PrintLogs table directly. But client doesn't have direct access yet except via SerialUnit.
            // Workaround: Use getSerial(orderNumber) if Backend supports fetching "dummy" serial for lot.
            // Correction: The backend `getSerials` groups by SerialNumber. 
            // If we printed with SerialNumber=LotNumber, it should appear in `getSerials`.
            const unit = await db.getSerial(order.orderNumber);
            if (unit) setLogs([unit]);
        }
        fetchLogs();
    }, [order]);

    const handleReprint = async () => {
        if (!part) return;
        showLoading("Reimprimiendo...");
        try {
            await db.printLabel(order.orderNumber, part.partNumber, {
                sku: part.productCode,
                quantity: reprintQty,
                excludeLabelTypes: ['NAMEPLATE'],
                jobDescription: `Supervisor Reprint ${order.orderNumber}`
            });
            showAlert("Éxito", "Reimpresión enviada.", "success");
            setIsReprinting(false);
        } catch (e: any) {
            showAlert("Error", e.message, "error");
        } finally {
            hideLoading();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50 rounded-t-2xl">
                     <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Package className="text-blue-600"/> Detalle de Lote: {order.orderNumber}
                        </h2>
                        <div className="mt-2 text-sm text-slate-500 space-y-1">
                            <p>SAP: <strong>{order.sapOrderNumber}</strong></p>
                            <p>Modelo: <strong>{part?.productCode}</strong></p>
                            <p>Cantidad: <strong>{order.quantity}</strong></p>
                        </div>
                     </div>
                     <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-slate-200"><X size={20}/></button>
                </div>
                
                <div className="p-6 flex-1 overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-700">Historial de Impresión</h3>
                        <button onClick={() => setIsReprinting(true)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded border border-blue-100 hover:bg-blue-100 font-bold flex items-center">
                            <Printer size={12} className="mr-1"/> Re-Imprimir
                        </button>
                    </div>

                    {isReprinting && (
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-3">
                            <input 
                                type="number" 
                                className="w-24 p-2 border rounded" 
                                value={reprintQty} 
                                onChange={e => setReprintQty(Number(e.target.value))}
                                min={1}
                            />
                            <button onClick={handleReprint} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold">Confirmar</button>
                            <button onClick={() => setIsReprinting(false)} className="text-slate-500 text-sm underline ml-2">Cancelar</button>
                        </div>
                    )}

                    {logs.length === 0 || !logs[0].printHistory || logs[0].printHistory.length === 0 ? (
                        <p className="text-slate-400 text-sm italic">No hay registros de impresión disponibles.</p>
                    ) : (
                        <div className="space-y-3">
                             {logs[0].printHistory.map((log, idx) => (
                                <div key={idx} className={`p-3 rounded border text-sm flex justify-between ${log.status === 'SUCCESS' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                    <div>
                                        <span className={`font-bold text-xs px-2 py-0.5 rounded mr-2 ${log.status === 'SUCCESS' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                            {log.status}
                                        </span>
                                        <span className="text-slate-600">{log.message}</span>
                                    </div>
                                    <span className="text-slate-400 font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</span>
                                </div>
                             ))}
                        </div>
                    )}
                </div>
             </div>
        </div>
    );
}

function SerialDetailModal({ serial, part, onClose }: { serial: SerialUnit, part?: PartNumber, onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50 rounded-t-2xl">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-slate-800 font-mono tracking-tight">{serial.serialNumber}</h2>
                            {serial.isComplete ? (
                                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center border border-green-200">
                                    <CheckCircle size={12} className="mr-1"/> COMPLETADO
                                </span>
                            ) : (
                                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold border border-blue-200">EN PROCESO</span>
                            )}
                        </div>
                        <div className="text-sm text-slate-500 mt-2 space-y-1">
                            <p>Orden: <strong className="text-slate-700">{serial.orderNumber}</strong></p>
                            <p>Parte: <strong className="text-slate-700">{part?.partNumber}</strong> - {part?.description}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-slate-200 transition-colors shadow-sm"><X size={20}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* TIMELINE SECTION */}
                    <div>
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center text-lg">
                            <History className="mr-2 text-blue-500"/> Historial de Proceso
                        </h3>
                        <div className="relative border-l-2 border-slate-200 ml-3 space-y-8">
                            {(!serial.history || serial.history.length === 0) ? (
                                <p className="text-sm text-slate-400 italic">Sin historial disponible.</p>
                            ) : (
                                serial.history.map((h, idx) => (
                                    <div key={idx} className="relative pl-8">
                                        <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${idx === serial.history.length -1 ? 'bg-blue-500 border-blue-200' : 'bg-white border-slate-300'}`}></span>
                                        <div>
                                            <p className="font-bold text-slate-800 text-base">{h.operationName}</p>
                                            <p className="text-sm text-slate-500 mt-1">Operador: <span className="font-medium text-slate-700">{h.operatorName}</span></p>
                                            <p className="text-xs text-slate-400 mt-1 font-mono">{new Date(h.timestamp).toLocaleString()}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* PRINT LOGS SECTION */}
                    <div>
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center text-lg">
                            <Printer className="mr-2 text-purple-500"/> Historial de Impresión
                        </h3>
                        
                        {(!serial.printHistory || serial.printHistory.length === 0) ? (
                            <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 text-center text-slate-400 text-sm">
                                No se han registrado intentos de impresión para este serial.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {serial.printHistory.map((log, idx) => (
                                    <div key={idx} className={`p-4 rounded-lg border text-sm ${
                                        log.status === 'SUCCESS' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                                    }`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`font-bold text-xs px-2 py-0.5 rounded ${
                                                log.status === 'SUCCESS' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                                            }`}>
                                                {log.status}
                                            </span>
                                            <span className="text-xs text-slate-500 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                                        </div>
                                        <p className={`mt-2 ${log.status === 'ERROR' ? 'text-red-700 font-medium' : 'text-slate-600'}`}>
                                            {log.message}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}
