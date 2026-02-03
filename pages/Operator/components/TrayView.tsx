import React from 'react';
import { SerialUnit } from '../../../types';

interface TrayViewProps {
  traySerials: SerialUnit[];
  trayInput: string;
  setTrayInput: (v: string) => void;
  onScanTray: (e: React.FormEvent) => void;
}

export default function TrayView({ traySerials, trayInput, setTrayInput, onScanTray }: TrayViewProps) {
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
        <ul>
          {traySerials.map(s => (
            <li key={s.serialNumber}>{s.serialNumber}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
