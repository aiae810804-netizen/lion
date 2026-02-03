import React, { useState, useEffect, useRef, useContext } from 'react';
import { db } from '../../services/storage';
import { Operation, WorkOrder, SerialUnit, PartNumber, ProcessRoute } from '../../types';
import { AuthContext } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { Scan, CheckCircle, AlertTriangle, Printer, Box, ArrowLeft, Lock, Info, PlayCircle, PlusSquare, ArrowRight, GitMerge, ChevronRight, X, RefreshCw, FileDown, Layers, LogOut, CheckSquare, Square, List, Hash, Download } from 'lucide-react';
import RouteSelector from './components/RouteSelector';
import OperationSelector from './components/OperationSelector';
import useRoutes from './hooks/useRoutes';
import useOperations from './hooks/useOperations';

export default function OperatorStation() {
  const { user } = useContext(AuthContext);
  const { showAlert, showLoading, hideLoading } = useAlert();
  const [selectedRoute, setSelectedRoute] = useState<ProcessRoute | null>(null);
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  
  // useRoutes hook loads routes
  const { routes, setRoutes } = useRoutes();
  const [allOperations, setAllOperations] = useState<Operation[]>([]); // Raw list for mapping
  // useOperations provides filtered ops (simple wrapper)
  const { operations, setOperations } = useOperations(selectedRoute?.id || null, allOperations);

  useEffect(() => {
    // Load all operations on mount (routes loaded by hook)
    const loadOps = async () => {
      const o = await db.getOperations();
      setAllOperations(o);
    }
    loadOps();
  }, []);

  // Filter operations when route is selected
  useEffect(() => {
      if (selectedRoute) {
          const routeOps: Operation[] = [];
          selectedRoute.steps.forEach(step => {
             const op = allOperations.find(o => o.id === step.operationId);
             if (op) routeOps.push(op);
          });
          setOperations(routeOps);
      } else {
          setOperations([]);
      }
  }, [selectedRoute, allOperations, setOperations]);

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
      return <RouteSelector routes={routes} onSelectRoute={handleSelectRoute} />
  }

  // SCREEN 2: OPERATION SELECTION
  if (!selectedOp) {
    return <OperationSelector operations={operations} onSelectOp={handleSelectOp} onBack={handleBackToRoutes} route={selectedRoute} />
  }

  // SCREEN 3: WORKSTATION
  return <StationInterface operation={selectedOp} route={selectedRoute} onBack={handleBackToOps} user={user!} />;
}

import OrderProgress from './components/OrderProgress';

// --- ACTUAL SCANNING INTERFACE ---

interface StationProps {
  operation: Operation;
  route: ProcessRoute;
  onBack: () => void;
  user: { id: string; name: string };
}

