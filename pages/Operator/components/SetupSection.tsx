import React from 'react';

interface SetupSectionProps {
  sapOrderInput: string;
  setSapOrderInput: (v: string) => void;
  qtyInput: string;
  setQtyInput: (v: string) => void;
  modelInput: string;
  setModelInput: (v: string) => void;
  setupStep: 1 | 2 | 3;
  setSetupStep: (v: 1 | 2 | 3) => void;
  qtyRef: React.RefObject<HTMLInputElement>;
  modelRef: React.RefObject<HTMLInputElement>;
}

export default function SetupSection({
  sapOrderInput,
  setSapOrderInput,
  qtyInput,
  setQtyInput,
  modelInput,
  setModelInput,
  setupStep,
  setSetupStep,
  qtyRef,
  modelRef
}: SetupSectionProps) {
  return (
    <div className="w-full animate-in fade-in zoom-in duration-300">
      <h3 className="text-lg font-bold text-slate-700 mb-6 flex items-center justify-center">Setup de Orden</h3>
      <div className={`mb-4 transition-opacity ${setupStep === 1 ? 'opacity-100' : 'opacity-50'}`}>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">1. Escanear Orden SAP</label>
        <div className="relative">
          <input
            autoFocus={setupStep === 1}
            value={sapOrderInput}
            onChange={e => { if (e.target.value.length <= 10) setSapOrderInput(e.target.value); }}
            disabled={setupStep !== 1}
            className="w-full pl-4 pr-10 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 text-lg tracking-widest"
            placeholder="0000000000"
          />
        </div>
      </div>
      <div className={`mb-4 transition-opacity ${setupStep === 2 ? 'opacity-100' : 'opacity-50'}`}>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">2. Cantidad</label>
        <input
          ref={qtyRef}
          type="number"
          value={qtyInput}
          onChange={e => setQtyInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              if (qtyInput) setSetupStep(3);
            }
          }}
          disabled={setupStep !== 2}
          className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 text-lg"
          placeholder="0"
        />
      </div>
      <div className={`mb-4 transition-opacity ${setupStep === 3 ? 'opacity-100' : 'opacity-50'}`}>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">3. Escanear Modelo</label>
        <input
          ref={modelRef}
          value={modelInput}
          onChange={e => setModelInput(e.target.value)}
          disabled={setupStep !== 3}
          className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 text-lg uppercase"
          placeholder="Ej. LT-SEN-R3"
        />
      </div>
    </div>
  );
}
