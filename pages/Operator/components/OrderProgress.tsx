import React from 'react';
import { WorkOrder, PartNumber, SerialUnit } from '../../../types';

interface OrderProgressProps {
  order: WorkOrder;
  part: PartNumber | undefined;
  serials: SerialUnit[];
}

const OrderProgress: React.FC<OrderProgressProps> = ({ order, part, serials }) => {
  if (!part) {
    return null; // Or some fallback UI
  }

  const completed = serials.length;
  const total = order.quantity;
  const progressPercentage = total > 0 ? Math.min((completed / total) * 100, 100) : 0;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <p className="text-xs text-slate-400 font-bold uppercase">Orden SAP</p>
          <p className="text-xl font-mono font-bold text-slate-800">{order.sapOrderNumber || 'N/A'}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 font-bold uppercase">Progreso</p>
          <p className="text-xl font-bold text-blue-600">{completed} / {total}</p>
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