function StationInterface({ operation, route, onBack, user }: StationProps) {
  const { showLoading, hideLoading, showAlert, showConfirm } = useAlert();

  // Global State
  const [activeOrders, setActiveOrders] = useState<WorkOrder[] | null>(null);
  const [activeParts, setActiveParts] = useState<PartNumber[]>([]);
  const [allOrderSerials, setAllOrderSerials] = useState<SerialUnit[]>([]); // For summary
  
  // Scanning State
  const [serialInput, setSerialInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  // Resume Context (SAP Order Scan or Tray Scan)
  const [contextInput, setContextInput] = useState('');

  // Initial Station - Order Creation State
  const [sapOrderInput, setSapOrderInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1); // 1: SAP, 2: Qty, 3: Model
  // Add qtyError state for quantity validation
  const [qtyError, setQtyError] = useState<string | null>(null);
  
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

  // Update serials for all active orders
  useEffect(() => {
    if (activeOrders && activeOrders.length > 0) {
        // Refresh Order Summary context
        db.getSerials().then(serials => {
             const relevant = serials.filter(s => activeOrders.some(o => o.orderNumber === s.orderNumber));
             setAllOrderSerials(relevant);
             // scannedCount is no longer a single value. Each OrderProgress component calculates its own count.
        });
    } else {
        setAllOrderSerials([]);
    }
  }, [activeOrders, statusMsg, trayGenerated]);

  // --- SMART AUTO-ENTER LOGIC FOR ORDER SETUP (INITIAL) ---
  useEffect(() => {
    if (operation.isInitial && !activeOrders && sapOrderInput.length === 10) {
      validateAndProceedSAP(sapOrderInput);
    }
  }, [sapOrderInput, operation.isInitial, activeOrders]);

  const validateAndProceedSAP = async (sapOrder: string) => {
    showLoading("Validando Orden SAP...");
    try {
      const allWorkOrders = await db.getOrders();
      let matchingOrders = allWorkOrders.filter(wo => wo.sapOrderNumber === sapOrder);

      if (matchingOrders.length > 0) {
        matchingOrders = matchingOrders.filter(o => o.status !== 'CLOSED');
        
        if (matchingOrders.length === 0) {
            throw new Error("Esta orden SAP ya está CERRADA.");
        }

        const allParts = await db.getParts();
        const orderParts = await Promise.all(
            matchingOrders.map(order => allParts.find(p => p.id === order.partNumberId))
        );

        for (const part of orderParts) {
            if (part && part.processRouteId && part.processRouteId !== route.id) {
                throw new Error(`Error de Ruta: El modelo ${part.productCode} pertenece a otra ruta. Regrese y seleccione la ruta correcta.`);
            }
        }
        
        const allSerials = await db.getSerials();
        const orderSerials = allSerials.filter(s => matchingOrders.some(o => o.orderNumber === s.orderNumber));
        
        setActiveOrders(matchingOrders);
        setActiveParts(orderParts.filter(p => p) as PartNumber[]);
        setAllOrderSerials(orderSerials);
        
        // For single-order cases, populate the setup form for context
        if (matchingOrders.length === 1) {
            setQtyInput(matchingOrders[0].quantity.toString());
            setModelInput(orderParts[0]?.productCode || '');
        }

        setStatusMsg({ type: 'success', text: `Orden SAP existente con ${matchingOrders.length} lote(s). Resumiendo proceso...` });
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
          const allOrders = await db.getOrders();
          const allParts = await db.getParts();
          const allSerials = await db.getSerials();
          
          let matchingOrders = allOrders.filter(o => o.sapOrderNumber === inputVal && o.status === 'OPEN');
          let fromTray = false;
          let trayIdFound = '';

          // If NOT found by SAP Order, check if it's a TRAY ID
          if (matchingOrders.length === 0) {
             const traySerials = await db.getSerialsByTray(inputVal);
             if (traySerials.length > 0) {
                 const orderNumbersInTray = [...new Set(traySerials.map(s => s.orderNumber))];
                 const potentialOrders = allOrders.filter(o => orderNumbersInTray.includes(o.orderNumber) && o.status === 'OPEN');
                 
                 if (potentialOrders.length > 0) {
                     // We assume all orders in a tray belong to the same SAP order.
                     // Let's take the SAP order from the first one and load all associated open lots.
                     const sapOrderForTray = potentialOrders[0].sapOrderNumber;
                     matchingOrders = allOrders.filter(o => o.sapOrderNumber === sapOrderForTray && o.status === 'OPEN');
                     fromTray = true;
                     trayIdFound = inputVal;
                 }
             }
          }
          
          if (matchingOrders.length === 0) throw new Error("Orden SAP no encontrada, cerrada, o Charola no válida.");
          
          const matchingParts = matchingOrders.map(order => allParts.find(p => p.id === order.partNumberId)).filter(p => p) as PartNumber[];
          
          // STRICT ROUTE VALIDATION
          for (const part of matchingParts) {
              if (part.processRouteId && part.processRouteId !== route.id) {
                   throw new Error(`Error de Ruta: El modelo ${part.productCode} no se puede correr en esta ruta.`);
              }
          }

          const orderSerials = allSerials.filter(s => matchingOrders.some(o => o.orderNumber === s.orderNumber));
          setAllOrderSerials(orderSerials);
          
          setActiveOrders(matchingOrders);
          setActiveParts(matchingParts);
          setContextInput('');

          if (fromTray) {
              setStatusMsg({ type: 'success', text: "Charola detectada. Contexto cargado." });
              const traySerials = await db.getSerialsByTray(trayIdFound);
              const firstPartId = traySerials.length > 0 ? traySerials[0].partNumberId : null;
              const partForTray = matchingParts.find(p => p.id === firstPartId);

              if (partForTray) {
                  processLoadedTray(traySerials.filter(s => matchingOrders.some(o => o.orderNumber === s.orderNumber)), trayIdFound, partForTray, route);
              } else if (traySerials.length > 0) {
                   throw new Error("No se encontró el número de parte para la charola.");
              }
          } else {
               setStatusMsg({ type: 'success', text: `Orden cargada con ${matchingOrders.length} lotes. Proceda.` });
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

  const handleFinishSetup = async () => {
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

                  setActiveOrders([order]);
                  if(part) setActiveParts([part]);
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
      if (!activeOrders || activeOrders.length !== 1 || !activeParts || activeParts.length !== 1) return;
      const order = activeOrders[0];
      const part = activeParts[0];
      showLoading("Enviando a impresora...");
      try {
          await db.printLabel(order.orderNumber, part.partNumber, {
              sku: part.productCode, quantity: reprintQty, excludeLabelTypes: ['NAMEPLATE'], jobDescription: `Reprint ${order.orderNumber}`
          });
          showAlert("Éxito", "Reimpresión enviada correctamente.", "success");
          setIsReprinting(false); setReprintQty(1);
      } catch (e: any) { showAlert("Error", e.message, "error"); } finally { hideLoading(); }
  };

  // --- SPECIFIC SUFFIX REPRINT LOGIC (For Lot Based in Empaque) ---
  const handleReprintSuffix = async () => {
      if (!reprintSuffix || !activeOrders || activeOrders.length !== 1 || !activeParts || activeParts.length !== 1) return;
      const part = activeParts[0];

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

          await db.printLabel(match.serialNumber, part.partNumber, {
              sku: part.productCode,
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

  // --- HANDLER: Reimpresión de Lote (por sufijo) ---
  const handleLotReprint = async () => {
    if (!lotReprintSuffix || lotReprintSuffix.length !== 3 || !activeOrders || activeOrders.length !== 1 || !activeParts || activeParts.length !== 1) return;
    const part = activeParts[0];
    showLoading("Buscando serial...");
    try {
      const match = traySerials.find(s => s.serialNumber.endsWith(`-${lotReprintSuffix}M`));
      if (!match) {
        throw new Error(`Serial con terminación ...-${lotReprintSuffix}M no encontrado en esta charola.`);
      }
      await db.printLabel(match.serialNumber, part.partNumber, {
        sku: part.productCode,
        jobDescription: `Reprint Single ${match.serialNumber}`,
        excludeLabelTypes: ['CARTON1', 'CARTON2']
      });
      showAlert("Éxito", `Reimpresión enviada para ${match.serialNumber}", "success`);
    } catch (e: any) {
      showAlert("Error", e.message, "error");
    } finally {
      hideLoading();
    }
  };

  // --- HANDLER: Reimpresión de Accesorios ---
  const handleAccessoryReprint = async () => {
    if (!activeOrders || activeOrders.length !== 1 || !activeParts || activeParts.length !== 1) return;
    const order = activeOrders[0];
    const part = activeParts[0];
    showLoading("Enviando a impresora...");
    try {
      await db.printLabel(order.orderNumber, part.partNumber, {
        sku: part.productCode,
        quantity: accessoryReprintQty,
        excludeLabelTypes: ['NAMEPLATE'],
        jobDescription: `Reprint ${order.orderNumber}`
      });
      showAlert("Éxito", "Reimpresión enviada correctamente.", "success");
    } catch (e: any) {
      showAlert("Error", e.message, "error");
    } finally {
      hideLoading();
    }
  };

  // --- TRAY GENERATION (INITIAL) ---
  const handleScanTrayInitial = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!trayInput || !activeOrders || activeOrders.length !== 1 || !activeParts || activeParts.length !== 1) return;
      const order = activeOrders[0];
      const part = activeParts[0];
      
      const serialsForOrder = allOrderSerials.filter(s => s.orderNumber === order.orderNumber);
      const remaining = order.quantity - serialsForOrder.length;
      
      if (remaining <= 0) {
          showAlert("Orden Completa", "La orden ya ha alcanzado la cantidad requerida.", "info");
          setTrayInput('');
          return;
      }

      const quantityToGenerate = Math.min(100, remaining);

      showLoading(`Generando ${quantityToGenerate} Seriales...`);
      try {
          const res = await db.generateBatchSerials({
              orderNumber: order.orderNumber,
              partNumberId: part.id,
              currentOperationId: operation.id,
              trayId: trayInput,
              operatorId: user.id,
              quantity: quantityToGenerate
          });

          if (res.success) {
              // GENERATE CSV WITH TIMESTAMP
              const timestamp = new Date().toISOString().replace(/[:T-]/g, '').slice(0, 14); 
              const filename = `${sapOrderInput}_CHAROLA_${trayInput}_${order.orderNumber}.csv`;
              const csvContent = "PN,SKU,SERIAL\n" + res.serials.map(s => `${part.partNumber},${part.productCode},${s.serialNumber}`).join("\n");
              
              setLastCsvData({ content: csvContent, filename: filename });
              
              downloadCsv(csvContent, filename);
              
              setStatusMsg({ type: 'success', text: `Charola ${trayInput} generada con ${quantityToGenerate} unidades.` });
              setTrayInput('');
              setTrayGenerated(true); 
              setTrayIsFinished(false);
              
              // This will trigger the useEffect to refresh serials
              const updatedSerials = await db.getSerials();
              setAllOrderSerials(updatedSerials.filter(s => activeOrders.some(o => o.orderNumber === s.orderNumber)));
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
      if (!trayInput || !activeOrders || activeOrders.length !== 1 || !activeParts || activeParts.length !== 1) return;
      const order = activeOrders[0];
      const part = activeParts[0];

      showLoading("Cargando Charola...");
      try {
          const allSerials = await db.getSerialsByTray(trayInput);
          let serials = allSerials.filter(s => s.orderNumber === order.orderNumber);
          
          if (serials.length === 0) throw new Error("Charola no contiene unidades activas para esta orden.");
          
          processLoadedTray(serials, trayInput, part, route);

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

      if (!activeTrayId || traySerials.length === 0 || !activeOrders) return;
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
          setAllOrderSerials(all.filter(s => activeOrders.some(o => o.orderNumber === s.orderNumber)));

      } catch (e: any) {
          showAlert("Error", e.message, "error");
      } finally { hideLoading(); }
  };

  const handleFinishAccessories = async () => {
      if (!activeOrders || activeOrders.length !== 1 || !activeParts || activeParts.length !== 1) return;
      const order = activeOrders[0];
      const part = activeParts[0];

      showLoading("Registrando y cerrando orden...");
      try {
          await db.generateBatchSerials({
              orderNumber: order.orderNumber,
              partNumberId: part.id,
              currentOperationId: operation.id,
              operatorId: user.id,
              quantity: order.quantity, 
              autoComplete: true 
          });

          // Explicitly close the order
          const updatedOrder = { ...order, status: 'CLOSED' as 'CLOSED' };
          // @ts-ignore
          await db.updateOrder(updatedOrder);
          
          showAlert("Orden Completada", "La orden de accesorios ha sido registrada y cerrada correctamente.", "success");
          
          // Reset the UI
          closeOrderAndReset();
      } catch (e: any) {
          showAlert("Error", "Error al finalizar orden de accesorios: " + e.message, "error");
      } finally {
          hideLoading();
      }
  };

  // --- HANDLER: Cerrar orden y resetear UI ---
  const closeOrderAndReset = () => {
    setActiveOrders(null);
    setActiveParts([]);
    setAllOrderSerials([]);
    setTraySerials([]);
    setActiveTrayId(null);
    setTrayGenerated(false);
    setTrayIsFinished(false);
    setStatusMsg(null);
    setContextInput('');
    setSerialInput('');
    setLastCsvData(null);
    setSelectAll(false);
  };

  const handleChangeContext = () => {
      setActiveOrders(null);
      setActiveParts([]);
      setActiveTrayId(null);
      setTraySerials([]);
      setContextInput('');
  }

  // --- STANDARD SCAN LOGIC ---
  useEffect(() => {
      if (!serialInput) return;
      let shouldSubmit = false;
      if (activeParts.length > 0) {
          for (const part of activeParts) {
              if (part.serialMask && (serialInput.length === part.serialMask.length || serialInput.length === part.serialMask.length + 1)) {
                  shouldSubmit = true;
                  break;
              }
          }
      }
      if (shouldSubmit) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => handleSerialScan(null), 200);
      }
      return () => { if (timerRef.current) clearTimeout(timerRef.current); }
  }, [serialInput, activeParts]);

  const handleSerialScan = async (e: React.FormEvent | null) => {
    if (e) e.preventDefault();
    const serial = serialInput.trim();
    if (!serial) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    showLoading("Procesando...");
    try {
        if (!activeOrders || activeOrders.length === 0) throw new Error("No hay orden activa.");

        // Find matching part and order by serial mask
        let targetPart: PartNumber | null = null;
        let targetOrder: WorkOrder | null = null;
        const cleanedSerial = serial.replace(/([A-Za-z])$/, "");

        for (const part of activeParts) {
            // Make sure mask is not empty and is a string
            if (part.serialMask && typeof part.serialMask === 'string') {
                 const regex = new RegExp('^' + part.serialMask.replace(/#/g, '\\d') + '$');
                 if (regex.test(cleanedSerial)) {
                    targetPart = part;
                    break;
                }
            }
        }
        
        if (targetPart) {
            targetOrder = activeOrders.find(o => o.partNumberId === targetPart!.id) || null;
        }

        if (!targetOrder || !targetPart) {
            throw new Error(`Serial ${serial} no corresponde a ningún modelo en la orden activa.`);
        }

      let testLog: { serialNumber: string, fechaRegistro: string, sensorFW: string } | null = null;
      if (operation.requireTestLog && targetPart.serialGenType === 'PCB_SERIAL') {
        testLog = await db.getTestLogBySerial(serial);
        if (!testLog) {
          throw new Error("El número de serie no ha sido probado o no ha pasado la prueba funcional.");
        }
      }

      const existingSerial = await db.getSerial(serial);
      if (existingSerial && existingSerial.orderNumber !== targetOrder.orderNumber) {
        throw new Error("El número de serie ya está ligado a otra orden.");
      }

      if (operation.isInitial) await processInitialOp(serial, targetOrder, targetPart, testLog);
      else if (operation.isFinal) await processFinalOp(serial, targetOrder, targetPart);
      else await processStandardOp(serial, targetOrder, targetPart);

    } catch (err: any) {
      showAlert("Error", err.message, "error");
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
        hideLoading();
        setSerialInput('');
        inputRef.current?.focus();
    }
  };

  const processInitialOp = async (serial: string, order: WorkOrder, part: PartNumber, testLog?: { serialNumber: string, fechaRegistro: string, sensorFW: string }) => {
    const serialsForOrder = allOrderSerials.filter(s => s.orderNumber === order.orderNumber);
    if (serialsForOrder.length >= order.quantity) throw new Error(`Orden para ${part.productCode} completada.`);
    
    const cleanedSerial = serial.replace(/([A-Za-z])$/, ""); 
    const regexStr = '^' + part.serialMask.replace(/#/g, '\\d') + '$';
    if (!new RegExp(regexStr).test(cleanedSerial)) throw new Error("Formato de serial inválido para este modelo.");

    await db.saveSerial({
      serialNumber: cleanedSerial, orderNumber: order.orderNumber, partNumberId: part.id, currentOperationId: operation.id, isComplete: false,
      history: [{ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() }], printHistory: [],
      ...(testLog ? { testFechaRegistro: testLog.fechaRegistro, testSensorFW: testLog.sensorFW } : {})
    });

    if (part.serialGenType === 'PCB_SERIAL') {
        try {
             await db.printLabel(cleanedSerial, part.partNumber, {
                 sku: part.productCode,
                 quantity: 1,
                 excludeLabelTypes: ['NAMEPLATE', 'BOX_LABEL'],
                 jobDescription: `Initial Serial ${cleanedSerial}`
             });
        } catch (e) {
            console.error("Auto-print error", e);
        }
    }

    setStatusMsg({ type: 'success', text: `Serial ${cleanedSerial} OK` });
  };

  const processStandardOp = async (serial: string, order: WorkOrder, part: PartNumber) => {
    const unit = await db.getSerial(serial);
    if (!unit) throw new Error("Serial no existe.");
    if (unit.orderNumber !== order.orderNumber) throw new Error("Serial no pertenece a este lote de la orden.");
    
    unit.currentOperationId = operation.id;
    unit.history.push({ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() });
    await db.saveSerial(unit);
    setStatusMsg({ type: 'success', text: `${serial} OK` });
  };

  const processFinalOp = async (serial: string, order: WorkOrder, part: PartNumber) => {
    const unit = await db.getSerial(serial);
    if (!unit) throw new Error("Serial no encontrado.");
    if (unit.orderNumber !== order.orderNumber) throw new Error("Serial no pertenece a este lote de la orden.");

    unit.currentOperationId = operation.id; unit.isComplete = true;
    unit.history.push({ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() });
    await db.saveSerial(unit);
    try {
        await db.printLabel(serial, part.partNumber, { 
            jobDescription: `Empaque ${serial}`, 
            sku: part.productCode,
            excludeLabelTypes: ['CARTON1', 'CARTON2'] 
        });
        setStatusMsg({ type: 'success', text: `Etiqueta generada ${serial}` });
    } catch (e: any) {
        setStatusMsg({ type: 'success', text: `${serial} OK (Fallo Impresión)` });
    }
  };

  // --- IMPRIMIR ETIQUETA DE CAJA (BOX_LABEL) ---
  const [isPrintingBoxLabel, setIsPrintingBoxLabel] = useState(false);
  const handlePrintBoxLabel = async () => {
      if (!activeOrders || activeOrders.length !== 1 || !activeParts || activeParts.length !== 1) {
        showAlert("Ambigüedad", "La impresión de etiquetas de caja solo está disponible para un lote a la vez.", "info");
        return;
      }
      const order = activeOrders[0];
      const part = activeParts[0];

      setIsPrintingBoxLabel(true);
      showLoading("Buscando configuración de etiqueta de caja...");
      try {
          // Buscar configuración BOX_LABEL para el SKU
          const configs = await db.getLabelConfigs();
          const boxLabelConfig = configs.find(c => c.sku === part.productCode && c.labelType === 'BOX_LABEL');
          if (!boxLabelConfig) {
              showAlert("Sin Configuración", "No tiene etiqueta de caja configurada.", "warning");
              return;
          }
          // Imprimir etiqueta de caja
          await db.printLabel(order.orderNumber, part.partNumber, {
              sku: part.productCode,
              quantity: 1,
              jobDescription: `Box Label ${order.orderNumber}`,
              labelType: 'BOX_LABEL',
              excludeLabelTypes: ['NAMEPLATE', 'CARTON1', 'CARTON2']
          });
          showAlert("Éxito", "Etiqueta de caja enviada correctamente.", "success");
      } catch (e: any) {
          showAlert("Error", e.message, "error");
      } finally {
          setIsPrintingBoxLabel(false);
          hideLoading();
      }
  };

  // --- FINAL STATION COMPLETION UI STATE ---
  const [showLotReprintModal, setShowLotReprintModal] = useState(false);
  const [showAccessoryReprintModal, setShowAccessoryReprintModal] = useState(false);
  const [lotReprintSuffix, setLotReprintSuffix] = useState('');
  const [accessoryReprintQty, setAccessoryReprintQty] = useState(1);
  const [labelConfigs, setLabelConfigs] = useState<any[]>([]);
  const [selectedLabelConfig, setSelectedLabelConfig] = useState<any>(null);

  // Estado para mostrar el detalle de la unidad seleccionada
  const [selectedSerialDetail, setSelectedSerialDetail] = useState<SerialUnit | null>(null);

  // --- CARGA DE CONFIGURACIONES DE ETIQUETA PARA REIMPRESIÓN ---
  const fetchLabelConfigs = async () => {
    if (!activeParts || activeParts.length !== 1) return;
    const part = activeParts[0];
    showLoading("Cargando configuraciones...");
    try {
      const configs = await db.getLabelConfigs();
      const partConfigs = configs.filter(c => c.sku === part.productCode && c.labelType !== 'BOX_LABEL' && c.labelType !== 'NAMEPLATE');
      setLabelConfigs(partConfigs);
      if (partConfigs.length === 1) {
        setSelectedLabelConfig(partConfigs[0]);
      }
    } catch(e) {
      showAlert("Error", "No se pudieron cargar las configuraciones de etiquetas.", "error");
    } finally {
      hideLoading();
    }
  };

  // --- PROGRESO POR ESTACIÓN ---
  const getStationProgress = (order: WorkOrder) => {
    const serialsForOrder = allOrderSerials.filter(s => s.orderNumber === order.orderNumber);
    const completedInThisStation = serialsForOrder.filter(s => {
      if (!s.history || s.history.length === 0) return false;
      const lastOp = s.history[s.history.length - 1];
      return lastOp && lastOp.operationId === operation.id;
    }).length;
    return { completedInThisStation, total: order.quantity };
  };

  // --- Auto-close order on completion SOLO EN ESTACIÓN FINAL ---
  const showCompletionUI = activeOrders ? activeOrders.every(order => {
    if (!operation.isFinal) return false;
    const { completedInThisStation, total } = getStationProgress(order);
    return completedInThisStation >= total;
  }) : false;

  useEffect(() => {
    if (showCompletionUI && activeOrders && activeOrders.some(o => o.status !== 'CLOSED') && operation.isFinal) {
      const closeOrders = async () => {
        try {
          showAlert("Orden(es) Completa(s)", "Las órdenes se cerrarán automáticamente.", "info");
          const updatedOrders = await Promise.all(activeOrders.map(async (order) => {
            const { completedInThisStation, total } = getStationProgress(order);
            if (order.status !== 'CLOSED' && completedInThisStation >= total) {
              const updatedOrder = { ...order, status: 'CLOSED' as 'CLOSED' };
              // @ts-ignore
              await db.updateOrder(updatedOrder);
              return updatedOrder;
            }
            return order;
          }));
          setActiveOrders(updatedOrders);
        } catch (e: any) {
          showAlert("Error de Cierre", "No se pudieron cerrar las órdenes automáticamente: " + e.message, "error");
        }
      };
      const timer = setTimeout(() => {
        closeOrders();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [showCompletionUI, activeOrders, operation.id]);

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
            
            {operation.isInitial && !activeOrders ? (
                <div className="w-full animate-in fade-in zoom-in duration-300">
                    <h3 className="text-lg font-bold text-slate-700 mb-6 flex items-center justify-center"><PlayCircle className="mr-2 text-blue-600"/> Setup de Orden</h3>
                    <div className={`mb-4 transition-opacity ${setupStep === 1 ? 'opacity-100' : 'opacity-50'}`}>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">1. Escanear Orden SAP</label>
                        <div className="relative"><input autoFocus={setupStep === 1} value={sapOrderInput} onChange={e => { if(e.target.value.length <= 10) setSapOrderInput(e.target.value); }} disabled={setupStep !== 1} className="w-full pl-4 pr-10 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 text-lg tracking-widest" placeholder="0000000000"/>{sapOrderInput.length === 10 && <CheckCircle className="absolute right-3 top-3.5 text-green-500" size={20}/>}</div>
                    </div>
                    <div className={`mb-4 transition-opacity ${setupStep === 2 ? 'opacity-100' : 'opacity-50'}`}>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">2. Cantidad</label>
                        <input
                            ref={qtyRef}
                            type="number"
                            value={qtyInput}
                            onChange={e => {
                                const val = e.target.value;
                                if (Number(val) > 9999) {
                                    setQtyError('La cantidad no puede ser mayor a 9999.');
                                } else {
                                    setQtyError(null);
                                    setQtyInput(val);
                                }
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === 'Tab') {
                                    e.preventDefault();
                                    if (qtyInput && !qtyError) setSetupStep(3);
                                }
                            }}
                            disabled={setupStep !== 2}
                            className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 text-lg"
                            placeholder="0"
                        />
                        {qtyError && <div className="text-red-500 text-xs mt-1 font-bold">{qtyError}</div>}
                    </div>
                    <div className={`mb-4 transition-opacity ${setupStep === 3 ? 'opacity-100' : 'opacity-50'}`}>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">3. Escanear Modelo</label>
                        <input ref={modelRef} value={modelInput} onChange={e => setModelInput(e.target.value)} disabled={setupStep !== 3} className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-blue-500 text-lg uppercase" placeholder="Ej. LT-SEN-R3"/>
                    </div>
                </div>
            ) : !activeOrders ? (
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
                            {(() => {
                                const hasPcb = activeParts.some(p => p.serialGenType === 'PCB_SERIAL');
                                const hasLot = activeParts.some(p => p.serialGenType === 'LOT_BASED');
                                const hasAcc = activeParts.some(p => p.serialGenType === 'ACCESSORIES');
                                if (hasLot && !hasPcb && !hasAcc) return "Escaneo por Charola";
                                if (hasAcc && !hasPcb && !hasLot) return "Accesorios (Lotes)";
                                return "Escanear Serial o Charola";
                            })()}
                        </label>
                        {activeOrders && activeOrders.length === 1 && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">Lote: {activeOrders[0].orderNumber}</span>}
                    </div>

                    {showCompletionUI ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                            <CheckCircle className="mx-auto text-green-500 mb-3" size={32}/>
                            <h4 className="text-lg font-bold text-blue-800 mb-2">Orden(es) Completada(s)</h4>
                            <p className="text-sm text-slate-600 mb-4">Todas las unidades han sido procesadas.</p>
                            
                             <div className="grid grid-cols-1 gap-3 mt-4">
                                {operation.isFinal ? (<>
                                    {/* Buttons only show if all parts are of the same type to avoid ambiguity */}
                                    {activeParts.every(p => p.serialGenType === 'PCB_SERIAL') && (
                                        <>
                                            <button onClick={() => { if (activeParts.length === 1) handlePrintBoxLabel(); }} disabled={isPrintingBoxLabel || activeParts.length > 1} className="px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 flex items-center justify-center shadow-sm disabled:opacity-50"><Box size={16} className="mr-2"/> Imprimir Etiqueta de Caja</button>
                                            <button onClick={closeOrderAndReset} className="px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center"><LogOut size={16} className="mr-2"/> Finalizar (Cerrar Orden)</button>
                                        </>
                                    )}
                                    {activeParts.every(p => p.serialGenType === 'LOT_BASED') && (
                                        <>
                                            <button onClick={async () => { await fetchLabelConfigs(); setShowLotReprintModal(true); }} className="px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 flex items-center justify-center shadow-sm"><Printer size={16} className="mr-2"/> Reimprimir Etiqueta</button>
                                            <button onClick={() => { if (activeParts.length === 1) handlePrintBoxLabel(); }} disabled={isPrintingBoxLabel || activeParts.length > 1} className="px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 flex items-center justify-center shadow-sm disabled:opacity-50"><Box size={16} className="mr-2"/> Imprimir Etiqueta de Caja</button>
                                            <button onClick={closeOrderAndReset} className="px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center"><LogOut size={16} className="mr-2"/> Finalizar (Cerrar Orden)</button>
                                        </>
                                    )}
                                    {activeParts.every(p => p.serialGenType === 'ACCESSORIES') && (
                                        <>
                                            <button onClick={async () => { await fetchLabelConfigs(); setShowAccessoryReprintModal(true); }} className="px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 flex items-center justify-center shadow-sm"><Printer size={16} className="mr-2"/> Reimprimir</button>
                                            <button onClick={() => { if (activeParts.length === 1) handlePrintBoxLabel(); }} disabled={isPrintingBoxLabel || activeParts.length > 1} className="px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 flex items-center justify-center shadow-sm disabled:opacity-50"><Box size={16} className="mr-2"/> Imprimir Etiqueta de Caja</button>
                                            <button onClick={closeOrderAndReset} className="px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center"><LogOut size={16} className="mr-2"/> Finalizar (Cerrar Orden)</button>
                                        </>
                                    )}
                                </>) : (<>
                                    {/* --- BOTONES PARA ESTACIÓN INICIAL --- */}
                                    {activeParts.every(p => p.serialGenType !== 'LOT_BASED') && (
                                        <button onClick={() => setIsReprinting(true)} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 flex items-center justify-center">
                                            <Printer size={16} className="mr-2"/> Re-Imprimir
                                        </button>
                                    )}
                                    <button onClick={closeOrderAndReset} className={`px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow flex items-center justify-center`}>
                                        <LogOut size={16} className="mr-2"/> Cerrar Orden
                                    </button>
                                </>)}
                            </div>
                        </div>
                    ) : (
                        (() => {
                            const isLotBasedOnly = activeParts.every(p => p.serialGenType === 'LOT_BASED') && activeParts.length > 0;
                            const isAccessoriesOnly = activeParts.every(p => p.serialGenType === 'ACCESSORIES') && activeParts.length > 0;

                            if (isLotBasedOnly) {
                                return operation.isInitial ? (
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
                                          {/* ... TRAY UI ... */}
                                        </div>
                                    ) : (
                                        <form onSubmit={handleScanTrayProcessing}>
                                          <div className="relative group">
                                              <Layers className="absolute left-4 top-3.5 text-slate-400" />
                                              <input autoFocus value={trayInput} onChange={e => setTrayInput(e.target.value)} className="w-full pl-12 pr-4 py-3 text-lg border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none transition-all font-mono" placeholder="Escanear Charola para Procesar"/>
                                          </div>
                                        </form>
                                    )
                                );
                            }
                            
                            if (isAccessoriesOnly) {
                              return (
                                  <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-200">
                                      <h4 className="font-bold text-slate-700 text-lg">Lote de Accesorios Generado</h4>
                                      <div className="grid grid-cols-2 gap-4 mt-6">
                                          <button onClick={() => setIsReprinting(true)} className="flex items-center justify-center px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-semibold shadow-sm"><Printer size={16} className="mr-2"/> Re-Impresión</button>
                                          <button onClick={handleFinishAccessories} className="flex items-center justify-center px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-bold shadow-lg"><CheckCircle size={16} className="mr-2"/> Finalizar</button>
                                      </div>
                                  </div>
                              );
                            }

                            // Default/mixed view
                            return (
                                <div className="relative group">
                                    <Scan className="absolute left-4 top-3.5 text-slate-400" />
                                    <input ref={inputRef} autoFocus value={serialInput} onChange={e => setSerialInput(e.target.value)} className="w-full pl-12 pr-4 py-3 text-lg border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none transition-all font-mono" placeholder="Escanear Serial..."/>
                                </div>
                            );
                        })()
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
          <div className="flex flex-col gap-4 h-full">
               {activeOrders && activeOrders.length > 0 && activeParts.length > 0 ? (
                   <>
                      {/* --- Detalle de la Orden --- */}
                      <div className="bg-white rounded-xl shadow p-4 border border-slate-100 flex flex-col gap-2 mb-2">
                        <div className="flex justify-between items-center mb-2">
                          <div>
                            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">ORDEN SAP</div>
                            <div className="font-bold text-slate-800 text-lg">{activeOrders[0].sapOrderNumber}</div>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">PROGRESO</span>
                            <span className="font-bold text-blue-700 text-lg">{getStationProgress(activeOrders[0]).completedInThisStation} / {getStationProgress(activeOrders[0]).total}</span>
                          </div>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div><span className="text-slate-400 font-bold">Lote:</span> <span className="font-mono font-bold">{activeOrders[0].orderNumber}</span></div>
                          <div><span className="text-slate-400 font-bold">Modelo:</span> <span className="font-mono font-bold">{activeParts[0].productCode}</span></div>
                          <div><span className="text-slate-400 font-bold">Tipo Serial:</span> <span className="font-mono font-bold">{activeParts[0].serialGenType}</span></div>
                        </div>
                        {/* Barra de progreso visual */}
                        <div className="w-full h-2 bg-slate-100 rounded mt-2">
                          <div style={{width: `${(getStationProgress(activeOrders[0]).completedInThisStation/getStationProgress(activeOrders[0]).total)*100}%`}} className="h-2 bg-blue-500 rounded transition-all"></div>
                        </div>
                      </div>

                      {/* --- Tabla de Unidades Procesadas --- */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
                          <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700 text-sm flex items-center">
                              <List size={16} className="mr-2 text-slate-400"/>
                              Unidades Procesadas
                          </div>
                          <div className="overflow-y-auto p-4 flex-1">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-slate-500 text-xs border-b">
                                  <th className="text-left py-1">SERIAL</th>
                                  <th className="text-left py-1">PRUEBA FUNCIONAL</th>
                                  <th className="text-left py-1">FIRMWARE VERSION</th>
                                  <th className="text-left py-1">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allOrderSerials.filter(s => s.orderNumber === activeOrders[0].orderNumber).map(s => (
                                  <tr key={s.serialNumber} className="border-b last:border-b-0">
                                    <td className="font-mono text-blue-700 underline cursor-pointer" onClick={() => setSelectedSerialDetail(s)}>{s.serialNumber}</td>
                                    <td>{s.testFechaRegistro ? new Date(s.testFechaRegistro).toLocaleString() : '-'}</td>
                                    <td>{s.testSensorFW || '-'}</td>
                                    <td>{s.isComplete ? <span className="text-green-600 font-bold">✔</span> : <span className="text-slate-400">...</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                      </div>

                      <button onClick={handleChangeContext} className="mt-4 w-full flex items-center justify-center text-xs text-red-500 border border-red-200 p-2 rounded hover:bg-red-50 relative">
                          <LogOut size={12} className="mr-1"/> Cerrar Contexto
                      </button>
                   </>
               ) : (
                   <div className="bg-slate-50 border border-dashed border-slate-300 p-8 rounded-2xl text-center text-slate-400 my-auto">
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
                  <div className="flex gap-2 justify-end">
                    <button className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300" onClick={() => { setIsReprinting(false); setReprintQty(1); }}>Cancelar</button>
                    <button className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700" onClick={async () => { await handleReprint(); }} disabled={reprintQty < 1}>Reimprimir</button>
                  </div>
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
                          onChange={e => setReprintSuffix(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} 
                          placeholder="000"
                      />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300" onClick={() => { setIsSuffixReprinting(false); setReprintSuffix(''); }}>Cancelar</button>
                    <button className="px-4 py-2 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700" onClick={async () => { await handleReprintSuffix(); }} disabled={reprintSuffix.length !== 3}>Reimprimir</button>
                  </div>
               </div>
          </div>
        )}

      {showLotReprintModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-lg font-bold mb-4 flex items-center"><Printer className="mr-2 text-purple-600"/> Reimprimir Etiqueta de Lote</h3>
            <input
              type="text"
              maxLength={3}
              autoFocus
              className="w-full p-3 border rounded-lg text-xl font-mono text-center font-bold tracking-widest uppercase mb-4"
              value={lotReprintSuffix}
              onChange={e => setLotReprintSuffix(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              placeholder="000"
            />
            <div className="flex gap-2 justify-end">
              <button className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300" onClick={() => { setShowLotReprintModal(false); setLotReprintSuffix(''); }}>Cancelar</button>
              <button className="px-4 py-2 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700" onClick={async () => { await handleLotReprint(); setShowLotReprintModal(false); setLotReprintSuffix(''); }} disabled={lotReprintSuffix.length !== 3}>Reimprimir</button>
            </div>
          </div>
        </div>
      )}
      {showAccessoryReprintModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md animate-in zoom-in-95">
            <h3 className="text-lg font-bold mb-4 flex items-center"><Printer className="mr-2 text-blue-600"/> Reimprimir Etiqueta de Accesorio</h3>
            <input
              type="number"
              min={1}
              max={999}
              autoFocus
              className="w-full p-3 border rounded-lg text-xl font-mono text-center font-bold mb-4"
              value={accessoryReprintQty}
              onChange={e => setAccessoryReprintQty(Math.max(1, Math.min(999, Number(e.target.value))))}
              placeholder="Cantidad"
            />
            <div className="flex gap-2 justify-end">
              <button className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300" onClick={() => { setShowAccessoryReprintModal(false); setAccessoryReprintQty(1); }}>Cancelar</button>
              <button className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700" onClick={async () => { await handleAccessoryReprint(); setShowAccessoryReprintModal(false); setAccessoryReprintQty(1); }} disabled={accessoryReprintQty < 1}>Reimprimir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small helper components used by StationInterface. Kept minimal so they can be expanded later.
function TrayProgressSummary({ serials, allOps }: { serials: SerialUnit[]; allOps: Operation[] }) {
  if (!serials || serials.length === 0) return <div className="text-sm text-slate-500">No hay seriales en esta orden.</div>;
  return (
    <div className="space-y-2">
      {serials.map(s => {
        const op = allOps.find(o => o.id === s.currentOperationId);
        const lastHistory = s.history && s.history.length > 0 ? s.history[s.history.length - 1] : null;
        return (
          <div key={s.serialNumber} className="flex items-center justify-between p-2 bg-white border rounded">
            <div className="font-mono text-sm">{s.serialNumber}</div>
            <div className="text-xs text-slate-500 text-right">
              <div>{op ? op.name : lastHistory ? lastHistory.operationName : 'Sin operación'}</div>
              <div className="font-bold text-slate-700">{s.isComplete ? 'Completado' : (lastHistory ? 'En Progreso' : 'Pendiente')}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SerialProgressList({ serials }: { serials: SerialUnit[] }) {
  if (!serials || serials.length === 0) return <div className="text-sm text-slate-500">No hay unidades procesadas aún.</div>;
  return (
    <div className="space-y-2">
      {serials.map(s => (
        <div key={s.serialNumber} className="flex items-center justify-between p-2 bg-white border rounded">
          <div className="font-mono text-sm">{s.serialNumber}</div>
          <div className="text-xs text-slate-500">{s.isComplete ? 'Completado' : 'Activo'}</div>
        </div>
      ))}
    </div>
  );
}
