import React, { useState, useEffect, useRef, useContext } from 'react';
import { db } from '../../services/storage';
import { Operation, WorkOrder, SerialUnit, PartNumber, ProcessRoute } from '../../types';
import { AuthContext } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { Scan, CheckCircle, AlertTriangle, Printer, Box, ArrowLeft, Lock, Info, PlayCircle, PlusSquare, ArrowRight, GitMerge, ChevronRight, X, RefreshCw, FileDown, Layers, LogOut, CheckSquare, Square, List, Hash, Download } from 'lucide-react';

export default function OperatorStation() {
  const { user } = useContext(AuthContext);
  const { showAlert, showLoading, hideLoading } = useAlert();
  const [selectedRoute, setSelectedRoute] = useState<ProcessRoute | null>(null);
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  
  const [routes, setRoutes] = useState<ProcessRoute[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]); // These will be filtered
  const [allOperations, setAllOperations] = useState<Operation[]>([]); // Raw list for mapping

  useEffect(() => {
    // Load Routes and Operations on mount
    const load = async () => {
        const [r, o] = await Promise.all([db.getRoutes(), db.getOperations()]);
        setRoutes(r);
        setAllOperations(o);
    }
    load();
  }, []);

  // Filter operations when route is selected
  useEffect(() => {
      if (selectedRoute) {
          // Map steps to actual operations in order
          const routeOps: Operation[] = [];
          selectedRoute.steps.forEach(step => {
             const op = allOperations.find(o => o.id === step.operationId);
             if (op) routeOps.push(op);
          });
          setOperations(routeOps);
      }
  }, [selectedRoute, allOperations]);

  const handleSelectRoute = (route: ProcessRoute) => {
      // If we were in an op, we should have exited, but safety check:
      if (selectedOp) handleExitStation(selectedOp);
      setSelectedRoute(route);
  };

  const handleSelectOp = async (op: Operation) => {
    try {
        await db.enterStation(op.id, user!.id);
        setSelectedOp(op);
    } catch (e: any) {
        showAlert("Acceso Denegado", e.message || "No se pudo ingresar a la estación.", "error");
    }
  };

  const handleExitStation = async (op: Operation) => {
      if (user) {
          try {
              await db.exitStation(op.id, user.id);
          } catch (e) {
              console.error("Error unlocking station", e);
          }
      }
  };

  const handleBackToRoutes = () => {
      if (selectedOp) {
          handleExitStation(selectedOp);
          setSelectedOp(null);
      }
      setSelectedRoute(null);
  };

  const handleBackToOps = async () => {
    if (selectedOp) {
        await handleExitStation(selectedOp);
        setSelectedOp(null);
    }
  };

  // Auto-cleanup on unmount
  useEffect(() => {
      return () => {
          if (selectedOp) handleExitStation(selectedOp);
      };
  }, [selectedOp]);

  // SCREEN 1: ROUTE SELECTION
  if (!selectedRoute) {
      return (
          <div className="max-w-6xl mx-auto animate-in fade-in duration-300">
              <div className="mb-8">
                  <h1 className="text-3xl font-bold text-slate-900">Selección de Ruta</h1>
                  <p className="text-slate-500">Seleccione el proceso en el que va a trabajar.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {routes.map(route => (
                      <button 
                        key={route.id} 
                        onClick={() => handleSelectRoute(route)}
                        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-lg transition-all text-left group"
                      >
                          <div className="flex justify-between items-start mb-4">
                              <div className="bg-blue-50 p-3 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                  <GitMerge size={24}/>
                              </div>
                          </div>
                          <h3 className="text-xl font-bold text-slate-800 mb-2">{route.name}</h3>
                          <p className="text-sm text-slate-500 line-clamp-2">{route.description}</p>
                          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center text-xs text-slate-400 font-mono">
                              {route.steps.length} Operaciones Config.
                              <ChevronRight className="ml-auto" size={16}/>
                          </div>
                      </button>
                  ))}
                  {routes.length === 0 && (
                      <div className="col-span-3 text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          No hay rutas configuradas. Contacte al administrador.
                      </div>
                  )}
              </div>
          </div>
      )
  }

  // SCREEN 2: OPERATION SELECTION
  if (!selectedOp) {
    return (
      <div className="max-w-4xl mx-auto animate-in fade-in duration-300">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{selectedRoute.name}</h1>
            <p className="text-slate-500">Seleccione la operación activa para comenzar.</p>
          </div>
          <button onClick={handleBackToRoutes} className="flex items-center text-sm text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-2 rounded-lg">
              <ArrowLeft size={16} className="mr-2"/> Cambiar Ruta
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative">
          {operations.map((op, idx) => (
            <div key={op.id} className="relative">
                {idx > 0 && (
                    <div className="hidden lg:block absolute -left-4 top-1/2 transform -translate-y-1/2 -translate-x-full text-slate-300">
                        <ArrowRight size={24}/>
                    </div>
                )}
                <button onClick={() => handleSelectOp(op)} className="w-full flex flex-col items-center p-8 bg-white rounded-2xl shadow-sm border-2 border-transparent hover:border-blue-500 hover:shadow-xl transition-all group relative overflow-hidden h-full">
                <div className={`p-4 rounded-full mb-4 transition-transform group-hover:scale-110 ${op.isInitial ? 'bg-green-100 text-green-600' : op.isFinal ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                    {op.isFinal ? <Box size={32} /> : <Scan size={32} />}
                </div>
                <h3 className="text-xl font-bold text-slate-800 group-hover:text-blue-600 text-center">{op.name}</h3>
                <span className="text-xs font-mono text-slate-400 mt-2 bg-slate-50 px-2 py-1 rounded">PASO: {idx + 1}</span>
                {(op as any).activeOperatorId && (
                    <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl-lg flex items-center">
                        <Lock size={10} className="mr-1"/> {(op as any).activeOperatorName || 'Ocupado'}
                    </div>
                )}
                {op.isInitial && <span className="absolute top-3 left-3 w-2 h-2 bg-green-500 rounded-full"></span>}
                </button>
            </div>
          ))}
           {operations.length === 0 && (
              <div className="col-span-3 text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Esta ruta no tiene operaciones asignadas.
              </div>
          )}
        </div>
      </div>
    );
  }

  // SCREEN 3: WORKSTATION
  return <StationInterface2 operation={selectedOp} route={selectedRoute} onBack={handleBackToOps} user={user!} />;
}

// --- ACTUAL SCANNING INTERFACE ---

interface StationProps {
  operation: Operation;
  route: ProcessRoute;
  onBack: () => void;
  user: { id: string; name: string };
}

function StationInterface2({ operation, route, onBack, user }: StationProps) {
  const { showLoading, hideLoading, showAlert, showConfirm } = useAlert();

  // Global State
  const [activeOrder, setActiveOrder] = useState<WorkOrder | null>(null);
  const [activeOrderPart, setActiveOrderPart] = useState<PartNumber | null>(null);
  const [allOrderSerials, setAllOrderSerials] = useState<SerialUnit[]>([]); // For summary
  
  // Scanning State
  const [serialInput, setSerialInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [scannedCount, setScannedCount] = useState(0);

  // Resume Context (SAP Order Scan or Tray Scan)
  const [contextInput, setContextInput] = useState('');

  // Initial Station - Order Creation State
  const [sapOrderInput, setSapOrderInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1); // 1: SAP, 2: Qty, 3: Model
  
  // Tray Logic
  const [trayInput, setTrayInput] = useState('');
  const [activeTrayId, setActiveTrayId] = useState<string | null>(null);
  const [traySerials, setTraySerials] = useState<SerialUnit[]>([]);
  const [trayGenerated, setTrayGenerated] = useState(false); // For Initial Step
  const [selectAll, setSelectAll] = useState(false);
  const [trayIsFinished, setTrayIsFinished] = useState(false); // New state to track if tray is fully processed
  const [lastCsvData, setLastCsvData] = useState<{ content: string, filename: string } | null>(null);

  // Reprint Modal State
  const [isReprinting, setIsReprinting] = useState(false);
  const [reprintQty, setReprintQty] = useState(1);
  
  // Suffix Reprint Modal (Empaque Tray)
  const [isSuffixReprinting, setIsSuffixReprinting] = useState(false);
  const [reprintSuffix, setReprintSuffix] = useState('');

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const modelDebounceRef = useRef<number | null>(null);

  // Load context logic
  const [availableParts, setAvailableParts] = useState<PartNumber[]>([]);
  const [allOps, setAllOps] = useState<Operation[]>([]);

  useEffect(() => {
    // Load parts for validation in Initial Station
    db.getParts().then(setAvailableParts);
    db.getOperations().then(setAllOps);
  }, [operation]);

  // Update scanned count
  useEffect(() => {
    if (activeOrder) {
        // Refresh Order Summary context
        db.getSerials().then(serials => {
             const relevant = serials.filter(s => s.orderNumber === activeOrder.orderNumber);
             setAllOrderSerials(relevant);
             setScannedCount(relevant.length);
        });
    }
  }, [activeOrder, statusMsg, trayGenerated]);

  // --- SMART AUTO-ENTER LOGIC FOR ORDER SETUP (INITIAL) ---
  useEffect(() => { 
      if (operation.isInitial && !activeOrder && sapOrderInput.length === 10) {
          validateAndProceedSAP(sapOrderInput);
      } 
  }, [sapOrderInput]);

  const validateAndProceedSAP = async (sapOrder: string) => {
      showLoading("Validando Orden SAP...");
      try {
          const orders = await db.getOrders();
          const match = orders.find(o => o.sapOrderNumber === sapOrder);

          if (match) {
              if (match.status === 'CLOSED') {
                  throw new Error("Esta orden SAP ya está CERRADA.");
              }
              
              const parts = await db.getParts();
              const part = parts.find(p => p.id === match.partNumberId);

              // STRICT ROUTE VALIDATION (INITIAL RESUME)
              if (part && part.processRouteId && part.processRouteId !== route.id) {
                 throw new Error(`Error de Ruta: El modelo ${part.productCode} pertenece a otra ruta (${route.name} seleccionada). Regrese y seleccione la ruta correcta.`);
              }
              
              // If order exists and is OPEN, resume context immediately
              const allSerials = await db.getSerials();
              const orderSerials = allSerials.filter(s => s.orderNumber === match.orderNumber);
                  
              setActiveOrder(match);
              setActiveOrderPart(part || null);
              setAllOrderSerials(orderSerials);
              setQtyInput(match.quantity.toString());
              setModelInput(part?.productCode || '');
              
              setStatusMsg({ type: 'success', text: "Orden SAP existente. Resumiendo proceso..." });
              return;
          }

          // If not found, proceed to Step 2 to Create New
          setSetupStep(2);
      } catch (e: any) {
          showAlert("Alerta de Validación", e.message, "warning");
          setSapOrderInput('');
      } finally {
          hideLoading();
      }
  };

  useEffect(() => { if (setupStep === 2) setTimeout(() => qtyRef.current?.focus(), 100); else if (setupStep === 3) setTimeout(() => modelRef.current?.focus(), 100); }, [setupStep]);
  useEffect(() => {
      if (setupStep === 3 && modelInput.length > 0) {
          if (modelDebounceRef.current) clearTimeout(modelDebounceRef.current);
          modelDebounceRef.current = window.setTimeout(() => { handleFinishSetup(); }, 2000);
      }
      return () => { if(modelDebounceRef.current) clearTimeout(modelDebounceRef.current); }
  }, [modelInput]);

  // --- RESUME CONTEXT LOGIC (INTERMEDIATE/FINAL) ---
  const handleScanContext = async (e: React.FormEvent) => {
      e.preventDefault();
      const inputVal = contextInput.trim();
      if (!inputVal) return;
      showLoading("Buscando Contexto...");
      
      try {
          const orders = await db.getOrders();
          const parts = await db.getParts();
          const allSerials = await db.getSerials();
          
          let match = orders.find(o => o.sapOrderNumber === inputVal && o.status === 'OPEN');
          let fromTray = false;
          let trayIdFound = '';

          // If NOT found by SAP Order, check if it's a TRAY ID
          if (!match) {
             const traySerials = await db.getSerialsByTray(inputVal);
             if (traySerials.length > 0) {
                 for (const s of traySerials) {
                     const potentialOrder = orders.find(o => o.orderNumber === s.orderNumber && o.status === 'OPEN');
                     if (potentialOrder) {
                         match = potentialOrder;
                         fromTray = true;
                         trayIdFound = inputVal;
                         break;
                     }
                 }
             }
          }
          
          if (!match) throw new Error("Orden SAP no encontrada, cerrada, o Charola no válida.");
          
          const part = parts.find(p => p.id === match.partNumberId);
          
          // STRICT ROUTE VALIDATION (INTERMEDIATE)
          if (part && part.processRouteId && part.processRouteId !== route.id) {
               throw new Error(`Error de Ruta: El modelo ${part.productCode} no se puede correr en esta ruta. Regrese y seleccione la correcta.`);
          }

          const orderSerials = allSerials.filter(s => s.orderNumber === match!.orderNumber);
          setAllOrderSerials(orderSerials);
          
          setActiveOrder(match);
          setActiveOrderPart(part || null);
          setContextInput('');

          if (fromTray) {
              setStatusMsg({ type: 'success', text: "Charola detectada. Contexto cargado." });
              const traySerials = await db.getSerialsByTray(trayIdFound);
              processLoadedTray(traySerials.filter(s => s.orderNumber === match!.orderNumber), trayIdFound, part!, route);
          } else {
               if (orderSerials.length >= match.quantity && orderSerials.every(s => s.isComplete)) {
                  setStatusMsg({ type: 'success', text: "Orden Completada. Puede escanear para revisión." });
              } else {
                  setStatusMsg({ type: 'success', text: "Orden cargada. Proceda." });
              }
          }

      } catch (e: any) {
          showAlert("Error", e.message, "error");
          setContextInput('');
      } finally { hideLoading(); }
  };

  // Helper to re-use tray loading logic
  const processLoadedTray = (serials: SerialUnit[], trayId: string, part: PartNumber, route: ProcessRoute) => {
      try {
          const hasPending = serials.some(s => !s.isComplete);
          let displaySerials = serials;
          if (hasPending) {
              displaySerials = serials.filter(s => !s.isComplete);
          }
          
          const currentStationStep = route.steps.find(s => s.operationId === operation.id);
          let pendingCount = 0;
          let aheadCount = 0;
          let readyCount = 0;

          const getOpOrder = (opId: string) => route.steps.find(s => s.operationId === opId)?.stepOrder || 0;

          displaySerials.forEach(s => {
              if (s.isComplete) {
                   aheadCount++;
              } else {
                  const unitStepOrder = getOpOrder(s.currentOperationId);
                  if (s.currentOperationId === operation.id) {
                      aheadCount++; 
                  } else if (unitStepOrder < (currentStationStep?.stepOrder || 0)) {
                       const sortedSteps = [...route.steps].sort((a,b) => a.stepOrder - b.stepOrder);
                       const myIdx = sortedSteps.findIndex(s => s.operationId === operation.id);
                       const prevOpId = myIdx > 0 ? sortedSteps[myIdx-1].operationId : null;
                       
                       if (s.currentOperationId === prevOpId) {
                           readyCount++;
                       } else if (myIdx > 0 && unitStepOrder < sortedSteps[myIdx-1].stepOrder) {
                           pendingCount++;
                       } else {
                           readyCount++;
                       }
                  } else {
                      aheadCount++;
                  }
              }
          });

          if (pendingCount > 0) throw new Error(`Charola tiene unidades pendientes en operaciones anteriores.`);
          
          if (readyCount === 0 && aheadCount > 0 && aheadCount === displaySerials.length) {
              setTrayIsFinished(true);
              setStatusMsg({ type: 'info', text: "Charola ya procesada en esta estación. (Modo Consulta / Reimpresión)" });
          } else {
              setTrayIsFinished(false);
          }

          setTraySerials(displaySerials);
          setActiveTrayId(trayId);
      } catch (e: any) {
          showAlert("Aviso Tray", e.message, "warning");
      }
  }

  const handleFinishSetup = async (existingOrder?: WorkOrder, existingPart?: PartNumber) => {
      if (existingOrder && existingPart) {
           // STRICT ROUTE VALIDATION (MANUAL RESUME)
           if (existingPart.processRouteId && existingPart.processRouteId !== route.id) {
               showAlert("Error de Ruta", `El modelo ${existingPart.productCode} no se puede correr en la ruta "${route.name}". Regrese y seleccione la correcta.`, "error");
               return;
           }
           setActiveOrder(existingOrder);
           setActiveOrderPart(existingPart);
           return;
      }

      if (!sapOrderInput || !qtyInput || !modelInput) return;

      // PRE-VALIDATION: Check if scanned Model belongs to current Route BEFORE generating anything
      const targetPart = availableParts.find(p => p.productCode === modelInput);
      
      if (targetPart) {
          // CHECK 1: DOES PART HAVE A ROUTE?
          if (!targetPart.processRouteId) {
               showAlert("Error de Configuración", `El modelo ${modelInput} no tiene una ruta de proceso asignada. Contacte al administrador.`, "error");
               setModelInput('');
               return;
          }

          // CHECK 2: DOES ROUTE MATCH CURRENT?
          if (targetPart.processRouteId !== route.id) {
              showAlert("Error de Ruta", `El modelo ${modelInput} no se puede correr en la ruta "${route.name}". Regrese y seleccione la ruta correcta.`, "error");
              setModelInput('');
              return;
          }
      } else {
           // Optional: If part doesn't exist locally, we can let backend fail or fail early here.
      }

      showLoading("Generando Lote...");
      try {
          const res = await db.generateAutoOrder(sapOrderInput, modelInput, Number(qtyInput));
          if (res.success) {
              const order = await db.getOrderByNumber(res.orderNumber);
              if (order) {
                  const parts = await db.getParts();
                  const part = parts.find(p => p.id === order.partNumberId);
                  
                  // Double check after fetch
                  if (part && part.processRouteId && part.processRouteId !== route.id) {
                     throw new Error(`Error de Ruta: El modelo ${part.productCode} está asignado a otra ruta.`);
                  }

                  setActiveOrderPart(part || null);
                  setActiveOrder(order);
                  setStatusMsg({ type: 'success', text: `Lote ${res.orderNumber} Creado` });

                  if (part) {
                      const isAccessories = part.serialGenType === 'ACCESSORIES';
                      const isLotBased = part.serialGenType === 'LOT_BASED';
                      
                      try {
                          if (isAccessories) {
                              const printQty = Number(qtyInput);
                              showLoading(`Imprimiendo ${printQty} etiquetas de Accesorios...`);
                              await db.printLabel(res.orderNumber, part.partNumber, { 
                                  sku: part.productCode, 
                                  quantity: printQty,
                                  jobDescription: `Accessories Batch ${res.orderNumber}`
                              });
                              setStatusMsg({ type: 'success', text: `Lote Creado + ${printQty} Etiquetas Enviadas` });
                          } else if (isLotBased) {
                              // LOT BASED: Labels are NOT printed at setup for lot based, only CSV is generated later.
                              // So we just confirm order creation here.
                              setStatusMsg({ type: 'success', text: `Lote Creado. Proceda a generar charolas.` });
                          }
                      } catch (printErr: any) {
                          setStatusMsg({ type: 'info', text: `Lote Creado. Error al imprimir: ${printErr.message}` });
                      }
                  }
              }
          }
      } catch (e: any) {
          showAlert("Error", e.message, "error");
          if (e.message.includes('Orden SAP')) { setSapOrderInput(''); setSetupStep(1); } else { setModelInput(''); }
      } finally { hideLoading(); }
  };

  // --- REPRINT LOGIC ---
  const handleReprint = async () => {
      if (!activeOrder || !activeOrderPart) return;
      showLoading("Enviando a impresora...");
      try {
          await db.printLabel(activeOrder.orderNumber, activeOrderPart.partNumber, {
              sku: activeOrderPart.productCode, quantity: reprintQty, excludeLabelTypes: ['NAMEPLATE'], jobDescription: `Reprint ${activeOrder.orderNumber}`
          });
          showAlert("Éxito", "Reimpresión enviada correctamente.", "success");
          setIsReprinting(false); setReprintQty(1);
      } catch (e: any) { showAlert("Error", e.message, "error"); } finally { hideLoading(); }
  };

  // --- SPECIFIC SUFFIX REPRINT LOGIC (For Lot Based in Empaque) ---
  const handleReprintSuffix = async () => {
      if (!reprintSuffix || !activeOrder || !activeOrderPart) return;
      if (reprintSuffix.length !== 3) {
          showAlert("Error", "Debe ingresar exactamente los 3 dígitos (ej. 003).", "warning");
          return;
      }
      
      showLoading("Buscando serial...");
      try {
          const match = traySerials.find(s => s.serialNumber.endsWith(`-${reprintSuffix}M`));
          
          if (!match) {
              throw new Error(`Serial con terminación ...-${reprintSuffix}M no encontrado en esta charola.`);
          }

          await db.printLabel(match.serialNumber, activeOrderPart.partNumber, {
              sku: activeOrderPart.productCode,
              jobDescription: `Reprint Single ${match.serialNumber}`,
              excludeLabelTypes: ['CARTON1', 'CARTON2'] 
          });
          
          showAlert("Éxito", `Reimpresión enviada para ${match.serialNumber}`, "success");
          setIsSuffixReprinting(false);
          setReprintSuffix('');
      } catch (e: any) {
          showAlert("Error", e.message, "error");
      } finally {
          hideLoading();
      }
  }

  // --- TRAY GENERATION (INITIAL) ---
  const handleScanTrayInitial = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!trayInput || !activeOrder || !activeOrderPart) return;
      
      const remaining = activeOrder.quantity - scannedCount;
      
      if (remaining <= 0) {
          showAlert("Orden Completa", "La orden ya ha alcanzado la cantidad requerida.", "info");
          setTrayInput('');
          return;
      }

      const quantityToGenerate = Math.min(100, remaining);

      showLoading(`Generando ${quantityToGenerate} Seriales...`);
      try {
          const res = await db.generateBatchSerials({
              orderNumber: activeOrder.orderNumber,
              partNumberId: activeOrderPart.id,
              currentOperationId: operation.id,
              trayId: trayInput,
              operatorId: user.id,
              quantity: quantityToGenerate
          });

          if (res.success) {
              // GENERATE CSV WITH TIMESTAMP
              const timestamp = new Date().toISOString().replace(/[:T-]/g, '').slice(0, 14); 
              const filename = `${sapOrderInput}_CHAROLA_${trayInput}_${activeOrder.orderNumber}.csv`;
              const csvContent = "PN,SKU,SERIAL\n" + res.serials.map(s => `${activeOrderPart.partNumber},${activeOrderPart.productCode},${s.serialNumber}`).join("\n");
              
              setLastCsvData({ content: csvContent, filename: filename });
              
              downloadCsv(csvContent, filename);
              
              setStatusMsg({ type: 'success', text: `Charola ${trayInput} generada con ${quantityToGenerate} unidades.` });
              setTrayInput('');
              setTrayGenerated(true); 
              setTrayIsFinished(false);
              
              const allSerials = await db.getSerials();
              setScannedCount(allSerials.filter(s => s.orderNumber === activeOrder.orderNumber).length);
          }
      } catch (e: any) {
          showAlert("Charola Ocupada / Error", e.message, "error");
          setTrayInput('');
      } finally { hideLoading(); }
  };

  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadCsvAgain = () => {
    if (lastCsvData) {
        downloadCsv(lastCsvData.content, lastCsvData.filename);
        showAlert("Descarga Exitosa", "El archivo CSV ha sido generado nuevamente.", "success");
    }
  };

  const handleFinishTrayInitial = () => {
      setTrayGenerated(false);
      setLastCsvData(null);
      setStatusMsg({ type: 'info', text: "Charola completada. Lista para siguiente operación." });
      setTrayInput('');
  };

  // --- TRAY PROCESSING (INTERMEDIATE/FINAL) ---
  const handleScanTrayProcessing = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!trayInput || !activeOrder || !activeOrderPart) return; 
      showLoading("Cargando Charola...");
      try {
          const allSerials = await db.getSerialsByTray(trayInput);
          let serials = allSerials.filter(s => s.orderNumber === activeOrder.orderNumber);
          
          if (serials.length === 0) throw new Error("Charola no contiene unidades activas para esta orden.");
          
          processLoadedTray(serials, trayInput, activeOrderPart, route);

          setTrayInput('');
      } catch (e: any) {
          showAlert("Error", e.message, "error");
          setTrayInput(''); 
      } finally { hideLoading(); }
  };

  const handleToggleTrayUnit = async (serial: SerialUnit) => {
      if (serial.isComplete || trayIsFinished) return; 
      const isProcessed = serial.history.some(h => h.operationId === operation.id);
      if (isProcessed) return;

      try {
          const newHistory = [...serial.history, {
              operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString()
          }];
          
          const updatedList = traySerials.map(s => s.serialNumber === serial.serialNumber ? { ...s, history: newHistory, currentOperationId: operation.id } : s);
          setTraySerials(updatedList);

          await db.saveSerial({ ...serial, currentOperationId: operation.id, history: newHistory });

      } catch (e) {}
  };

  const handleSelectAllTray = async () => {
      if (traySerials.length === 0 || trayIsFinished) return;
      showLoading("Marcando Todo...");
      
      try {
          const toProcess = traySerials.filter(s => !s.isComplete && !s.history.some(h => h.operationId === operation.id));
          if (toProcess.length === 0) { hideLoading(); return; }

          const serialNumbers = toProcess.map(s => s.serialNumber);

          await db.updateBatchSerials({
              serials: serialNumbers,
              operationId: operation.id,
              operatorId: user.id
          });

          const now = new Date().toISOString();
          const updatedList = traySerials.map(s => {
              if (serialNumbers.includes(s.serialNumber)) {
                  return {
                      ...s,
                      currentOperationId: operation.id,
                      history: [...s.history, { operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: now }]
                  };
              }
              return s;
          });
          
          setTraySerials(updatedList);
          setSelectAll(true);

      } catch (e:any) {
          console.error(e);
          showAlert("Error", "Fallo al marcar todo: " + e.message, "error");
      } finally {
          hideLoading();
      }
  }

  const handleFinishTrayProcessing = async () => {
      if (trayIsFinished) {
          setActiveTrayId(null);
          setTraySerials([]);
          setSelectAll(false);
          setTrayIsFinished(false);
          return;
      }

      const processedCount = traySerials.filter(s => s.history.some(h => h.operationId === operation.id)).length;
      if (processedCount < 100 && processedCount < traySerials.length) return;

      setActiveTrayId(null);
      setTraySerials([]);
      setSelectAll(false);
      setStatusMsg({ type: 'success', text: "Charola Enviada a Siguiente Estación." });
      showAlert("Éxito", "Charola liberada correctamente.", "success");
  }

  const handleProcessTrayFinal = async () => {
      if (trayIsFinished) {
           setActiveTrayId(null);
           setTraySerials([]);
           setTrayIsFinished(false);
           return;
      }

      if (!activeTrayId || traySerials.length === 0) return;
      const confirmed = await showConfirm("Procesar Charola", `¿Confirmar empaque e impresión de etiquetas para ${traySerials.length} unidades?`);
      if (!confirmed) return;

      showLoading("Procesando e Imprimiendo...");
      try {
          const serialNumbers = traySerials.map(s => s.serialNumber);
          await db.updateBatchSerials({
              serials: serialNumbers,
              operationId: operation.id,
              operatorId: user.id,
              isComplete: true
          });

          const part = await db.getParts().then(parts => parts.find(p => p.id === traySerials[0].partNumberId));
          if (part) {
              await db.printMultiLabels(traySerials, part.productCode, part.partNumber);
          }

          setStatusMsg({ type: 'success', text: "Charola Finalizada y Etiquetas Enviadas." });
          setActiveTrayId(null);
          setTraySerials([]);
          
          const all = await db.getSerials();
          setAllOrderSerials(all.filter(s => s.orderNumber === activeOrder!.orderNumber));

      } catch (e: any) {
          showAlert("Error", e.message, "error");
      } finally { hideLoading(); }
  };

  const handleFinishAccessories = async () => {
      if (!activeOrder || !activeOrderPart) return;

      showLoading("Registrando unidades completadas...");
      try {
          await db.generateBatchSerials({
              orderNumber: activeOrder.orderNumber,
              partNumberId: activeOrderPart.id,
              currentOperationId: operation.id,
              operatorId: user.id,
              quantity: activeOrder.quantity, 
              autoComplete: true 
          });
          
          showAlert("Orden Completada", "La orden de accesorios ha sido registrada y cerrada correctamente.", "success");
          
          setActiveOrder(null);
          setActiveOrderPart(null);
          setSapOrderInput('');
          setQtyInput('');
          setModelInput('');
          setSetupStep(1);
          setStatusMsg(null);
      } catch (e: any) {
          showAlert("Error", "Error al finalizar orden de accesorios: " + e.message, "error");
      } finally {
          hideLoading();
      }
  };

  const handleChangeContext = () => {
      setActiveOrder(null);
      setActiveOrderPart(null);
      setActiveTrayId(null);
      setTraySerials([]);
      setContextInput('');
  }

  // --- STANDARD SCAN LOGIC ---
  useEffect(() => {
      if (!serialInput) return;
      let shouldSubmit = false;
      if (activeOrderPart) {
           if (serialInput.length === activeOrderPart.serialMask.length) shouldSubmit = true;
      }
      if (shouldSubmit) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => handleSerialScan(null), 200);
      }
      return () => { if (timerRef.current) clearTimeout(timerRef.current); }
  }, [serialInput]);

  const handleSerialScan = async (e: React.FormEvent | null) => {
    if (e) e.preventDefault();
    if (!serialInput.trim()) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    showLoading("Procesando...");
    try {
      if (operation.isInitial) await processInitialOp(serialInput.trim());
      else if (operation.isFinal) await processFinalOp(serialInput.trim());
      else await processStandardOp(serialInput.trim());
    } catch (err: any) {
      showAlert("Error", err.message, "error");
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
        hideLoading();
        setSerialInput('');
        inputRef.current?.focus();
    }
  };

  const processInitialOp = async (serial: string) => {
    if (!activeOrder || !activeOrderPart) throw new Error("No hay orden activa.");
    if (scannedCount >= activeOrder.quantity) throw new Error("Orden completada.");
    const regexStr = '^' + activeOrderPart.serialMask.replace(/#/g, '\\d') + '$';
    if (!new RegExp(regexStr).test(serial)) throw new Error("Formato inválido.");

    await db.saveSerial({
      serialNumber: serial, orderNumber: activeOrder.orderNumber, partNumberId: activeOrder.partNumberId, currentOperationId: operation.id, isComplete: false,
      history: [{ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() }], printHistory: []
    });

    if (activeOrderPart.serialGenType === 'PCB_SERIAL') {
        try {
             await db.printLabel(serial, activeOrderPart.partNumber, {
                 sku: activeOrderPart.productCode,
                 quantity: 1,
                 excludeLabelTypes: ['NAMEPLATE'], 
                 jobDescription: `Initial Serial ${serial}`
             });
        } catch (e) {
            console.error("Auto-print error", e);
        }
    }

    setStatusMsg({ type: 'success', text: `Serial ${serial} OK` });
  };

  const processStandardOp = async (serial: string) => {
    const unit = await db.getSerial(serial);
    if (!unit) throw new Error("Serial no existe.");
    if (activeOrder && unit.orderNumber !== activeOrder.orderNumber) throw new Error("Serial pertenece a otra orden.");
    
    unit.currentOperationId = operation.id;
    unit.history.push({ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() });
    await db.saveSerial(unit);
    setStatusMsg({ type: 'success', text: `${serial} OK` });
  };

  const processFinalOp = async (serial: string) => {
    const unit = await db.getSerial(serial);
    if (!unit) throw new Error("Serial no encontrado.");
    if (activeOrder && unit.orderNumber !== activeOrder.orderNumber) throw new Error("Serial pertenece a otra orden.");

    const parts = await db.getParts();
    const part = parts.find(p => p.id === unit.partNumberId);
    unit.currentOperationId = operation.id; unit.isComplete = true;
    unit.history.push({ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() });
    await db.saveSerial(unit);
    try {
        await db.printLabel(serial, part?.partNumber || "UNKNOWN", { 
            jobDescription: `Empaque ${serial}`, 
            sku: part?.productCode,
            excludeLabelTypes: ['CARTON1', 'CARTON2'] 
        });
        setStatusMsg({ type: 'success', text: `Etiqueta generada ${serial}` });
    } catch (e: any) {
        setStatusMsg({ type: 'success', text: `${serial} OK (Fallo Impresión)` });
    }
  };

  const isOrderComplete = activeOrder && scannedCount >= activeOrder.quantity;
  const isLotBased = activeOrderPart?.serialGenType === 'LOT_BASED';

  // --- RENDER ---
  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="flex items-center">
            <div className={`p-2 rounded-lg mr-4 ${operation.isInitial ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {operation.isFinal ? <Box size={24} /> : <Scan size={24} />}
            </div>
            <div>
                <h2 className="text-xl font-bold text-slate-800">{operation.name}</h2>
                <p className="text-sm text-slate-500">Operador: <span className="font-medium text-slate-700">{user.name}</span></p>
            </div>
        </div>
        
        <div className="text-right mx-4 hidden md:block">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ruta de Proceso</p>
            <p className="font-bold text-slate-800 flex items-center justify-end">
                <GitMerge size={14} className="mr-1 text-blue-600"/> {route.name}
            </p>
        </div>

        <button onClick={onBack} className="flex items-center px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
            <ArrowLeft size={16} className="mr-2" /> Cambiar Estación
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-2xl shadow-lg flex flex-col justify-center items-center border border-blue-50 relative overflow-hidden">
          <div className="w-full max-w-md z-10">
            
            {operation.isInitial && !activeOrder ? (
                <div className="w-full animate-in fade-in zoom-in duration-300">
                    <h3 className="text-lg font-bold text-slate-700 mb-6 flex items-center justify-center"><PlayCircle className="mr-2 text-blue-600"/> Setup de Orden</h3>
                    <div className={`mb-4 transition-opacity ${setupStep === 1 ? 'opacity-100' : 'opacity-50'}`}>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">1. Escanear Orden SAP</label>
                        <div className="relative"><input autoFocus={setupStep === 1} value={sapOrderInput} onChange={e => { if(e.target.value.length <= 10) setSapOrderInput(e.target.value); }} disabled={setupStep !== 1} className="w-full pl-4 pr-10 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 text-lg tracking-widest" placeholder="0000000000"/>{sapOrderInput.length === 10 && <CheckCircle className="absolute right-3 top-3.5 text-green-500" size={20}/>}</div>
                    </div>
                    <div className={`mb-4 transition-opacity ${setupStep === 2 ? 'opacity-100' : 'opacity-50'}`}>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">2. Cantidad</label>
                        <input ref={qtyRef} type="number" value={qtyInput} onChange={e => setQtyInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if(qtyInput) setSetupStep(3); } }} disabled={setupStep !== 2} className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 text-lg" placeholder="0"/>
                    </div>
                    <div className={`mb-4 transition-opacity ${setupStep === 3 ? 'opacity-100' : 'opacity-50'}`}>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">3. Escanear Modelo</label>
                        <input ref={modelRef} value={modelInput} onChange={e => setModelInput(e.target.value)} disabled={setupStep !== 3} className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 text-lg uppercase" placeholder="Ej. LT-SEN-R3"/>
                    </div>
                </div>
            ) : !activeOrder ? (
                <div className="w-full animate-in fade-in zoom-in duration-300">
                     <h3 className="text-lg font-bold text-slate-700 mb-6 flex items-center justify-center"><RefreshCw className="mr-2 text-blue-600"/> Resumir Trabajo</h3>
                     <form onSubmit={handleScanContext}>
                         <div className="mb-4">
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Escanear Orden SAP o Charola</label>
                             <div className="relative">
                                 <Scan className="absolute left-4 top-3.5 text-slate-400" />
                                 <input autoFocus value={contextInput} onChange={e => setContextInput(e.target.value)} className="w-full pl-12 pr-4 py-3 text-lg border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none transition-all font-mono" placeholder="Orden SAP / Charola"/>
                             </div>
                         </div>
                     </form>
                </div>
            ) : (
                <div className="w-full animate-in fade-in zoom-in duration-300">
                    <div className="flex justify-between items-baseline mb-2">
                        <label className="block text-sm font-bold text-slate-600 uppercase tracking-wider">
                            {isLotBased ? "Escaneo por Charola" : activeOrderPart?.serialGenType === 'ACCESSORIES' ? "Accesorios (Lotes)" : "Escanear Serial"}
                        </label>
                        {activeOrder && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">Lote: {activeOrder.orderNumber}</span>}
                    </div>

                    {operation.isInitial && isOrderComplete ? (
                         <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                             <CheckCircle className="mx-auto text-green-500 mb-3" size={32}/>
                             <h4 className="text-lg font-bold text-blue-800 mb-2">Orden Completada en esta Estación</h4>
                             <p className="text-sm text-slate-600 mb-4">Todas las unidades ({scannedCount}) han sido procesadas.</p>
                             
                             <div className="grid grid-cols-2 gap-3">
                                {activeOrderPart?.serialGenType !== 'LOT_BASED' && (
                                  <button onClick={() => setIsReprinting(true)} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 flex items-center justify-center">
                                      <Printer size={16} className="mr-2"/> Re-Imprimir
                                  </button>
                                )}
                                <button onClick={() => { setActiveOrder(null); setSapOrderInput(''); setQtyInput(''); setModelInput(''); setSetupStep(1); }} className={`px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow flex items-center justify-center ${activeOrderPart?.serialGenType === 'LOT_BASED' ? 'col-span-2' : ''}`}>
                                    <LogOut size={16} className="mr-2"/> Cerrar Orden
                                </button>
                             </div>
                         </div>
                    ) : (
                        isLotBased ? (
                            operation.isInitial ? (
                                <div className="space-y-4">
                                    {!trayGenerated ? (
                                        <form onSubmit={handleScanTrayInitial}>
                                            <div className="relative group">
                                                <Layers className="absolute left-4 top-3.5 text-slate-400" />
                                                <input autoFocus value={trayInput} onChange={e => setTrayInput(e.target.value)} className="w-full pl-12 pr-4 py-3 text-lg border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none transition-all font-mono" placeholder="Escanear Charola (Tray ID)"/>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-2 text-center">Escanea la charola para generar lotes (Max 100/Tray).</p>
                                        </form>
                                    ) : (
                                        <div className="text-center bg-green-50 p-6 rounded-xl border border-green-100 animate-in fade-in slide-in-from-bottom-2">
                                            <CheckCircle size={40} className="text-green-500 mx-auto mb-2"/>
                                            <p className="font-bold text-green-800 mb-4 uppercase tracking-wide">Charola Generada</p>
                                            <div className="grid grid-cols-1 gap-3">
                                                <button onClick={handleDownloadCsvAgain} className="w-full py-3 bg-white border-2 border-blue-200 text-blue-700 rounded-lg font-bold shadow-sm hover:bg-blue-50 flex items-center justify-center transition-colors">
                                                    <Download size={18} className="mr-2"/> Descargar CSV Nuevamente
                                                </button>
                                                <button onClick={handleFinishTrayInitial} className="w-full py-3 bg-green-600 text-white rounded-lg font-bold shadow-lg hover:bg-green-700 flex items-center justify-center transition-colors">
                                                    <CheckCircle size={18} className="mr-2"/> Confirmar y Liberar Charola
                                                </button>
                                            </div>
                                        </div>
                                    )
                                }
                                </div>
                            ) : (
                                activeTrayId ? (
                                    <div className="text-center">
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="font-bold text-lg">Charola: {activeTrayId}</h4>
                                            {!operation.isFinal && !trayIsFinished && (
                                                <button onClick={handleSelectAllTray} className="text-xs flex items-center bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 border border-blue-200 font-bold">
                                                    {selectAll ? <CheckSquare size={14} className="mr-1"/> : <Square size={14} className="mr-1"/>}
                                                    Marcar Todo PASS
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-10 gap-1 mb-4 max-h-[300px] overflow-y-auto p-2 bg-slate-50 rounded border">
                                            {traySerials.map((s, idx) => {
                                                const processed = s.isComplete || s.history.some(h => h.operationId === operation.id);
                                                return (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => !operation.isFinal && !trayIsFinished && handleToggleTrayUnit(s)}
                                                        className={`w-6 h-6 text-[8px] flex items-center justify-center rounded cursor-pointer border ${processed ? 'bg-green-500 text-white border-green-600' : 'bg-gray-200 text-gray-500 border-gray-300 hover:bg-gray-300'}`}
                                                        title={s.serialNumber}
                                                    >
                                                        {idx + 1}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                        {operation.isFinal ? (
                                            trayIsFinished ? (
                                                <button onClick={() => setIsSuffixReprinting(true)} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 flex items-center justify-center">
                                                    <Printer className="mr-2"/> Re-imprimir Etiqueta
                                                </button>
                                            ) : (
                                                <button onClick={handleProcessTrayFinal} className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold shadow-lg hover:bg-slate-800 flex items-center justify-center">
                                                    <Printer className="mr-2"/> Procesar Charola e Imprimir
                                                </button>
                                            )
                                        ) : (
                                            <div className="flex gap-2">
                                                 <button onClick={() => { setActiveTrayId(null); setTraySerials([]); setSelectAll(false); setTrayIsFinished(false); }} className="flex-1 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
                                                 <button 
                                                    onClick={handleFinishTrayProcessing} 
                                                    disabled={!trayIsFinished && traySerials.filter(s => s.history.some(h => h.operationId === operation.id)).length < traySerials.length}
                                                    className="flex-1 py-2 bg-green-600 text-white rounded-lg font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700"
                                                 >
                                                     {trayIsFinished ? "Cerrar Vista" : "Terminar / Siguiente"}
                                                 </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <form onSubmit={handleScanTrayProcessing}>
                                        <div className="relative group">
                                            <Layers className="absolute left-4 top-3.5 text-slate-400" />
                                            <input autoFocus value={trayInput} onChange={e => setTrayInput(e.target.value)} className="w-full pl-12 pr-4 py-3 text-lg border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none transition-all font-mono" placeholder="Escanear Charola para Procesar"/>
                                        </div>
                                    </form>
                                )
                            )
                        ) : activeOrderPart?.serialGenType === 'ACCESSORIES' ? (
                            <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-200">
                                <h4 className="font-bold text-slate-700 text-lg">Lote de Accesorios Generado</h4>
                                <div className="grid grid-cols-2 gap-4 mt-6">
                                    <button onClick={() => setIsReprinting(true)} className="flex items-center justify-center px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-semibold shadow-sm"><Printer size={16} className="mr-2"/> Re-Impresión</button>
                                    <button onClick={handleFinishAccessories} className="flex items-center justify-center px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-bold shadow-lg"><CheckCircle size={16} className="mr-2"/> Finalizar</button>
                                </div>
                            </div>
                        ) : (
                            <div className="relative group">
                                <Scan className="absolute left-4 top-3.5 text-slate-400" />
                                <input ref={inputRef} autoFocus value={serialInput} onChange={e => setSerialInput(e.target.value)} className="w-full pl-12 pr-4 py-3 text-lg border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none transition-all font-mono" placeholder="Escanear Serial..."/>
                            </div>
                        )
                    )}
                </div>
            )}
            
            {statusMsg && (
                <div className={`mt-6 w-full p-3 rounded-lg flex items-center justify-center shadow-sm animate-in fade-in ${statusMsg.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : statusMsg.type === 'error' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
                  <span className="font-bold">{statusMsg.text}</span>
                </div>
            )}
          </div>
        </div>

        {/* INFO SIDEBAR */}
        <div className="flex flex-col gap-4">
             {activeOrder ? (
                 <>
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div><p className="text-xs text-slate-400 font-bold uppercase">Orden SAP</p><p className="text-xl font-mono font-bold text-slate-800">{activeOrder.sapOrderNumber || 'N/A'}</p></div>
                            <div className="text-right"><p className="text-xs text-slate-400 font-bold uppercase">Progreso</p><p className="text-xl font-bold text-blue-600">{scannedCount} / {activeOrder.quantity}</p></div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 mb-4 relative z-10"><div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{width: `${Math.min((scannedCount/activeOrder.quantity)*100, 100)}%`}}></div></div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm space-y-2 relative z-10">
                            <div className="flex justify-between"><span className="text-slate-500">Modelo:</span><span className="font-medium">{activeOrderPart?.productCode}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Tipo Serial:</span><span className="font-mono text-xs bg-slate-200 px-1 rounded">{activeOrderPart?.serialGenType}</span></div>
                        </div>
                        
                        <button onClick={handleChangeContext} className="mt-4 w-full flex items-center justify-center text-xs text-red-500 border border-red-200 p-2 rounded hover:bg-red-50 relative z-10">
                            <LogOut size={12} className="mr-1"/> Cerrar Orden / Cambiar
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700 text-sm flex items-center">
                            <List size={16} className="mr-2 text-slate-400"/>
                            {isLotBased ? "Progreso por Charola" : "Unidades Procesadas"}
                        </div>
                        <div className="overflow-y-auto p-4 space-y-3 flex-1">
                            {isLotBased ? (
                                <TrayProgressSummary serials={allOrderSerials} allOps={allOps} />
                            ) : (
                                <SerialProgressList serials={allOrderSerials} />
                            )}
                        </div>
                    </div>
                 </>
             ) : (
                 <div className="bg-slate-50 border border-dashed border-slate-300 p-8 rounded-2xl text-center text-slate-400">
                     <Info className="mx-auto mb-2 opacity-50"/>
                     <p>Escanee una Orden SAP para activar el contexto de trabajo.</p>
                 </div>
             )}
        </div>
      </div>

      {isReprinting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm animate-in zoom-in-95">
                <h3 className="text-lg font-bold mb-4 flex items-center"><Printer className="mr-2"/> Re-Impresión</h3>
                <input type="number" className="w-full p-3 border rounded-lg text-lg mb-4 text-center font-bold" value={reprintQty} onChange={e => setReprintQty(Number(e.target.value))} min={1} />
                <div className="flex gap-2"><button onClick={() => setIsReprinting(false)} className="flex-1 py-2 bg-slate-100 rounded-lg">Cancelar</button><button onClick={handleReprint} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold">Imprimir</button></div>
            </div>
        </div>
      )}

      {isSuffixReprinting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
             <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm animate-in zoom-in-95">
                <h3 className="text-lg font-bold mb-4 flex items-center"><Printer className="mr-2 text-purple-600"/> Re-imprimir Serial</h3>
                <p className="text-sm text-slate-500 mb-3 text-center">Ingrese los últimos 3 dígitos del serial a reimprimir (Ej. 003)</p>
                <div className="relative mb-4">
                    <Hash className="absolute left-3 top-3 text-slate-400" size={20} />
                    <input 
                        type="text" 
                        maxLength={3}
                        autoFocus
                        className="w-full pl-10 pr-4 p-3 border rounded-lg text-xl font-mono text-center font-bold tracking-widest uppercase" 
                        value={reprintSuffix} 
                        onChange={e => setReprintSuffix(e.target.value)} 
                        placeholder="000"
                    />
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { setIsSuffixReprinting(false); setReprintSuffix(''); }} className="flex-1 py-2 bg-slate-100 rounded-lg text-sm font-bold text-slate-600">Cancelar</button>
                    <button onClick={handleReprintSuffix} className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-bold shadow hover:bg-purple-700">Reimprimir</button>
                </div>
             </div>
        </div>
      )}

    </div>
  );
}

function TrayProgressSummary({ serials, allOps }: { serials: SerialUnit[], allOps: Operation[] }) {
    const groups: Record<string, SerialUnit[]> = {};
    serials.forEach(s => {
        if(s.trayId) {
            if(!groups[s.trayId]) groups[s.trayId] = [];
            groups[s.trayId].push(s);
        }
    });

    const trayIds = Object.keys(groups).sort();
    if (trayIds.length === 0) return <p className="text-xs text-slate-400 italic text-center">No hay charolas generadas.</p>;

    return (
        <>
            {trayIds.map(tid => {
                const units = groups[tid];
                const total = units.length;
                const completed = units.filter(u => u.isComplete).length;
                const locCounts: Record<string, number> = {};
                units.forEach(u => {
                    const op = u.currentOperationId;
                    locCounts[op] = (locCounts[op] || 0) + 1;
                });
                const mainOpId = Object.keys(locCounts).sort((a,b) => locCounts[b] - locCounts[a])[0];
                const opName = allOps.find(o => o.id === mainOpId)?.name || 'Iniciando';

                return (
                    <div key={tid} className="p-3 border rounded-lg text-sm bg-white shadow-sm">
                        <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-slate-700">Charola: {tid}</span>
                            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-mono">{total} pzas</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                             <span className={`font-semibold ${completed === total ? 'text-green-600' : 'text-blue-600'}`}>{opName}</span>
                             <span>{completed === total ? 'Completado' : 'En Proceso'}</span>
                        </div>
                        <div className="w-full h-1 bg-slate-100 mt-2 rounded-full overflow-hidden">
                             <div className="bg-green-500 h-full" style={{width: `${(completed/total)*100}%`}}></div>
                        </div>
                    </div>
                );
            })}
        </>
    );
}

function SerialProgressList({ serials }: { serials: SerialUnit[] }) {
    if (serials.length === 0) return <p className="text-xs text-slate-400 italic text-center">Sin actividad.</p>;
    const recent = [...serials].sort((a,b) => {
        const lastA = a.history[a.history.length-1]?.timestamp || '';
        const lastB = b.history[b.history.length-1]?.timestamp || '';
        return lastB.localeCompare(lastA);
    }).slice(0, 20);
    return (
        <div className="space-y-2">
            {recent.map(s => (
                <div key={s.serialNumber} className="flex justify-between items-center p-2 border-b border-slate-50 text-xs">
                    <span className="font-mono text-slate-600">{s.serialNumber}</span>
                    {s.isComplete ? <CheckCircle size={14} className="text-green-500"/> : <span className="text-blue-500 font-bold">...</span>}
                </div>
            ))}
        </div>
    )
}
