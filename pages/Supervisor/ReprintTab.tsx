import React, { useState } from 'react';
import { db } from '../../services/storage';
import { WorkOrder, PartNumber, SerialUnit } from '../../types';
import { Search, Printer, AlertCircle, CheckCircle } from 'lucide-react';

const ReprintTab: React.FC = () => {
  const [orderNum, setOrderNum] = useState('');
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [part, setPart] = useState<PartNumber | null>(null);
  const [serials, setSerials] = useState<SerialUnit[]>([]);
  const [selectedSerial, setSelectedSerial] = useState('');
  const [labelType, setLabelType] = useState('CARTON1');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSearch = async () => {
    if (!orderNum.trim()) return;
    setLoading(true);
    setMsg(null);
    setOrder(null);
    setPart(null);
    setSerials([]);
    setSelectedSerial('');

    try {
      const foundOrder = await db.getOrderByNumber(orderNum);
      if (!foundOrder) {
        setMsg({ type: 'error', text: 'Orden no encontrada.' });
        setLoading(false);
        return;
      }
      setOrder(foundOrder);

      const parts = await db.getParts();
      const foundPart = parts.find(p => p.id === foundOrder.partNumberId);
      if (foundPart) {
        setPart(foundPart);
        
        // Fetch serials if applicable (PCB_SERIAL or LOT_BASED)
        if (foundPart.serialGenType === 'PCB_SERIAL' || foundPart.serialGenType === 'LOT_BASED') {
             const orderSerials = await db.getSerialsByOrder(foundOrder.orderNumber);
             setSerials(orderSerials);
        }
      } else {
          setMsg({ type: 'error', text: 'Parte asociada a la orden no encontrada.' });
      }

    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!order || !part) return;
    
    // Validate Serial Selection for specific types
    if ((part.serialGenType === 'PCB_SERIAL' || part.serialGenType === 'LOT_BASED') && !selectedSerial) {
        setMsg({ type: 'error', text: 'Seleccione un número de serie.' });
        return;
    }

    setLoading(true);
    setMsg(null);
    try {
        // Use selected serial, or fallback to order number for non-serialized parts
        const printIdentifier = selectedSerial || order.orderNumber;
        
        await db.printLabel(printIdentifier, part.partNumber, {
            sapOrderNumber: order.sapOrderNumber,
            orderQuantity: order.quantity,
            sku: part.productCode,
            quantity: 1,
            labelType: labelType
        });
        
        setMsg({ type: 'success', text: `Etiqueta ${labelType} enviada a impresión.` });
    } catch (e: any) {
        setMsg({ type: 'error', text: 'Error al imprimir: ' + e.message });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow h-full overflow-auto">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
        <Printer className="text-blue-600" /> Reimpresión de Etiquetas
      </h2>

      <div className="flex gap-4 mb-6 items-end">
        <div className="flex-1 max-w-xs">
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Número de Orden</label>
            <input 
            type="text" 
            value={orderNum}
            onChange={e => setOrderNum(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Ej. 25A001"
            className="border border-slate-300 p-2 rounded w-full focus:ring-2 focus:ring-blue-500 outline-none"
            />
        </div>
        <button 
          onClick={handleSearch} 
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium transition-colors h-10"
        >
          {loading ? <span className="animate-spin">⌛</span> : <Search size={18} />} Buscar
        </button>
      </div>

      {msg && (
        <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 border ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {msg.type === 'success' ? <CheckCircle size={20}/> : <AlertCircle size={20}/>}
            <span className="font-medium">{msg.text}</span>
        </div>
      )}

      {order && part && (
        <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(part.serialGenType === 'PCB_SERIAL' || part.serialGenType === 'LOT_BASED') && (
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Seleccionar Número de Serie</label>
                        <select 
                            value={selectedSerial} 
                            onChange={e => setSelectedSerial(e.target.value)}
                            className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        >
                            <option value="">-- Seleccionar Serial --</option>
                            {serials.map(s => (
                                <option key={s.serialNumber} value={s.serialNumber}>
                                    {s.serialNumber} {s.isComplete ? '(Completo)' : '(En Proceso)'}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">
                            {serials.length} seriales encontrados para esta orden.
                        </p>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Tipo de Etiqueta</label>
                    <select 
                        value={labelType} 
                        onChange={e => setLabelType(e.target.value)}
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                        <option value="CARTON1">CARTON1 (Caja Individual)</option>
                        <option value="CARTON2">CARTON2 (Caja Master)</option>
                        <option value="NAMEPLATE">NAMEPLATE (Identificación Producto)</option>
                        <option value="BOX_LABEL">BOX_LABEL (Identificación Caja)</option>
                    </select>
                </div>
            </div>

            <div className="mt-8 flex justify-end">
                <button 
                    onClick={handlePrint}
                    disabled={loading || ((part.serialGenType === 'PCB_SERIAL' || part.serialGenType === 'LOT_BASED') && !selectedSerial)}
                    className="bg-slate-900 text-white py-3 px-8 rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 shadow-lg transition-all active:scale-95"
                >
                    <Printer size={20} /> 
                    {loading ? 'Enviando...' : 'Imprimir Etiqueta'}
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default ReprintTab;