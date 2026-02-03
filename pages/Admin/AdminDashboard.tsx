// ... existing imports ...
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/storage';
import { PartNumber, Operation, User, UserRole, LabelConfig, LabelField, LabelDataSource, ProcessRoute, ProcessRouteStep } from '../../types';
import { Plus, Trash2, Edit, Save, X, Printer, FileText, List, Settings, Lock, Search, ArrowUp, ArrowDown, ChevronUp, ChevronDown, Filter, GitMerge } from 'lucide-react';
import { useAlert } from '../../context/AlertContext';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'parts' | 'users' | 'ops' | 'labels' | 'routes'>('parts');

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Administración</h1>
        <p className="text-slate-500">Configuración del sistema, números de parte y usuarios.</p>
      </div>

      <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm inline-flex mb-6 overflow-x-auto">
        <button onClick={() => setActiveTab('parts')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'parts' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Números de Parte</button>
        <button onClick={() => setActiveTab('ops')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'ops' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Operaciones</button>
        <button onClick={() => setActiveTab('routes')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${activeTab === 'routes' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
             <GitMerge size={16} className="mr-2"/> Rutas / Procesos
        </button>
        <button onClick={() => setActiveTab('users')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Usuarios</button>
        <button onClick={() => setActiveTab('labels')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${activeTab === 'labels' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Printer size={16} className="mr-2"/> Config. Etiquetas
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
        {activeTab === 'parts' && <PartsManager />}
        {activeTab === 'users' && <UsersManager />}
        {activeTab === 'ops' && <OpsManager />}
        {activeTab === 'labels' && <LabelsManager />}
        {activeTab === 'routes' && <RoutesManager />}
      </div>
    </div>
  );
}

function RoutesManager() {
    const [routes, setRoutes] = useState<ProcessRoute[]>([]);
    const [ops, setOps] = useState<Operation[]>([]);
    const [form, setForm] = useState<{name: string, desc: string, steps: {opId: string}[]}>({ name: '', desc: '', steps: [] });
    const [editingId, setEditingId] = useState<string | null>(null);
    const { showConfirm } = useAlert();

    const loadData = async () => {
        const [rData, oData] = await Promise.all([db.getRoutes(), db.getOperations()]);
        setRoutes(rData);
        setOps(oData);
    };

    useEffect(() => { loadData(); }, []);

    const handleEdit = (route: ProcessRoute) => {
        setEditingId(route.id);
        const steps = route.steps
            .sort((a,b) => a.stepOrder - b.stepOrder)
            .map(s => ({ opId: s.operationId }));
        setForm({
            name: route.name,
            desc: route.description,
            steps
        });
    }

    const handleCancel = () => {
        setEditingId(null);
        setForm({ name: '', desc: '', steps: [] });
    }

    const handleSave = async () => {
        if (!form.name || form.steps.length === 0) return alert("Nombre y al menos una operación son requeridos.");
        
        // Validate Initial Operation Exists
        const initialOpIds = ops.filter(o => o.isInitial).map(o => o.id);
        const hasInitial = form.steps.some(s => initialOpIds.includes(s.opId));
        
        if (!hasInitial) return alert("La ruta debe incluir al menos una Operación Inicial.");

        if (editingId) {
            // Update
            await db.updateRoute(editingId, {
                name: form.name,
                description: form.desc,
                steps: form.steps.map((s, idx) => ({
                    operationId: s.opId,
                    stepOrder: (idx + 1) * 10
                }))
            });
        } else {
            // Create
            await db.addRoute({
                id: `route_${Date.now()}`,
                name: form.name,
                description: form.desc,
                steps: form.steps.map((s, idx) => ({ 
                    id: '', 
                    processRouteId: '', 
                    operationId: s.opId, 
                    stepOrder: (idx + 1) * 10
                }))
            });
        }
        
        handleCancel();
        loadData();
    };

    const handleDelete = async (id: string) => {
        if (await showConfirm("Eliminar Ruta", "¿Seguro? Esto desasignará la ruta de los números de parte asociados.")) {
            await db.deleteRoute(id);
            loadData();
        }
    }

    const addStep = (opId: string) => {
        if (!opId) return;
        setForm({ ...form, steps: [...form.steps, { opId }] });
    }

    const removeStep = (idx: number) => {
        const newSteps = [...form.steps];
        newSteps.splice(idx, 1);
        setForm({ ...form, steps: newSteps });
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                <h3 className="font-bold text-lg mb-4 text-slate-800 flex justify-between">
                    {editingId ? 'Editar Ruta' : 'Crear Nueva Ruta'}
                    {editingId && <button onClick={handleCancel}><X size={16} className="text-slate-400 hover:text-red-500"/></button>}
                </h3>
                <div className="space-y-4">
                    <input className="w-full p-2 border rounded" placeholder="Nombre de Ruta" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    <input className="w-full p-2 border rounded" placeholder="Descripción" value={form.desc} onChange={e => setForm({...form, desc: e.target.value})} />
                    
                    <div className="bg-white p-4 rounded border border-slate-200">
                        <h4 className="font-bold text-xs uppercase text-slate-500 mb-2">Flujo de Operaciones</h4>
                        <div className="flex gap-2 mb-4">
                            <select className="flex-1 p-2 border rounded text-sm" id="opSelect">
                                <option value="">-- Seleccionar Operación --</option>
                                {ops.map(o => <option key={o.id} value={o.id}>{o.name} ({o.isInitial ? 'INI' : o.isFinal ? 'FIN' : 'PROC'})</option>)}
                            </select>
                            <button onClick={() => {
                                const sel = document.getElementById('opSelect') as HTMLSelectElement;
                                addStep(sel.value);
                            }} className="bg-blue-100 text-blue-700 px-3 rounded font-bold">+</button>
                        </div>
                        
                        <ul className="space-y-2">
                            {form.steps.map((s, idx) => {
                                const opName = ops.find(o => o.id === s.opId)?.name;
                                return (
                                    <li key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded text-sm border">
                                        <span className="font-mono text-slate-400 mr-2">{idx + 1}.</span>
                                        <span className="font-medium flex-1">{opName}</span>
                                        <button onClick={() => removeStep(idx)} className="text-red-500"><X size={14}/></button>
                                    </li>
                                );
                            })}
                            {form.steps.length === 0 && <li className="text-slate-400 text-xs italic text-center">Agrega operaciones aquí</li>}
                        </ul>
                    </div>

                    <button onClick={handleSave} className="w-full bg-slate-900 text-white py-2 rounded hover:bg-slate-800">
                        {editingId ? 'Actualizar Ruta' : 'Guardar Ruta'}
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="font-bold text-lg text-slate-800">Rutas Existentes</h3>
                {routes.map(r => (
                    <div key={r.id} onClick={() => handleEdit(r)} className={`border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${editingId === r.id ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50' : ''}`}>
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h4 className="font-bold text-blue-700">{r.name}</h4>
                                <p className="text-sm text-slate-500">{r.description}</p>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} className="text-slate-400 hover:text-red-600"><Trash2 size={16}/></button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                            {r.steps.map((s, idx) => (
                                <div key={s.id} className="flex items-center">
                                    <span className="text-xs bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                        {idx + 1}. {s.operationName}
                                    </span>
                                    {idx < r.steps.length - 1 && <div className="w-4 h-0.5 bg-slate-300 mx-1"></div>}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PartsManager() {
  const [parts, setParts] = useState<PartNumber[]>([]);
  const [routes, setRoutes] = useState<ProcessRoute[]>([]);
  const [form, setForm] = useState<Partial<PartNumber>>({ serialGenType: 'PCB_SERIAL' });
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof PartNumber; direction: 'asc' | 'desc' } | null>(null);

  const loadData = async () => {
    const [pData, rData] = await Promise.all([db.getParts(), db.getRoutes()]);
    setParts(pData);
    setRoutes(rData);
  };

  useEffect(() => { loadData(); }, []);

  const filteredParts = useMemo(() => {
    let result = [...parts];
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        result = result.filter(p => 
            p.partNumber.toLowerCase().includes(lowerTerm) ||
            p.productCode.toLowerCase().includes(lowerTerm) ||
            p.description.toLowerCase().includes(lowerTerm)
        );
    }
    if (sortConfig) {
        result.sort((a, b) => {
            const valA = (a[sortConfig.key] || '').toString().toLowerCase();
            const valB = (b[sortConfig.key] || '').toString().toLowerCase();
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    return result;
  }, [parts, searchTerm, sortConfig]);

  const handleSort = (key: keyof PartNumber) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof PartNumber) => {
      if (sortConfig?.key !== key) return <div className="w-4 inline-block"></div>;
      return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="inline ml-1" /> : <ChevronDown size={14} className="inline ml-1" />;
  };

  const handleEdit = (p: PartNumber) => {
    setForm(p);
    setEditingId(p.id);
  };

  const handleCancel = () => {
    setForm({ serialGenType: 'PCB_SERIAL' });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este número de parte?')) return;
    try {
      await db.deletePart(id);
      await loadData();
    } catch (e:any) {
      alert(e.message);
    }
  };

  const handleSave = async () => {
    if (!form.partNumber || !form.productCode) return;
    
    try {
      if (editingId) {
        await db.updatePart(editingId, form);
      } else {
        const newPart: PartNumber = {
          id: `pn_${Date.now()}`,
          partNumber: form.partNumber!,
          revision: form.revision || 'A',
          description: form.description || '',
          productCode: form.productCode || '',
          serialMask: form.serialMask || '',
          serialGenType: form.serialGenType || 'PCB_SERIAL',
          processRouteId: form.processRouteId
        };
        await db.addPart(newPart);
      }
      await loadData();
      handleCancel();
    } catch (e:any) {
      alert('Error al guardar: ' + e.message);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="col-span-1 bg-slate-50 p-5 rounded-xl border border-slate-100 h-fit">
          <h3 className="font-semibold mb-4 text-slate-800 flex items-center justify-between">
            {editingId ? 'Editar Parte' : 'Crear Número de Parte'}
            {editingId && <button onClick={handleCancel} className="text-xs text-slate-400 hover:text-slate-600"><X size={16}/></button>}
          </h3>
          <div className="space-y-3">
            <input className="w-full p-2 border rounded text-sm" placeholder="Número de Parte (Ej. 261004)" value={form.partNumber || ''} onChange={e => setForm({...form, partNumber: e.target.value})} />
            <input className="w-full p-2 border rounded text-sm" placeholder="Revisión (Ej. A)" value={form.revision || ''} onChange={e => setForm({...form, revision: e.target.value})} />
            <input className="w-full p-2 border rounded text-sm" placeholder="Código Producto / Modelo (SKU)" value={form.productCode || ''} onChange={e => setForm({...form, productCode: e.target.value})} />
            
            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Tipo de Serial</label>
                <select className="w-full p-2 border rounded text-sm" value={form.serialGenType || 'PCB_SERIAL'} onChange={(e: any) => setForm({...form, serialGenType: e.target.value})}>
                    <option value="PCB_SERIAL">PCB Serial (Escaneo Tablilla)</option>
                    <option value="LOT_BASED">Basado en Lote (Generado)</option>
                    <option value="ACCESSORIES">Accesorios (Solo Lote)</option>
                </select>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">Ruta / Proceso</label>
                <select className="w-full p-2 border rounded text-sm" value={form.processRouteId || ''} onChange={(e: any) => setForm({...form, processRouteId: e.target.value})}>
                    <option value="">-- Sin Ruta Asignada --</option>
                    {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">MÁSCARA (Solo PCB Serial)</label>
                <input className="w-full p-2 border rounded text-sm font-mono" placeholder="Ej. 31########" value={form.serialMask || ''} onChange={e => setForm({...form, serialMask: e.target.value})} />
            </div>

            <textarea className="w-full p-2 border rounded text-sm h-20" placeholder="Descripción" value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} />
            
            <button onClick={handleSave} className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors">
              {editingId ? <Save size={16}/> : <Plus size={16} />} {editingId ? 'Actualizar' : 'Guardar Parte'}
            </button>
          </div>
        </div>

        <div className="col-span-2">
          <div className="mb-4 relative">
             <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
             <input 
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all shadow-sm"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600 font-semibold select-none">
                <tr>
                    <th className="p-3 cursor-pointer" onClick={() => handleSort('partNumber')}>No. Parte {getSortIcon('partNumber')}</th>
                    <th className="p-3 cursor-pointer" onClick={() => handleSort('productCode')}>Modelo {getSortIcon('productCode')}</th>
                    <th className="p-3">Tipo Serial</th>
                    <th className="p-3">Ruta</th>
                    <th className="p-3 text-right">Acciones</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {filteredParts.map(p => {
                    const routeName = routes.find(r => r.id === p.processRouteId)?.name || '-';
                    return (
                    <tr key={p.id} onClick={() => handleEdit(p)} className={`hover:bg-blue-50 cursor-pointer transition-colors ${editingId === p.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}>
                    <td className="p-3 font-medium text-slate-800">{p.partNumber}</td>
                    <td className="p-3">{p.productCode}</td>
                    <td className="p-3">
                        <span className={`text-[10px] px-2 py-1 rounded font-bold ${
                            p.serialGenType === 'LOT_BASED' ? 'bg-purple-100 text-purple-700' : 
                            p.serialGenType === 'ACCESSORIES' ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-200 text-slate-600'
                        }`}>
                            {p.serialGenType === 'LOT_BASED' ? 'GENERADO' : p.serialGenType === 'ACCESSORIES' ? 'ACCESORIOS' : 'TABLILLA'}
                        </span>
                    </td>
                    <td className="p-3 text-xs text-slate-500">{routeName}</td>
                    <td className="p-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded">
                            <Trash2 size={16} />
                        </button>
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

function UsersManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<Partial<User>>({ role: UserRole.OPERATOR });
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = async () => {
    const data = await db.getUsers();
    setUsers(data);
  };

  useEffect(() => { loadData(); }, []);

  const handleEdit = (u: User) => {
    setForm({ ...u, password: '' }); 
    setEditingId(u.id);
  };

  const handleCancel = () => {
    setForm({ role: UserRole.OPERATOR, password: '' });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar usuario?')) return;
    await db.deleteUser(id);
    await loadData();
  };

  const handleSave = async () => {
    if(!form.username || !form.name) return;
    if (form.role !== UserRole.OPERATOR && !editingId && !form.password) {
        alert("Los usuarios Administrador o Supervisor requieren contraseña.");
        return;
    }
    if (editingId) {
      await db.updateUser(editingId, form);
    } else {
      await db.addUser({
        id: Date.now().toString(),
        username: form.username!,
        name: form.name!,
        role: form.role || UserRole.OPERATOR,
        password: form.password
      });
    }
    await loadData();
    handleCancel();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="col-span-1 bg-slate-50 p-5 rounded-xl border border-slate-100 h-fit">
          <h3 className="font-semibold mb-4 text-slate-800 flex justify-between">
              {editingId ? 'Editar Usuario' : 'Agregar Usuario'}
              {editingId && <button onClick={handleCancel}><X size={16} className="text-slate-400"/></button>}
          </h3>
          <div className="space-y-3">
            <input className="w-full p-2 border rounded text-sm" placeholder="Usuario (Login)" value={form.username || ''} onChange={e => setForm({...form, username: e.target.value})} />
            <input className="w-full p-2 border rounded text-sm" placeholder="Nombre Completo" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
            <select className="w-full p-2 border rounded text-sm" value={form.role} onChange={(e:any) => setForm({...form, role: e.target.value})}>
              {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {(form.role === UserRole.ADMIN || form.role === UserRole.SUPERVISOR) && (
                 <div className="relative">
                     <Lock size={12} className="absolute top-3 left-3 text-slate-400"/>
                     <input type="password" className="w-full p-2 pl-8 border rounded text-sm border-blue-200 bg-blue-50" placeholder={editingId ? "Resetear Contraseña" : "Contraseña"} value={form.password || ''} onChange={e => setForm({...form, password: e.target.value})} />
                 </div>
            )}
            <button onClick={handleSave} className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 flex items-center justify-center gap-2">
               {editingId ? <Save size={16}/> : <Plus size={16} />} {editingId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
      </div>
      <div className="col-span-2">
        <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 font-semibold">
              <tr><th className="p-3">Usuario</th><th className="p-3">Nombre</th><th className="p-3">Rol</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} onClick={() => handleEdit(u)} className={`border-b border-slate-100 cursor-pointer hover:bg-blue-50 ${editingId === u.id ? 'bg-blue-50' : ''}`}>
                  <td className="p-3 font-mono">{u.username}</td><td className="p-3">{u.name}</td>
                  <td className="p-3"><span className="px-2 py-1 bg-slate-200 rounded-full text-xs font-semibold text-slate-700">{u.role}</span></td>
                  <td className="p-3"><button onClick={(e) => { e.stopPropagation(); handleDelete(u.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </div>
  )
}

function OpsManager() {
  const [ops, setOps] = useState<Operation[]>([]);
  const [form, setForm] = useState<Partial<Operation>>({ isInitial: false, isFinal: false, requireTestLog: false });
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = async () => { const data = await db.getOperations(); setOps(data); };
  useEffect(() => { loadData(); }, []);

  const handleEdit = (o: Operation) => { setForm(o); setEditingId(o.id); };
  const handleCancel = () => { setForm({ isInitial: false, isFinal: false, requireTestLog: false }); setEditingId(null); };
  const handleDelete = async (id: string) => { if(!confirm('¿Eliminar?')) return; await db.deleteOperation(id); await loadData(); }
  const handleSave = async () => {
    if(!form.name) return;
    if (editingId) await db.updateOperation(editingId, form);
    else await db.addOperation({ id: `op_${Date.now()}`, name: form.name!, orderIndex: Number(form.orderIndex), isInitial: !!form.isInitial, isFinal: !!form.isFinal, requireTestLog: !!form.requireTestLog });
    await loadData(); handleCancel();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
       <div className="col-span-1 bg-slate-50 p-5 rounded-xl border border-slate-100 h-fit">
          <h3 className="font-semibold mb-4 text-slate-800 flex justify-between">{editingId ? 'Editar' : 'Agregar'} {editingId && <button onClick={handleCancel}><X size={16}/></button>}</h3>
          <div className="space-y-3">
            <input className="w-full p-2 border rounded text-sm" placeholder="Nombre" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
            <input type="number" className="w-full p-2 border rounded text-sm" placeholder="Índice" value={form.orderIndex || ''} onChange={e => setForm({...form, orderIndex: Number(e.target.value)})} />
            <label className="flex items-center space-x-2 text-sm"><input type="checkbox" checked={form.isInitial} onChange={e => setForm({...form, isInitial: e.target.checked})} /> Operación Inicial</label>
            <label className="flex items-center space-x-2 text-sm"><input type="checkbox" checked={form.isFinal} onChange={e => setForm({...form, isFinal: e.target.checked})} /> Operación Final</label>
            <label className="flex items-center space-x-2 text-sm"><input type="checkbox" checked={form.requireTestLog} onChange={e => setForm({...form, requireTestLog: e.target.checked})} /> Validar si unidades fueron probadas previo a iniciar</label>
            <button onClick={handleSave} className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 flex items-center justify-center gap-2"><Save size={16}/> Guardar</button>
          </div>
      </div>
      <div className="col-span-2">
         <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 font-semibold"><tr><th className="p-3">Seq</th><th className="p-3">Nombre</th><th className="p-3">Tipo</th><th className="p-3"></th></tr></thead>
            <tbody>
              {ops.map(o => (
                <tr key={o.id} onClick={() => handleEdit(o)} className={`border-b border-slate-100 cursor-pointer hover:bg-blue-50 ${editingId === o.id ? 'bg-blue-50' : ''}`}>
                  <td className="p-3 font-bold text-slate-400">{o.orderIndex}</td><td className="p-3">{o.name}</td>
                  <td className="p-3 text-xs space-x-1">{o.isInitial && <span className="bg-green-100 text-green-800 px-2 py-1 rounded">Ini</span>}{o.isFinal && <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">Fin</span>}</td>
                  <td className="p-3"><button onClick={(e) => { e.stopPropagation(); handleDelete(o.id); }} className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </div>
  )
}

function LabelsManager() {
    const [configs, setConfigs] = useState<LabelConfig[]>([]);
    const [parts, setParts] = useState<PartNumber[]>([]); 
    const [form, setForm] = useState<Partial<LabelConfig>>({ defaultQuantity: 1, labelType: 'CARTON1' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { showAlert, showConfirm, showLoading, hideLoading } = useAlert();
    const [managingFieldsConfig, setManagingFieldsConfig] = useState<LabelConfig | null>(null);

    const loadData = async () => {
        const [configsData, partsData] = await Promise.all([db.getLabelConfigs(), db.getParts()]);
        setConfigs(configsData); setParts(partsData);
    };
    useEffect(() => { loadData(); }, []);

    const uniqueModels = Array.from(new Set(parts.map(p => p.productCode).filter(Boolean))).sort();
    const filteredConfigs = useMemo(() => {
        return configs.filter(c => {
            if (form.sku && c.sku !== form.sku) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return (c.labelName.toLowerCase().includes(term) || c.printerName.toLowerCase().includes(term) || c.sku.toLowerCase().includes(term));
            }
            return true;
        });
    }, [configs, form.sku, searchTerm]);

    const handleSave = async () => {
        if (!form.sku || !form.labelName) return;
        showLoading();
        try {
            await db.saveLabelConfig({ id: editingId || '', sku: form.sku, labelName: form.labelName, formatPath: form.formatPath || '', printerName: form.printerName || '', defaultQuantity: form.defaultQuantity || 1, labelType: form.labelType || 'CARTON1' });
            await loadData(); handleCancel();
        } catch (e: any) { showAlert("Error", e.message, "error"); } finally { hideLoading(); }
    };

    const handleEdit = (c: LabelConfig) => { setForm(c); setEditingId(c.id); };
    const handleDelete = async (id: string) => { if (await showConfirm("Eliminar", "¿Seguro?")) { await db.deleteLabelConfig(id); await loadData(); } };
    const handleCancel = () => { setForm({ defaultQuantity: 1, labelType: 'CARTON1' }); setEditingId(null); };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-1 bg-slate-50 p-5 rounded-xl border border-slate-100 h-fit">
                <h3 className="font-semibold mb-4 text-slate-800 flex justify-between">{editingId ? 'Editar' : 'Nueva'} {editingId && <button onClick={handleCancel}><X size={16}/></button>}</h3>
                <div className="space-y-4">
                    <select className="w-full p-2 border rounded text-sm font-mono" value={form.sku || ''} onChange={e => setForm({ ...form, sku: e.target.value })}>
                        <option value="">-- Modelo --</option>
                        {uniqueModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="w-full p-2 border rounded text-sm" value={form.labelType || 'CARTON1'} onChange={(e: any) => setForm({ ...form, labelType: e.target.value })}>
                        <option value="CARTON1">CARTON1</option> <option value="CARTON2">CARTON2</option> <option value="NAMEPLATE">NAMEPLATE</option>
                    </select>
                    <input className="w-full p-2 border rounded text-sm" placeholder="Nombre Etiqueta" value={form.labelName || ''} onChange={e => setForm({ ...form, labelName: e.target.value })} />
                    <input className="w-full p-2 border rounded text-sm font-mono" placeholder="Path" value={form.formatPath || ''} onChange={e => setForm({ ...form, formatPath: e.target.value })} />
                    <input className="w-full p-2 border rounded text-sm" placeholder="Impresora" value={form.printerName || ''} onChange={e => setForm({ ...form, printerName: e.target.value })} />
                    <button onClick={handleSave} className="w-full bg-slate-800 text-white p-2 rounded hover:bg-slate-900 flex items-center justify-center gap-2"><Save size={16} /> Guardar</button>
                </div>
            </div>
            <div className="col-span-2">
                <div className="mb-4 relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={18} /><input className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/></div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600 font-semibold"><tr><th className="p-3">SKU</th><th className="p-3">Tipo</th><th className="p-3">Etiqueta</th><th className="p-3">Campos</th><th className="p-3"></th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredConfigs.map(c => (
                                <tr key={c.id} onClick={() => handleEdit(c)} className={`hover:bg-blue-50 cursor-pointer ${editingId === c.id ? 'bg-blue-50' : ''}`}>
                                    <td className="p-3 font-bold">{c.sku}</td><td className="p-3 text-xs">{c.labelType}</td><td className="p-3">{c.labelName}</td>
                                    <td className="p-3 text-center"><button onClick={(e) => { e.stopPropagation(); setManagingFieldsConfig(c); }} className="text-xs text-blue-600 border px-2 rounded"><Settings size={12}/> Config</button></td>
                                    <td className="p-3 text-right"><button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}><Trash2 size={16} className="text-slate-400 hover:text-red-600"/></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {managingFieldsConfig && <LabelFieldsModal config={managingFieldsConfig} onClose={() => setManagingFieldsConfig(null)} />}
        </div>
    );
}

function LabelFieldsModal({ config, onClose }: { config: LabelConfig, onClose: () => void }) {
    const [fields, setFields] = useState<LabelField[]>([]);
    const [newField, setNewField] = useState<Partial<LabelField>>({ dataSource: 'SERIAL' });
    const { showAlert } = useAlert();
    const loadFields = async () => { const data = await db.getLabelFields(config.id); setFields(data); };
    useEffect(() => { loadFields(); }, []);
    const handleAddField = async () => {
        if (!newField.fieldName) return;
        await db.addLabelField({ labelConfigId: config.id, fieldName: newField.fieldName, dataSource: newField.dataSource || 'SERIAL', staticValue: newField.staticValue });
        await loadFields(); setNewField({ dataSource: 'SERIAL', fieldName: '' });
    };
    const handleDeleteField = async (id: number) => { await db.deleteLabelField(id); await loadFields(); };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                    <h3 className="text-xl font-bold">Campos de Etiqueta: {config.labelName}</h3><button onClick={onClose}><X size={24}/></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    <div className="bg-blue-50 p-4 rounded-lg mb-6 flex gap-3 items-end">
                        <div className="flex-1"><input className="w-full p-2 border rounded text-sm" placeholder="Campo EasyLabel" value={newField.fieldName || ''} onChange={e => setNewField({...newField, fieldName: e.target.value})} /></div>
                        <div className="w-1/3"><select className="w-full p-2 border rounded text-sm" value={newField.dataSource} onChange={(e: any) => setNewField({...newField, dataSource: e.target.value})}><option value="SERIAL">SERIAL</option><option value="PART">PART</option><option value="SKU">SKU</option><option value="STATIC">STATIC</option></select></div>
                        {newField.dataSource === 'STATIC' && <div className="flex-1"><input className="w-full p-2 border rounded text-sm" placeholder="Valor" value={newField.staticValue || ''} onChange={e => setNewField({...newField, staticValue: e.target.value})} /></div>}
                        <button onClick={handleAddField} className="bg-blue-600 text-white p-2 rounded"><Plus size={20} /></button>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100"><tr><th className="p-3">Campo</th><th className="p-3">Fuente</th><th className="p-3">Valor</th><th className="p-3"></th></tr></thead>
                        <tbody>{fields.map(f => (<tr key={f.id}><td className="p-3 font-bold">{f.fieldName}</td><td className="p-3">{f.dataSource}</td><td className="p-3">{f.staticValue}</td><td className="p-3"><button onClick={() => handleDeleteField(f.id)}><Trash2 size={16}/></button></td></tr>))}</tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
