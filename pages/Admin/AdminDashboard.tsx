import React, { useState, useEffect, useMemo } from 'react';
import { db, dbSystem } from '../../services/storage';
import { PartNumber, Operation, User, UserRole, LabelConfig, LabelField, LabelDataSource, ProcessRoute, ProcessRouteStep } from '../../types';
import { Plus, Trash2, Edit, Save, X, Printer, FileText, List, Settings, Lock, Search, ArrowUp, ArrowDown, ChevronUp, ChevronDown, GitMerge,Filter, Download, Upload, Database, AlertCircle, CheckCircle2, Image as ImageIcon, Camera, Loader2 } from 'lucide-react';
import { useAlert } from '../../context/AlertContext';

// Helper para comprimir imágenes antes de guardar (evita cadenas base64 gigantes que se truncan en DB)
const resizeAndCompressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // Convertir a JPEG calidad 0.7 para reducir drásticamente el tamaño del string
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Helper para validar si una imagen base64 parece válida
const isValidBase64Image = (base64String: string | undefined): boolean => {
    if (!base64String) return false;
    // Debe empezar con data:image
    if (!base64String.startsWith('data:image')) return false;
    // Una validación muy básica de longitud, una imagen real comprimida suele ser mayor a 100 caracteres
    if (base64String.length < 100) return false;
    return true;
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'parts' | 'users' | 'ops' | 'labels' | 'migration' |'routes'>('parts');

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
        <button onClick={() => setActiveTab('migration')} className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'migration' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Migracion</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
        {activeTab === 'parts' && <PartsManager />}
        {activeTab === 'users' && <UsersManager />}
        {activeTab === 'ops' && <OpsManager />}
        {activeTab === 'labels' && <LabelsManager />}
        {activeTab === 'routes' && <RoutesManager />}
        {activeTab === 'migration' && <DataMigrationManager />}
      </div>
    </div>
  );
}

// Fixed missing manager components to resolve compilation errors

