import React, { useEffect, useState } from 'react';
import { WorkOrder, PartNumber, SerialUnit } from '../../../types';

interface OrderProgressProps {
  order: WorkOrder;
  part: PartNumber | undefined;
  serials: SerialUnit[];
}

const OrderProgress: React.FC<OrderProgressProps> = ({ order, part, serials }) => {
  const [progress, setProgress] = useState<{ completed: number; total: number; currentBox?: number; totalBoxes?: number; batchSize?: number } | null>(null);
  const [loading, setLoading] = useState(false);

  // Nueva función para avanzar caja de accesorios
  const handleNextBox = async () => {
    if (!order || !part || !progress || progress.completed >= progress.total) return;
    setLoading(true);
    try {
      // Llama al endpoint que actualiza el progreso (debes tenerlo en el backend, por ejemplo /api/order-progress-next/:orderNumber)
      // Aquí se asume que cada caja tiene batchSize unidades
      await fetch(`/api/order-progress-next/${order.orderNumber}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: progress.batchSize || 1 })
      });
      // Refresca el progreso
      fetch(`/api/order-progress/${order.orderNumber}`)
        .then(res => res.json())
        .then(data => {
          const completed = Number(data.completed);
          const total = Number(data.total);
          const currentBox = data.currentBox !== undefined ? Number(data.currentBox) : undefined;
          const totalBoxes = data.totalBoxes !== undefined ? Number(data.totalBoxes) : undefined;
          const batchSize = data.batchSize !== undefined ? Number(data.batchSize) : undefined;
          setProgress({
            completed: isNaN(completed) ? 0 : completed,
            total: isNaN(total) ? 0 : total,
            currentBox: currentBox !== undefined && !isNaN(currentBox) ? currentBox : 0,
            totalBoxes: totalBoxes !== undefined && !isNaN(totalBoxes) ? totalBoxes : 0,
            batchSize: batchSize !== undefined && !isNaN(batchSize) ? batchSize : 1
          });
        })
        .finally(() => setLoading(false));
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!order || !part) return;
    // Si es ACCESSORIES, consultar el endpoint
    if (part.serialGenType === 'ACCESSORIES') {
      fetch(`/api/order-progress/${order.orderNumber}`)
        .then(res => res.json())
        .then(data => {
          // Validar y convertir todos los campos a número
          const completed = Number(data.completed);
          const total = Number(data.total);
          const currentBox = data.currentBox !== undefined ? Number(data.currentBox) : undefined;
          const totalBoxes = data.totalBoxes !== undefined ? Number(data.totalBoxes) : undefined;
          const batchSize = data.batchSize !== undefined ? Number(data.batchSize) : undefined;
          setProgress({
            completed: isNaN(completed) ? 0 : completed,
            total: isNaN(total) ? 0 : total,
            currentBox: currentBox !== undefined && !isNaN(currentBox) ? currentBox : 0,
            totalBoxes: totalBoxes !== undefined && !isNaN(totalBoxes) ? totalBoxes : 0,
            batchSize: batchSize !== undefined && !isNaN(batchSize) ? batchSize : 1
          });
        })
        .catch(() => setProgress({ completed: 0, total: order.quantity, currentBox: 0, totalBoxes: 0, batchSize: 1 }));
    } else {
      // Para otros tipos, usar serials
      setProgress({ completed: serials.length, total: order.quantity });
    }
  }, [order, part, serials]);

  if (!part || !progress) {
    return null; // Or some fallback UI
  }

  const progressPercentage = progress.total > 0 ? Math.min((progress.completed / progress.total) * 100, 100) : 0;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <p className="text-xs text-slate-400 font-bold uppercase">Orden SAP</p>
          <p className="text-xl font-mono font-bold text-slate-800">{order.sapOrderNumber || 'N/A'}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 font-bold uppercase">Progreso</p>
          <p className="text-xl font-bold text-blue-600">{progress.completed} / {progress.total}</p>
          {part.serialGenType === 'ACCESSORIES' && progress.currentBox !== undefined && progress.totalBoxes !== undefined && progress.batchSize !== undefined && (
            <div className="mt-2 text-xs text-slate-500">
              Cajas ({progress.batchSize} u/caja): <span className="font-bold">{progress.currentBox} / {progress.totalBoxes}</span>
              <button className="ml-2 px-3 py-1 bg-blue-500 text-white rounded" onClick={handleNextBox} disabled={loading || progress.completed >= progress.total}>
                {loading ? 'Procesando...' : 'Continuar al siguiente caja de accesorios de esta orden'}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 mb-4 relative z-10">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm space-y-2 relative z-10">
        <div className="flex justify-between">
          <span className="text-slate-500">Lote:</span>
          <span className="font-medium">{order.orderNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Modelo:</span>
          <span className="font-medium">{part.productCode}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Tipo Serial:</span>
          <span className="font-mono text-xs bg-slate-200 px-1 rounded">{part.serialGenType}</span>
        </div>
      </div>
    </div>
  );
};

export default OrderProgress;
