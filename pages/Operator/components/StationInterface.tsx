import React, { useState, useEffect, useRef } from 'react';
import { Operation, ProcessRoute, WorkOrder, PartNumber, SerialUnit } from '../../../types';
import SetupSection from './SetupSection';
import TrayView from './TrayView';
import { useAlert } from '../../../context/AlertContext';

interface StationProps {
  operation: Operation;
  route: ProcessRoute;
  onBack: () => void;
  user: { id: string; name: string };
  activeOrderPart?: PartNumber | null;
}

export default function StationInterface({ operation, route, onBack, user, activeOrderPart }: StationProps) {
  const { showAlert } = useAlert();
  // Estados principales (ejemplo, puedes expandir según la lógica original)
  const [sapOrderInput, setSapOrderInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [traySerials, setTraySerials] = useState<SerialUnit[]>([]);
  const [trayInput, setTrayInput] = useState('');
  const [processedSerials, setProcessedSerials] = useState<string[]>([]);
  const qtyRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  const handleScanTray = (e: React.FormEvent) => {
    e.preventDefault();
    // Aquí iría la lógica para cargar seriales de la charola
    // Por ahora, solo simula agregar un serial
    setTraySerials([...traySerials, { serialNumber: trayInput } as SerialUnit]);
    setTrayInput('');
  };

  // Función para marcar charola como PASS y actualizar progreso (LOT_BASED y PCB_SERIAL)
  const handleFinishTray = async (trayId: string, operationId: string, operatorId: string) => {
    try {
      await fetch('/api/serials/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trayId, operationId, operatorId, isComplete: true })
      });
      // Refresca seriales y progreso
      // Aquí deberías recargar los seriales de la charola y el progreso de la orden
      // Ejemplo:
      // setTraySerials(await db.getSerialsByTray(trayId));
      // setOrderProgress(await db.getOrderProgress(orderNumber));
    } catch (err) {
      // Manejo de error
      console.error('Error al finalizar charola:', err);
    }
  };

  const handlePrintNameplate = async (serialNumber: string) => {
    if (processedSerials.length === 0) {
      showAlert("Aviso", "No hay piezas procesadas para empaque", "error");
      return;
    }
    await fetch('/api/print-label/multi', {
      method: 'POST',
      body: JSON.stringify({ serials: [{ serialNumber }], /* otros datos necesarios */ }),
      headers: { 'Content-Type': 'application/json' }
    });
  };

  // Aquí iría la lógica de efectos, handlers y renderizado de subcomponentes
  // Ejemplo: Renderizar SetupSection si es estación inicial y no hay orden activa
  return (
    <div className="station-interface">
      <div className="header">
        <h2>Estación: {operation.name}</h2>
        <p>Ruta: {route.name}</p>
        <button onClick={onBack}>Regresar</button>
        <p>Operador: {user.name}</p>
      </div>
      {/* Ejemplo de integración del subcomponente de setup */}
      <SetupSection
        sapOrderInput={sapOrderInput}
        setSapOrderInput={setSapOrderInput}
        qtyInput={qtyInput}
        setQtyInput={setQtyInput}
        modelInput={modelInput}
        setModelInput={setModelInput}
        setupStep={setupStep}
        setSetupStep={setSetupStep}
        qtyRef={qtyRef}
        modelRef={modelRef}
      />
      <TrayView
        traySerials={traySerials}
        trayInput={trayInput}
        setTrayInput={setTrayInput}
        onScanTray={handleScanTray}
        part={activeOrderPart}
      />
      {/* Renderizado de seriales en estación final */}
      {traySerials.map(serial => (
        <div key={serial.serialNumber}>
          {activeOrderPart?.serialGenType === 'LOT_BASED' && operation.isFinal && processedSerials.includes(serial.serialNumber) && (
            <button
              className="serial-blue-btn"
              onClick={() => handlePrintNameplate(serial.serialNumber)}
            >
              {serial.serialNumber}
            </button>
          )}
        </div>
      ))}
      {/* Aquí puedes agregar el resto de subcomponentes y lógica según el flujo original */}
      {/* <Sidebar ... /> */}
      {/* <ReprintModal ... /> */}
    </div>
  );
}