function PartsManager() {
  const [parts, setParts] = useState<PartNumber[]>([]);
  const [routes, setRoutes] = useState<ProcessRoute[]>([]);
  const [form, setForm] = useState<Partial<PartNumber>>({ serialGenType: 'PCB_SERIAL', StdBoxQty: 1, picture: undefined });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof PartNumber; direction: 'asc' | 'desc' } | null>({ key: 'partNumber', direction: 'asc' });

  const { showLoading, hideLoading, showAlert } = useAlert();

  const loadData = async () => {
    try {
      const [pData, rData] = await Promise.all([db.getParts(), db.getRoutes()]);
      setParts(pData);
      setRoutes(rData);
    } catch (e: any) {
      console.error("Error loading parts:", e);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filteredParts = useMemo(() => {
    let result = [...parts];
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        result = result.filter(p => 
            p.partNumber.toLowerCase().includes(lowerTerm) ||
            p.productCode.toLowerCase().includes(lowerTerm) ||
            p.description?.toLowerCase().includes(lowerTerm)
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
    setForm({ ...p });
    setEditingId(p.id);
  };

  const handleCancel = () => {
    setForm({ serialGenType: 'PCB_SERIAL', StdBoxQty: 1, picture: undefined });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este número de parte?')) return;
    try {
      showLoading("Eliminando...");
      await db.deletePart(id);
      await loadData();
    } catch (e:any) {
      showAlert("Error", e.message, "error");
    } finally {
      hideLoading();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validación de tamaño antes de procesar (5MB)
    if (file.size > 5 * 1024 * 1024) {
        showAlert("Error", "La imagen es demasiado grande. El máximo permitido es 5MB.", "error");
        return;
    }

    try {
      showLoading("Procesando imagen...");
      const compressed = await resizeAndCompressImage(file);
      setForm(prev => ({ ...prev, picture: compressed }));
    } catch (error) {
      console.error("Error processing image:", error);
      showAlert("Error", "Error al procesar la imagen.", "error");
    } finally {
      hideLoading();
    }
  };

  const handleSave = async () => {
    if (!form.partNumber || !form.productCode) {
        showAlert("Campos Requeridos", "Debe ingresar el Número de Parte y el Modelo (SKU).", "warning");
        return;
    }
    
    setIsSaving(true);
    showLoading(editingId ? "Actualizando..." : "Guardando...");
    
    try {
      if (editingId) {
        await db.updatePart(editingId, form);
      } else {
        const newPart: any = {
          id: `pn_${Date.now()}`,
          ...form
        };
        await db.addPart(newPart);
      }
      await loadData();
      handleCancel();
      showAlert("Éxito", "Parte guardada correctamente.", "success");
    } catch (e:any) {
      showAlert("Error al guardar", e.message, "error");
    } finally {
      setIsSaving(false);
      hideLoading();
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="col-span-1 bg-slate-50 p-5 rounded-xl border border-slate-100 h-fit">
          <h3 className="font-semibold mb-4 text-slate-800 flex items-center justify-between">
            {editingId ? 'Editar Parte' : 'Crear Número de Parte'}
            {editingId && <button onClick={handleCancel} className="text-xs text-slate-400 hover:text-slate-600" title="Cancelar edición"><X size={16} aria-label="Cancelar"/></button>}
          </h3>
          <div className="space-y-3">
            {/* Picture Upload Area */}
            <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-xl bg-white group cursor-pointer hover:border-blue-400 transition-colors relative overflow-hidden h-40">
              {form.picture && isValidBase64Image(form.picture) ? (
                <>
                  <img src={form.picture} alt="Preview" className="h-full w-full object-contain" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                     <label className="bg-white text-slate-900 p-2 rounded-full cursor-pointer hover:bg-blue-50">
                        <Camera size={18} />
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                     </label>
                     <button onClick={(e) => { e.stopPropagation(); setForm(prev => ({...prev, picture: undefined})); }} className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600">
                        <Trash2 size={18} />
                     </button>
                  </div>
                </>
              ) : (
                <label className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                  {form.picture ? (
                     <div className="text-center">
                        <AlertCircle className="text-red-400 mb-1 mx-auto" size={28} />
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest text-center px-4 block">Imagen Corrupta</span>
                        <span className="text-[9px] text-slate-400 block mt-1">Haz clic para reemplazar</span>
                     </div>
                  ) : (
                     <>
                        <Camera className="text-slate-400 mb-1" size={28} />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center px-4">Haz clic para cargar imagen del producto</span>
                     </>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              )}
            </div>

            <input className="w-full p-2 border rounded text-sm bg-white font-bold" placeholder="Número de Parte" value={form.partNumber || ''} onChange={e => setForm({...form, partNumber: e.target.value})} />
            <input className="w-full p-2 border rounded text-sm bg-white" placeholder="Revisión" value={form.revision || ''} onChange={e => setForm({...form, revision: e.target.value})} />
            <input className="w-full p-2 border rounded text-sm bg-white" placeholder="Código Producto / Modelo (SKU)" value={form.productCode || ''} onChange={e => setForm({...form, productCode: e.target.value})} />
            
            <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tipo de Serial</label>
                <select className="w-full p-2 border rounded text-sm bg-white" value={form.serialGenType || 'PCB_SERIAL'} onChange={(e: any) => setForm({...form, serialGenType: e.target.value})}>
                    <option value="PCB_SERIAL">PCB Serial (Escaneo Tablilla)</option>
                    <option value="LOT_BASED">Basado en Lote (Generado)</option>
                    <option value="ACCESSORIES">Accesorios (Solo Lote)</option>
                </select>
            </div>
            
            <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ruta / Proceso</label>
                <select className="w-full p-2 border rounded text-sm bg-white" value={form.processRouteId || ''} onChange={(e: any) => setForm({...form, processRouteId: e.target.value})}>
                    <option value="">-- Sin Ruta Asignada --</option>
                    {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
            </div>
            
            <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">MÁSCARA (Tablilla)</label>
                <input className="w-full p-2 border rounded text-sm font-mono bg-white" placeholder="Ej. 31########" value={form.serialMask || ''} onChange={e => setForm({...form, serialMask: e.target.value})} />
            </div>
            
            <textarea className="w-full p-2 border rounded text-sm h-20 bg-white" placeholder="Descripción" value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} />
            
            <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cant. por Caja</label>
                <input type="number" className="w-full p-2 border rounded text-sm bg-white font-mono font-bold" placeholder="1" value={form.StdBoxQty || ''} onChange={e => setForm({ ...form, StdBoxQty: Number(e.target.value) })} />
            </div>
          </div>
          <button onClick={handleSave} disabled={isSaving} className="w-full bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 transition-all mt-4 font-bold shadow-lg disabled:opacity-50">
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : (editingId ? <Save size={18}/> : <Plus size={18} />)} 
            {editingId ? 'Actualizar Registro' : 'Crear Número Parte'}
          </button>
        </div>

        <div className="col-span-2">
          <div className="mb-4 relative">
             <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
             <input 
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all shadow-sm bg-white"
                placeholder="Buscar por modelo, no. parte o descripción..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-widest select-none">
                <tr>
                    <th className="p-4 cursor-pointer" onClick={() => handleSort('partNumber')}>No. Parte {getSortIcon('partNumber')}</th>
                    <th className="p-4 cursor-pointer" onClick={() => handleSort('productCode')}>Modelo {getSortIcon('productCode')}</th>
                    <th className="p-4">Tipo Serial</th>
                    <th className="p-4">Cant. Caja</th>
                    <th className="p-4">Ruta</th>
                    <th className="p-4 text-right">Acciones</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {filteredParts.map(p => {
                    const routeName = routes.find(r => r.id === p.processRouteId)?.name || '-';
                    return (
                    <tr key={p.id} onClick={() => handleEdit(p)} className={`hover:bg-blue-50/50 cursor-pointer transition-colors ${editingId === p.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}>
                    <td className="p-4 font-bold text-slate-800">{p.partNumber}</td>
                    <td className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {p.picture && isValidBase64Image(p.picture) ? (
                                    <img src={p.picture} className="w-full h-full object-contain" alt={p.productCode} />
                                ) : (
                                    <ImageIcon size={16} className={`text-slate-300 ${p.picture ? 'text-red-300' : ''}`} />
                                )}
                            </div>
                            <span className="font-bold text-slate-700">{p.productCode}</span>
                        </div>
                    </td>
                    <td className="p-4">
                        <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-tighter ${
                            p.serialGenType === 'LOT_BASED' ? 'bg-purple-100 text-purple-700' : 
                            p.serialGenType === 'ACCESSORIES' ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-200 text-slate-600'
                        }`}>
                            {p.serialGenType === 'LOT_BASED' ? 'GENERADO' : p.serialGenType === 'ACCESSORIES' ? 'ACCESORIOS' : 'TABLILLA'}
                        </span>
                    </td>
                    <td className="p-4 font-mono font-bold text-blue-600 text-center">{p.StdBoxQty || 1}</td>
                    <td className="p-4 text-[11px] text-slate-500 font-bold uppercase">{routeName}</td>
                    <td className="p-4 text-right">
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="p-2 text-slate-300 hover:text-red-600 transition-colors" title="Eliminar">
                            <Trash2 size={16} />
                        </button>
                    </td>
                    </tr>
                    );
                })}
                {filteredParts.length === 0 && (
                    <tr>
                        <td colSpan={6} className="p-10 text-center text-slate-400 italic">No se encontraron registros.</td>
                    </tr>
                )}
                </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Manager component implementations

function UsersManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<Partial<User>>({ role: UserRole.OPERATOR });
  const [editingId, setEditingId] = useState<string | null>(null);
  const { showLoading, hideLoading, showAlert } = useAlert();

  const loadData = async () => {
    try {
      const data = await db.getUsers();
      setUsers(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async () => {
    if (!form.username || !form.name) return;
    showLoading("Guardando...");
    try {
      if (editingId) await db.updateUser(editingId, form);
      else await db.addUser({ id: `u_${Date.now()}`, ...form } as User);
      setForm({ role: UserRole.OPERATOR });
      setEditingId(null);
      await loadData();
    } catch (e: any) { showAlert("Error", e.message, "error"); }
    finally { hideLoading(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar usuario?")) return;
    await db.deleteUser(id);
    await loadData();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-slate-50 p-6 rounded-xl border">
        <h3 className="font-bold mb-4">{editingId ? 'Editar' : 'Nuevo'} Usuario</h3>
        <div className="space-y-4">
          <input className="w-full p-2 border rounded" placeholder="Username" value={form.username || ''} onChange={e => setForm({...form, username: e.target.value})} />
          <input className="w-full p-2 border rounded" placeholder="Nombre Completo" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
          <input className="w-full p-2 border rounded" placeholder="Contraseña (Admin/Super)" type="password" value={form.password || ''} onChange={e => setForm({...form, password: e.target.value})} />
          <select className="w-full p-2 border rounded" value={form.role} onChange={e => setForm({...form, role: e.target.value as UserRole})}>
            <option value={UserRole.ADMIN}>Administrador</option>
            <option value={UserRole.SUPERVISOR}>Supervisor</option>
            <option value={UserRole.OPERATOR}>Operador</option>
          </select>
          <button onClick={handleSave} className="w-full bg-slate-900 text-white p-2 rounded">Guardar</button>
        </div>
      </div>
      <div className="col-span-2 border rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
            <tr><th className="p-4">Usuario</th><th className="p-4">Nombre</th><th className="p-4">Rol</th><th className="p-4"></th></tr>
          </thead>
          <tbody className="divide-y">
            {users.map(u => (
              <tr key={u.id}>
                <td className="p-4 font-bold">{u.username}</td>
                <td className="p-4">{u.name}</td>
                <td className="p-4">{u.role}</td>
                <td className="p-4 text-right">
                  <button onClick={() => {setForm(u); setEditingId(u.id)}} className="mr-2 text-blue-600"><Edit size={16}/></button>
                  <button onClick={() => handleDelete(u.id)} className="text-red-600"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpsManager() {
  const [ops, setOps] = useState<Operation[]>([]);
  const [form, setForm] = useState<Partial<Operation>>({ orderIndex: 10, isInitial: false, isFinal: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const { showLoading, hideLoading, showAlert } = useAlert();

  const load = async () => setOps(await db.getOperations());
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name) return;
    try {
      if (editingId) await db.updateOperation(editingId, form);
      else await db.addOperation({ id: `op_${Date.now()}`, ...form } as Operation);
      setForm({ orderIndex: 10 }); setEditingId(null); await load();
    } catch (e: any) { showAlert("Error", e.message, "error"); }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-slate-50 p-5 rounded-xl border">
        <h3 className="font-bold mb-4">Operación</h3>
        <input className="w-full p-2 border rounded mb-3" placeholder="Nombre" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
        <input type="number" className="w-full p-2 border rounded mb-3" placeholder="Orden" value={form.orderIndex || ''} onChange={e => setForm({...form, orderIndex: Number(e.target.value)})} />
        <div className="flex gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isInitial} onChange={e => setForm({...form, isInitial: e.target.checked})} /> Inicial</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFinal} onChange={e => setForm({...form, isFinal: e.target.checked})} /> Final</label>
        </div>
        <button onClick={handleSave} className="w-full bg-slate-900 text-white p-2 rounded">Guardar</button>
      </div>
      <div className="col-span-2 border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50"><tr><th className="p-4">Nombre</th><th className="p-4">Orden</th><th className="p-4">Flags</th><th className="p-4"></th></tr></thead>
          <tbody className="divide-y">
            {ops.sort((a,b) => a.orderIndex - b.orderIndex).map(o => (
              <tr key={o.id}>
                <td className="p-4 font-bold">{o.name}</td>
                <td className="p-4">{o.orderIndex}</td>
                <td className="p-4 text-xs">
                  {o.isInitial && <span className="bg-green-100 px-2 rounded mr-1">INIT</span>}
                  {o.isFinal && <span className="bg-purple-100 px-2 rounded">FINAL</span>}
                </td>
                <td className="p-4 text-right">
                  <button onClick={() => {setForm(o); setEditingId(o.id)}} className="text-blue-600 mr-2"><Edit size={16}/></button>
                  <button onClick={() => db.deleteOperation(o.id).then(load)} className="text-red-600"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoutesManager() {
  const [routes, setRoutes] = useState<ProcessRoute[]>([]);
  const [ops, setOps] = useState<Operation[]>([]);
  const [form, setForm] = useState<Partial<ProcessRoute>>({ name: '', description: '', steps: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const { showAlert } = useAlert();

  const load = async () => {
    setRoutes(await db.getRoutes());
    setOps(await db.getOperations());
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name) return;
    const safeSteps = form.steps ?? [];
    const safeName = form.name ?? '';
    const safeDescription = form.description ?? '';
    try {
      if (editingId) {
        await db.updateRoute(editingId, { ...form, name: safeName, steps: safeSteps });
      } else {
        await db.addRoute({ id: `route_${Date.now()}`, name: safeName, description: safeDescription, steps: safeSteps });
      }
      setForm({ name: '', description: '', steps: [] }); setEditingId(null); await load();
    } catch (e: any) { showAlert("Error", e.message, "error"); }
  };

  const addStep = (opId: string) => {
    const newStep = { id: `step_${Date.now()}`, operationId: opId, stepOrder: (form.steps?.length || 0) + 1 };
    setForm({ ...form, steps: [...(form.steps || []), newStep as any] });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div className="bg-slate-50 p-6 rounded-xl border">
        <h3 className="font-bold mb-4">Ruta de Proceso</h3>
        <input className="w-full p-2 border rounded mb-3" placeholder="Nombre de Ruta" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
        <textarea className="w-full p-2 border rounded mb-4" placeholder="Descripción" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
        
        <div className="mb-4">
          <p className="text-xs font-bold text-slate-400 uppercase mb-2">Pasos de la Ruta</p>
          <div className="space-y-2 mb-4">
            {form.steps?.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-white rounded border">
                <span className="text-sm font-bold">{i+1}. {ops.find(o => o.id === s.operationId)?.name}</span>
                <button onClick={() => setForm({...form, steps: form.steps?.filter((_, idx) => idx !== i)})} className="text-red-500"><X size={14}/></button>
              </div>
            ))}
          </div>
          <select className="w-full p-2 border rounded text-sm" onChange={e => { if(e.target.value) addStep(e.target.value); e.target.value = ''; }}>
            <option value="">+ Agregar Operación...</option>
            {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <button onClick={handleSave} className="w-full bg-slate-900 text-white p-3 rounded-lg">Guardar Ruta</button>
      </div>

      <div className="space-y-4">
        {routes.map(r => (
          <div key={r.id} className="p-4 border rounded-xl hover:bg-slate-50 cursor-pointer" onClick={() => {setForm(r); setEditingId(r.id)}}>
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold text-slate-800">{r.name}</h4>
                <p className="text-xs text-slate-500">{r.description}</p>
              </div>
              <button onClick={(e) => {e.stopPropagation(); db.deleteRoute(r.id).then(load)}} className="text-slate-300 hover:text-red-600"><Trash2 size={16}/></button>
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              {r.steps.sort((a,b) => a.stepOrder - b.stepOrder).map((s, i) => (
                <span key={i} className="text-[9px] bg-slate-100 px-2 py-0.5 rounded font-bold">{ops.find(o => o.id === s.operationId)?.name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
                <h3 className="font-semibold mb-4 text-slate-800 flex items-center justify-between">{editingId ? 'Editar' : 'Nueva'} {editingId && <button onClick={handleCancel}><X size={16}/></button>}</h3>
                <div className="space-y-4">
                    <select className="w-full p-2 border rounded text-sm font-mono" value={form.sku || ''} onChange={e => setForm({ ...form, sku: e.target.value })}>
                        <option value="">-- Modelo --</option>
                        {uniqueModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="w-full p-2 border rounded text-sm" value={form.labelType || 'CARTON1'} onChange={(e: any) => setForm({ ...form, labelType: e.target.value })}>
                        <option value="CARTON1">CARTON1</option> <option value="CARTON2">CARTON2</option> <option value="NAMEPLATE">NAMEPLATE</option><option value="BOX_LABEL">BOX_LABEL</option>
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
                                    <td className="p-3 text-right">
                                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} title="Eliminar configuración de etiqueta" aria-label="Eliminar configuración de etiqueta">
                                        <Trash2 size={16} className="text-slate-400 hover:text-red-600" />
                                      </button>
                                    </td>
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

function DataMigrationManager() {
  const { showLoading, hideLoading, showAlert } = useAlert();
  const [importFileContent, setImportFileContent] = useState<any>(null);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [selectedImportTables, setSelectedImportTables] = useState<string[]>([]);
  const [selectedExportTables, setSelectedExportTables] = useState<string[]>([]);

  const SYSTEM_TABLES = [
    'Users', 'Operations', 'ProcessRoutes', 'ProcessRouteSteps', 
    'PartNumbers', 'WorkOrders', 'Serials', 'SerialHistory', 
    'PrintLogs', 'LabelConfigs', 'LabelFields', 'test_logs', 'GoldenSerials'
  ];

  useEffect(() => {
    setSelectedExportTables(SYSTEM_TABLES);
  }, []);

  const handleExport = async () => {
    if (selectedExportTables.length === 0) {
      return showAlert("Aviso", "Seleccione al menos una tabla para exportar.", "warning");
    }
    try {
      showLoading("Generando respaldo...");
      const data = await dbSystem.exportData(selectedExportTables);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mes_backup_${selectedExportTables.length === SYSTEM_TABLES.length ? 'full' : 'partial'}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
    } catch (e: any) { 
      showAlert("Error", e.message, "error"); 
    } finally {
      hideLoading();
    }
  };

  const handleFileChange = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setImportFileContent(json);
      
      // Detectar tablas en el JSON
      const actualData = (json.data && typeof json.data === 'object' && !Array.isArray(json.data)) ? json.data : json;
      const tablesInFile = Object.keys(actualData).filter(key => 
        SYSTEM_TABLES.some(t => t.toLowerCase() === key.toLowerCase())
      );
      
      // Mapear a los nombres oficiales de SYSTEM_TABLES
      const mappedTables = tablesInFile.map(key => 
        SYSTEM_TABLES.find(t => t.toLowerCase() === key.toLowerCase()) || key
      );

      setAvailableTables(mappedTables);
      setSelectedImportTables(mappedTables);
    } catch (e: any) {
      showAlert("Error", "El archivo no es un JSON válido o está corrupto.", "error");
      setImportFileContent(null);
      setAvailableTables([]);
    }
  };

  const [importProgress, setImportProgress] = useState<{ current: number, total: number, table: string } | null>(null);

  const handleImport = async () => {
    if (!importFileContent || selectedImportTables.length === 0) return;
    
    try {
      showLoading("Iniciando importación por lotes...");
      
      // 1. Preparar el servidor (limpiar tablas y desactivar constraints)
      await dbSystem.prepareImport(selectedImportTables);
      
      const actualData = (importFileContent.data && typeof importFileContent.data === 'object' && !Array.isArray(importFileContent.data)) 
        ? importFileContent.data 
        : importFileContent;

      // Calcular total de filas para el progreso
      let totalRows = 0;
      selectedImportTables.forEach(table => {
        const sourceKey = Object.keys(actualData).find(k => k.toLowerCase() === table.toLowerCase());
        if (sourceKey) totalRows += actualData[sourceKey].length;
      });

      let processedRows = 0;
      const CHUNK_SIZE = 100;

      // 2. Procesar cada tabla por lotes
      for (const table of selectedImportTables) {
        const sourceKey = Object.keys(actualData).find(k => k.toLowerCase() === table.toLowerCase());
        if (!sourceKey) continue;
        
        const rows = actualData[sourceKey];
        
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          setImportProgress({ 
            current: processedRows, 
            total: totalRows, 
            table: table 
          });
          
          await dbSystem.importChunk(table, chunk);
          processedRows += chunk.length;
        }
      }

      // 3. Finalizar (reactivar constraints)
      setImportProgress({ current: totalRows, total: totalRows, table: "Finalizando..." });
      await dbSystem.finalizeImport();
      
      showAlert("Éxito", `Importación completada: ${totalRows} registros procesados en ${selectedImportTables.length} tablas.`, "success");
      setImportFileContent(null);
      setAvailableTables([]);
    } catch (e: any) { 
      showAlert("Error Crítico", e.message, "error"); 
      // Intentar reactivar constraints aunque falle
      try { await dbSystem.finalizeImport(); } catch(err) { console.error(err); }
    } finally { 
      hideLoading(); 
      setImportProgress(null);
    }
  };

  const toggleTable = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, table: string) => {
    if (list.includes(table)) {
      setList(list.filter(t => t !== table));
    } else {
      setList([...list, table]);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* EXPORT SECTION */}
      <div className="p-6 border rounded-2xl bg-white shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <Download size={24}/>
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Exportar Datos</h3>
            <p className="text-xs text-slate-500">Selecciona qué información deseas respaldar.</p>
          </div>
        </div>

        <div className="space-y-2 mb-6 max-h-60 overflow-y-auto p-2 border rounded-lg bg-slate-50">
          <div className="flex items-center justify-between mb-2 pb-2 border-bottom">
             <span className="text-[10px] font-bold text-slate-400 uppercase">Tablas del Sistema</span>
             <button 
                onClick={() => setSelectedExportTables(selectedExportTables.length === SYSTEM_TABLES.length ? [] : SYSTEM_TABLES)}
                className="text-[10px] text-blue-600 font-bold hover:underline"
             >
                {selectedExportTables.length === SYSTEM_TABLES.length ? 'Desmarcar Todo' : 'Marcar Todo'}
             </button>
          </div>
          {SYSTEM_TABLES.map(table => (
            <label key={table} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={selectedExportTables.includes(table)} 
                onChange={() => toggleTable(selectedExportTables, setSelectedExportTables, table)}
                className="rounded text-blue-600"
              />
              <span className="text-sm text-slate-700">{table}</span>
            </label>
          ))}
        </div>

        <button 
          onClick={handleExport} 
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2"
        >
          <Download size={18}/> Generar Respaldo ({selectedExportTables.length})
        </button>
      </div>

      {/* IMPORT SECTION */}
      <div className="p-6 border rounded-2xl bg-white shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
            <Upload size={24}/>
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Importar Datos</h3>
            <p className="text-xs text-slate-500">Carga un archivo y elige qué tablas restaurar.</p>
          </div>
        </div>

        {!importFileContent ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center hover:border-orange-300 transition-colors group cursor-pointer relative">
            <input 
              type="file" 
              accept=".json" 
              onChange={handleFileChange} 
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Upload size={40} className="mx-auto text-slate-300 group-hover:text-orange-400 mb-4 transition-colors" />
            <p className="text-sm font-medium text-slate-600">Haz clic o arrastra un archivo JSON</p>
            <p className="text-xs text-slate-400 mt-1">Solo archivos de respaldo .json</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
               <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-bold text-orange-800">Tablas detectadas en el archivo</h4>
                  <button onClick={() => setImportFileContent(null)} className="text-xs text-orange-600 hover:underline">Cambiar archivo</button>
               </div>
               
               <div className="space-y-2 max-h-48 overflow-y-auto mb-4 bg-white p-2 rounded-lg border border-orange-200">
                  {availableTables.map(table => (
                    <label key={table} className="flex items-center gap-3 p-2 hover:bg-orange-50 rounded-lg cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedImportTables.includes(table)} 
                        onChange={() => toggleTable(selectedImportTables, setSelectedImportTables, table)}
                        className="rounded text-orange-600"
                      />
                      <span className="text-sm text-slate-700">{table}</span>
                    </label>
                  ))}
               </div>

               <div className="flex gap-3">
                  <button 
                    onClick={handleImport}
                    disabled={selectedImportTables.length === 0 || !!importProgress}
                    className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {importProgress ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18}/>}
                    {importProgress ? 'Procesando...' : `Iniciar Importación (${selectedImportTables.length})`}
                  </button>
                  <button 
                    onClick={() => setImportFileContent(null)}
                    disabled={!!importProgress}
                    className="px-4 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    <X size={18}/>
                  </button>
               </div>

               {importProgress && (
                 <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-orange-700 uppercase">
                       <span>Procesando: {importProgress.table}</span>
                       <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-orange-200 rounded-full h-2 overflow-hidden">
                       <div 
                          className="bg-orange-600 h-full transition-all duration-300" 
                          style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                       ></div>
                    </div>
                    <p className="text-[9px] text-center text-orange-600 font-medium">
                       {importProgress.current} de {importProgress.total} registros totales
                    </p>
                 </div>
               )}
               <p className="text-[10px] text-orange-700 mt-3 italic">
                 * Advertencia: Las tablas seleccionadas serán vaciadas y reemplazadas con los datos del archivo.
               </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LabelFieldsModal({ config, onClose }: { config: LabelConfig; onClose: () => void }) {
    const [fields, setFields] = useState<LabelField[]>([]);
    const [newField, setNewField] = useState<{ fieldName?: string; dataSource?: LabelDataSource; staticValue?: string }>();
    const { showAlert, showLoading, hideLoading } = useAlert();

    useEffect(() => {
        db.getLabelFields(config.id).then(setFields);
    }, [config.id]);

    const handleSaveField = async () => {
        if (!newField?.fieldName || !newField?.dataSource) {
            return showAlert("Error", "Completa todos los campos del nuevo campo.", "error");
        }
        showLoading();
        try {
            await db.addLabelField({
                labelConfigId: config.id,
                fieldName: newField.fieldName,
                dataSource: newField.dataSource,
                staticValue: newField.staticValue
            });
            const updatedFields = await db.getLabelFields(config.id);
            setFields(updatedFields);
            setNewField({});
        } catch (e: any) {
            showAlert("Error", e.message, "error");
        } finally {
            hideLoading();
        }
    };

    const handleDeleteField = async (id: number) => {
        showLoading();
        try {
            await db.deleteLabelField(id);
            setFields(await db.getLabelFields(config.id));
        } catch (e: any) {
            showAlert("Error", e.message, "error");
        } finally {
            hideLoading();
        }
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl p-6">
                <h3 className="font-bold text-lg mb-4">Configuración de Campos - {config.labelName}</h3>
                <div className="space-y-4">
                    {fields.map(field => (
                        <div key={field.id} className="flex items-center justify-between p-4 bg-slate-50 rounded border">
                            <div>
                                <p className="text-sm font-semibold">{field.fieldName}</p>
                                <p className="text-xs text-slate-500">{field.dataSource}</p>
                                {field.staticValue && <p className="text-xs text-slate-400">Valor: {field.staticValue}</p>}
                            </div>
                            <button onClick={() => handleDeleteField(field.id)} className="text-red-500 p-2 rounded hover:bg-red-100" title="Eliminar campo" aria-label="Eliminar campo"><Trash2 size={16}/></button>
                        </div>
                    ))}
                    <div className="p-4 bg-slate-100 rounded border flex items-center gap-4">
                        <input className="p-2 border rounded text-sm" placeholder="Nombre campo" value={newField?.fieldName || ''} onChange={e => setNewField({...newField, fieldName: e.target.value})} aria-label="Nombre campo" />
                        <input className="p-2 border rounded text-sm" placeholder="Fuente de datos" value={newField?.dataSource ? String(newField.dataSource) : ''} onChange={e => setNewField({...newField, dataSource: e.target.value as LabelDataSource})} aria-label="Fuente de datos" />
                        <input className="p-2 border rounded text-sm" placeholder="Valor fijo (opcional)" value={newField?.staticValue || ''} onChange={e => setNewField({...newField, staticValue: e.target.value})} aria-label="Valor fijo" />
                        <button onClick={handleSaveField} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700" title="Agregar campo" aria-label="Agregar campo"><Plus size={16}/></button>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="bg-slate-200 text-slate-700 px-4 py-2 rounded hover:bg-slate-300" title="Cerrar modal" aria-label="Cerrar modal">Cerrar</button>
                </div>
            </div>
        </div>
    );
}
