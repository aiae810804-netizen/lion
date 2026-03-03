import React, { useState, useEffect } from 'react';
import { SerialUnit } from '../../../types';

interface TrayViewProps {
  traySerials: SerialUnit[];
  trayInput: string;
  setTrayInput: (v: string) => void;
  onScanTray: (e: React.FormEvent) => void;
  part: any; // Define the type for part based on your actual data
}

export default function TrayView({ traySerials, trayInput, setTrayInput, onScanTray, part }: TrayViewProps) {
  const [serialsRefreshKey, setSerialsRefreshKey] = useState(0);
  const [processedSerials, setProcessedSerials] = useState<string[]>([]);

  const refreshSerials = () => {
    setSerialsRefreshKey(k => k + 1);
  };

  useEffect(() => {
    // Fetch traySerials when serialsRefreshKey changes
    // Replace with your fetch logic
    // Example:
    // db.getTraySerials().then(setTraySerials);
  }, [serialsRefreshKey]);

  useEffect(() => {
    // Cargar seriales procesados desde BD si es necesario
    // setProcessedSerials(serials.filter(s => s.IsProcessed).map(s => s.serialNumber));
  }, [traySerials]);

  const handleMarkSerial = (serialNumber: string) => {
    // Implement your logic to mark a serial as processed
    setProcessedSerials([...processedSerials, serialNumber]);
  };

  const handleUnmarkSerial = (serialNumber: string) => {
    // Implement your logic to unmark a serial as processed
    setProcessedSerials(processedSerials.filter(s => s !== serialNumber));
  };

  return (
    <div className="tray-view">
      <form onSubmit={onScanTray}>
        <input
          value={trayInput}
          onChange={e => setTrayInput(e.target.value)}
          placeholder="Escanear Charola"
        />
        <button type="submit">Cargar Charola</button>
      </form>
      <div>
        <h4>Seriales en Charola</h4>
        {traySerials.map(serial => (
          <div key={serial.serialNumber}>
            {part.serialGenType === 'LOT_BASED' && (
              <button
                style={{ background: processedSerials.includes(serial.serialNumber) ? 'blue' : 'gray', color: 'white' }}
                onClick={() =>
                  processedSerials.includes(serial.serialNumber)
                    ? handleUnmarkSerial(serial.serialNumber)
                    : handleMarkSerial(serial.serialNumber)
                }
              >
                {serial.serialNumber}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
