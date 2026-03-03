import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { db } from '../../services/storage';
import { Operation, WorkOrder, SerialUnit, PartNumber, ProcessRoute } from '../../types';
import { AuthContext } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { Scan, CheckCircle, AlertTriangle, Printer, Box, ArrowLeft, Lock, Info, PlayCircle, PlusSquare, ArrowRight, GitMerge, ChevronRight, ChevronLeft, X, RefreshCw, FileDown, Layers, LogOut, CheckSquare, Square, List, Hash, Download,Image as ImageIcon   } from 'lucide-react';
import RouteSelector from './components/RouteSelector';
import OperationSelector from './components/OperationSelector';
import useRoutes from './hooks/useRoutes';
import useOperations from './hooks/useOperations';
import { getOrderProgressByOrderNumber, getOrderProgressByOrderId } from '../../services/storage';

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

  const [boxFullState, setBoxFullState] = useState(false);
  const [currentBoxNumber, setCurrentBoxNumber] = useState(0);

    
  // Accessories Batch Processing State
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [waitingForContinue, setWaitingForContinue] = useState(false);
  const [isProcessingAccessories, setIsProcessingAccessories] = useState(false);
  const [accSetupData, setAccSetupData] = useState<{ orderNumber: string, part: PartNumber, totalQty: number, boxQty: number } | null>(null);
// Para progreso de accesorioes 


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

  // --- RESTAURACIÓN DE ESTADO AL REINGRESAR ---
  useEffect(() => {
    if (activeOrder && activeOrderPart) {
      if (activeOrderPart.serialGenType === 'ACCESSORIES') {
        // Restaurar batch y waitingForContinue
        getOrderProgressByOrderNumber(activeOrder.orderNumber)
           .then(data => {
             setCurrentBatch(data.currentBatch);
             setTotalBatches(data.totalBatches);
             setWaitingForContinue(data.waitingForContinue);
             setIsProcessingAccessories(data.waitingForContinue || (data.currentBatch < data.totalBatches));
             setAccSetupData({
               orderNumber: activeOrder.orderNumber,
               part: activeOrderPart,
               totalQty: activeOrder.quantity,
               boxQty: activeOrderPart.StdBoxQty || 1
             });
           })
           .catch(() => {});
      } else if (activeOrderPart.serialGenType === 'LOT_BASED') {
        // Restaurar estado de charola/CSV generado si hay unidades pendientes
        if (allOrderSerials.length < activeOrder.quantity) {
          setTrayGenerated(false); // Permite seguir generando charolas
          setTrayIsFinished(false);
          setLastCsvData(null);
        }
      }
    }
    // PCB_SERIAL no se modifica
  }, [activeOrder, activeOrderPart, allOrderSerials.length]);

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
  // --- ACCESSORIES BATCH PROCESSING LOGIC ---
  const processAccBatch = useCallback(async (batchIdx: number) => {
    if (!accSetupData || !isProcessingAccessories) return;
    const { orderNumber, part, totalQty, boxQty } = accSetupData;
    const batchNum = batchIdx + 1;
    const currentBatchQty = Math.min(boxQty, totalQty - (batchIdx * boxQty));

    showLoading(`[${batchNum}/${totalBatches}] Generando Unidades...`);
    try {
      const genRes = await db.generateBatchSerials({
        orderNumber: orderNumber,
        partNumberId: part.id,
        currentOperationId: operation.id,
        trayId: `ACC-${orderNumber}-${batchNum}`,
        operatorId: user.id,
        quantity: currentBatchQty
      });

      if (genRes.success) {
        showLoading(`[${batchNum}/${totalBatches}] Imprimiendo ${currentBatchQty} Nameplates...`);
        await db.printLabel(orderNumber, part.partNumber, {
          sku: part.productCode,
          quantity: currentBatchQty,
          excludeLabelTypes: ['BOX_LABEL'],
          jobDescription: `Accessories Lote ${orderNumber} - Nameplate ${batchNum}`
        });

        showLoading(`[${batchNum}/${totalBatches}] Imprimiendo Etiqueta de Caja...`);
        await db.printLabel(orderNumber, part.partNumber, {
          sku: part.productCode,
          quantity: 2,
          excludeLabelTypes: ['NAMEPLATE'],
          jobDescription: `Accessories Box ${orderNumber} - Box Label : ${batchNum}`
        });

        const orderSerials = await db.getSerialsByOrder(orderNumber);
        setAllOrderSerials(orderSerials);
        setScannedCount(orderSerials.length);
        
        if (batchNum < totalBatches) {
          setWaitingForContinue(true);
          setStatusMsg({ type: 'info', text: `Lote parcial de accesorios ${batchNum} completado. Haga clic en Continuar para el siguiente parcial.` });
        } else {
          setIsProcessingAccessories(false);
          setAccSetupData(null);
          setStatusMsg({ type: 'success', text: `Lote ${orderNumber} Procesado Completamente` });
          showAlert("Éxito", "Proceso de accesorios completado.", "success");
        }
      }
    } catch (e: any) {
      showAlert("Error en Lote de Accesorios", e.message, "error");
      setIsProcessingAccessories(false);
    } finally {
      hideLoading();
    }
  }, [accSetupData, isProcessingAccessories, totalBatches, operation.id, user.id, showAlert, showLoading, hideLoading]);

  useEffect(() => {
    if (isProcessingAccessories && !waitingForContinue && currentBatch < totalBatches) {
      processAccBatch(currentBatch);
    }
  }, [currentBatch, isProcessingAccessories, waitingForContinue, totalBatches, processAccBatch]);

  const handleNextAccBatch = () => {
    setWaitingForContinue(false);
    setCurrentBatch(prev => prev + 1);
  };



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
                          const totalQty = Number(qtyInput);
                          const boxQty = part.StdBoxQty || 1;
                          const iterations = Math.ceil(totalQty / boxQty);
                          setTotalBatches(iterations);
                          setCurrentBatch(0);
                          setWaitingForContinue(false);
                          setIsProcessingAccessories(true);
                          setAccSetupData({ orderNumber: res.orderNumber, part, totalQty, boxQty });
                        
                              /*  if (isAccessories) {
                                      const printQty = Number(qtyInput);
                                      showLoading(`Imprimiendo ${printQty} etiquetas de Accesorios...`);
                                      await db.printLabel(res.orderNumber, part.partNumber, { 
                                          sku: part.productCode, 
                                          quantity: printQty,
                                          excludeLabelTypes: ['BOX_LABEL'],
                                          jobDescription: `Accessories Batch ${res.orderNumber}`
                                      });
                                      setStatusMsg({ type: 'success', text: `Lote Creado + ${printQty} Etiquetas Enviadas` });*/
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
              sku: activeOrderPart.productCode, quantity: reprintQty, excludeLabelTypes: ['BOXL_LABEL'], jobDescription: `Reprint ${activeOrder.orderNumber}`
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

          await db.saveSerial({ ...serial, currentOperationId: operation.id, history: newHistory, operatorId: user.id });
          setStatusMsg({ type: 'success', text: `Procesado: ${serial.serialNumber}`});

      } catch (e) {}
  };

  const handleSelectAllTray = async () => {
    if (traySerials.length === 0 || trayIsFinished) return;
    showLoading("Marcando Todo...");
    try {
        const toProcess = traySerials.filter(s => !s.isComplete && !s.history.some(h => h.operationId === operation.id));
        if (toProcess.length === 0) { hideLoading(); return; }

        const now = new Date().toISOString();
        // Procesa cada serial individualmente
        await Promise.all(toProcess.map(async s => {
            const newHistory = [...s.history, {
                operationId: operation.id,
                operationName: operation.name,
                operatorId: user.id,
                operatorName: user.name,
                timestamp: now
            }];
            await db.saveSerial({ ...s, currentOperationId: operation.id, history: newHistory, operatorId: user.id });
        }));

        // Actualiza el estado local
        const updatedList = traySerials.map(s => {
            if (!s.isComplete && !s.history.some(h => h.operationId === operation.id)) {
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
        setStatusMsg({ type: 'success', text: `${toProcess.length} unidades procesadas en charola.` });
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
          await db.updateBatchSerials({
              trayId: activeTrayId,
              operationId: operation.id,
              operatorId: user.id,
              isComplete: true
          });

          const part = await db.getParts().then(parts => parts.find(p => p.id === traySerials[0].partNumberId));
          if (part) {
              await db.printMultiLabels(traySerials, part.productCode, part.partNumber);
          }

          setStatusMsg({ type: 'success', text: "Charola Finalizada y Etiquetas Enviadas." });
          console.log("estacion final completada", { isStationComplete });
          // --- CAMBIO: Limpia el estado de la charola para mostrar la vista de estación completada ---
          setActiveTrayId(null);
          setTraySerials([]);
          setTrayIsFinished(false);

          // Actualiza la barra de progreso y muestra UI de caja/finalizar para LOT_BASED
          const all = await db.getSerials();
          setAllOrderSerials(all.filter(s => s.orderNumber === activeOrder!.orderNumber));

          // Si el modelo es LOT_BASED y es la estación final, marca como completos solo los seriales de la charola activa
          if (activeOrderPart?.serialGenType === 'LOT_BASED' && operation.isFinal) {
          await Promise.all(traySerials.map(async s => {
              if (!s.isComplete || s.currentOperationId !== operation.id) {
                  s.currentOperationId = operation.id;
                  s.isComplete = true;
                  s.history = s.history || [];
                  s.history.push({ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() });
                  await db.saveSerial({ ...s, operatorId: user.id });
              }
          }));
          // Refresca el estado
          const all2 = await db.getSerials();
          setAllOrderSerials(all2.filter(s => s.orderNumber === activeOrder!.orderNumber));
          
          
      }
      } catch (e: any) {
          showAlert("Error", e.message, "error");
      } finally { hideLoading(); }
  };

  const handleFinishAccessories = async () => {
      if (!activeOrder || !activeOrderPart) return;

      showLoading("Finalizando orden de accesorios...");
      try {
         // Si ya procesamos los batches, no necesitamos generar más seriales.

          // Solo cerramos la orden.

          handleFinishOrder();
      
          setSapOrderInput('');
        // setQtyInput('');
        //  setModelInput('');
        //  setSetupStep(1);
         // setStatusMsg(null);
         // setAllOrderSerials([]);
          setScannedCount(0);
          setCurrentBatch(0);
          setTotalBatches(0);
          handleChangeContext();
          
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
      setBoxFullState(false);
  }

  // --- STANDARD SCAN LOGIC ---
  useEffect(() => {
      if (!serialInput) return;
      let shouldSubmit = false;
      if (activeOrderPart) {
           if (serialInput.length === activeOrderPart.serialMask.length || serialInput.length === activeOrderPart.serialMask.length+1) shouldSubmit = true;
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
      let testLog: { serialNumber: string, fechaRegistro: string, sensorFW: string } | null = null;
      // Validación: Si la operación requiere test log y el tipo es PCB_SERIAL
      if (operation.requireTestLog && activeOrderPart?.serialGenType === 'PCB_SERIAL') {
       // testLog = await db.getTestLogBySerial(serialInput.trim());
        const response = await fetch(`/api/test_logs/${encodeURIComponent(serialInput.trim())}?partNumber=${encodeURIComponent(activeOrderPart!.partNumber)}`);
        const result = await response.json();
        console.log("Test log fetch result", { response, result });
        testLog = result.success ? result.data : null;
        if (!testLog) {
          throw new Error("El número de serie no ha sido probado o no ha pasado la prueba funcional.");
        }
      }
      // Validación: verificar si el serial ya está ligado a otra orden
      const existingSerial = await db.getSerial(serialInput.trim());
      if (existingSerial && activeOrder && existingSerial.orderNumber !== activeOrder.orderNumber) {
        throw new Error("El número de serie ya está ligado a otra orden.");
      }
      if (operation.isInitial) await processInitialOp(serialInput.trim(), testLog);
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

  const checkAndTriggerBoxFull = async () => {
      if (!activeOrder || !activeOrderPart || !activeOrderPart.StdBoxQty || activeOrderPart.StdBoxQty <= 0) return;
      
      const allSerials = await db.getSerials();
      const relevant = allSerials.filter(s => s.orderNumber === activeOrder.orderNumber);
      const completedInStation = relevant.filter(s => s.history.some(h => h.operationId === operation.id)).length;

      if (completedInStation > 0 && completedInStation % activeOrderPart.StdBoxQty === 0 && completedInStation < activeOrder.quantity) {
          const boxNum = Math.ceil(completedInStation / activeOrderPart.StdBoxQty);
          setCurrentBoxNumber(boxNum);
          setBoxFullState(true);
      }
  };

  // Modificado para aceptar testLog opcional
  const processInitialOp = async (serial: string, testLog?: { serialNumber: string, fechaRegistro: string, sensorFW: string }) => {
    if (!activeOrder || !activeOrderPart) throw new Error("No hay orden activa.");
    if (scannedCount >= activeOrder.quantity) throw new Error("Orden completada.");
    serial = serial.replace(/-/g, ""); // Elimina todos los guiones
    serial = serial.replace(/([A-Za-z])$/, ""); 
    const regexStr = '^' + activeOrderPart.serialMask.replace(/#/g, '\\d') + '$';
    if (!new RegExp(regexStr).test(serial)) throw new Error("Formato inválido.");

    await db.saveSerial({
      serialNumber: serial, orderNumber: activeOrder.orderNumber, partNumberId: activeOrder.partNumberId, currentOperationId: operation.id, isComplete: false, operatorId: user.id,
      history: [{ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() }], printHistory: [],
      // Guardar datos de prueba funcional si existen
      ...(testLog ? { testFechaRegistro: testLog.fechaRegistro, testSensorFW: testLog.sensorFW } : {})
    });

    if (activeOrderPart.serialGenType === 'PCB_SERIAL') {
        try {
             await db.printLabel(serial, activeOrderPart.partNumber, {
                 sku: activeOrderPart.productCode,
                 quantity: 1,
                 excludeLabelTypes: ['NAMEPLATE', 'BOX_LABEL'], 
                 jobDescription: `Initial Serial ${serial}`
             });
        } catch (e) {
            console.error("Auto-print error", e);
        }
    }

    setStatusMsg({ type: 'success', text: `Serial ${serial} OK` });
    await checkAndTriggerBoxFull();
  };

  const processStandardOp = async (serial: string) => {
    const unit = await db.getSerial(serial);
    if (!unit) throw new Error("Serial no existe.");
    if (activeOrder && unit.orderNumber !== activeOrder.orderNumber) throw new Error("Serial pertenece a otra orden.");
    
    unit.currentOperationId = operation.id;
    unit.history.push({ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() });
    await db.saveSerial({ ...unit, operatorId: user.id });
    setStatusMsg({ type: 'success', text: `${serial} OK` });
    await checkAndTriggerBoxFull();
  };

  const processFinalOp = async (serial: string) => {
    const unit = await db.getSerial(serial);
    if (!unit) throw new Error("Serial no encontrado.");
    if (activeOrder && unit.orderNumber !== activeOrder.orderNumber) throw new Error("Serial pertenece a otra orden.");

    const parts = await db.getParts();
    const part = parts.find(p => p.id === unit.partNumberId);
    unit.currentOperationId = operation.id; unit.isComplete = true;
    unit.history.push({ operationId: operation.id, operationName: operation.name, operatorId: user.id, operatorName: user.name, timestamp: new Date().toISOString() });
    await db.saveSerial({ ...unit, operatorId: user.id });
    
    let statusText = "";
    try {
        await db.printLabel(serial, part?.partNumber || "UNKNOWN", { 
            jobDescription: `Empaque ${serial}`, 
            sku: part?.productCode,
            excludeLabelTypes: ['CARTON1', 'CARTON2', 'BOX_LABEL'] 
        });
        statusText = `Etiqueta generada ${serial}`;
    } catch (e: any) {
        statusText = `${serial} OK (Fallo Impresión)`;
    }

    await checkAndTriggerBoxFull();
    setStatusMsg({ type: 'success', text: statusText });
  };

  // --- IMPRIMIR ETIQUETA DE CAJA (BOX_LABEL) ---
  const [isPrintingBoxLabel, setIsPrintingBoxLabel] = useState(false);
  const handlePrintBoxLabel = async () => {
      if (!activeOrder || !activeOrderPart) return;
      setIsPrintingBoxLabel(true);
      showLoading("Buscando configuración de etiqueta de caja...");
      try {
          // Buscar configuración BOX_LABEL para el SKU
          const configs = await db.getLabelConfigs();
          const boxLabelConfig = configs.find(c => c.sku === activeOrderPart.productCode && c.labelType === 'BOX_LABEL');
          if (!boxLabelConfig) {
              showAlert("Sin Configuración", "No tiene etiqueta de caja configurada.", "warning");
              return;
          }
          
          const stdQty = activeOrderPart.StdBoxQty || 0;
          const totalQty = activeOrder.quantity;

          if (stdQty > 0) {
              const fullBoxes = Math.floor(totalQty / stdQty);
              const remainder = totalQty % stdQty;

              for (let i = 0; i < fullBoxes; i++) {
                  await db.printLabel(activeOrder.orderNumber, activeOrderPart.partNumber, {
                      sku: activeOrderPart.productCode,
                      quantity: 2,
                      jobDescription: `Box Label ${activeOrder.orderNumber} (Box ${i + 1})`,
                      excludeLabelTypes: ['CARTON1', 'CARTON2', 'NAMEPLATE'],
                      labelType: 'BOX_LABEL',
                      sapOrderNumber: activeOrder.sapOrderNumber,
                      orderQuantity: stdQty
                  });
              }

              if (remainder > 0) {
                  await db.printLabel(activeOrder.orderNumber, activeOrderPart.partNumber, {
                      sku: activeOrderPart.productCode,
                      quantity: 2,
                      jobDescription: `Box Label ${activeOrder.orderNumber} (Partial)`,
                      excludeLabelTypes: ['CARTON1', 'CARTON2', 'NAMEPLATE'],
                      labelType: 'BOX_LABEL',
                      sapOrderNumber: activeOrder.sapOrderNumber,
                      orderQuantity: remainder
                  });
              }
          } else {
              await db.printLabel(activeOrder.orderNumber, activeOrderPart.partNumber, {
                  sku: activeOrderPart.productCode,
                  quantity: 2,
                  jobDescription: `Box Label ${activeOrder.orderNumber}`,
                  excludeLabelTypes: ['CARTON1', 'CARTON2', 'NAMEPLATE'],
                  labelType: 'BOX_LABEL',
                  sapOrderNumber: activeOrder.sapOrderNumber,
                  orderQuantity: activeOrder.quantity
              });
          }
          showAlert("Éxito", "Etiquetas de caja enviadas correctamente.", "success");
      } catch (e: any) {
          showAlert("Error", e.message, "error");
      } finally {
          setIsPrintingBoxLabel(false);
          hideLoading();
      }
  };

  const handlePrintSingleBoxLabel = async () => {
      if (!activeOrder || !activeOrderPart) return;
      showLoading("Imprimiendo etiqueta de caja...");
      try {
          await db.printLabel(activeOrder.orderNumber, activeOrderPart.partNumber, {
              sku: activeOrderPart.productCode,
              quantity: 2,
              jobDescription: `Box Label ${activeOrder.orderNumber} (Intermediate)`,
              excludeLabelTypes: ['CARTON1', 'CARTON2', 'NAMEPLATE'],
              labelType: 'BOX_LABEL',
              sapOrderNumber: activeOrder.sapOrderNumber,
              orderQuantity: activeOrderPart.StdBoxQty
          });
          showAlert("Éxito", "Etiqueta de caja enviada.", "success");
      } catch (e: any) {
          showAlert("Error", e.message, "error");
      } finally {
          hideLoading();
      }
  };

  const handleFinishOrder = async () => {
      if (!activeOrder) return;
      const confirmed = await showConfirm("Finalizar Orden", "¿Está seguro de que desea cerrar esta orden? No se podrán procesar más unidades.");
      if (!confirmed) return;
      
      showLoading("Cerrando Orden...");
      try {
          await db.updateOrder(activeOrder.id, { status: 'CLOSED' });
          showAlert("Éxito", "Orden finalizada correctamente.", "success");
          handleChangeContext();
      } catch (e: any) {
          showAlert("Error", "No se pudo cerrar la orden: " + e.message, "error");
      } finally {
          hideLoading();
      }
  };

  // --- NUEVO: función para descargar CSV de una charola ---
  const handleDownloadTrayCsv = (trayId: string) => {
    const units = groups[trayId];
    if (!units || units.length === 0) return;
    const partNumber = units[0].partNumberId || '';
    // Buscar el productCode correcto usando availableParts
    const part = availableParts.find(p => p.id === partNumber);
    const productCode = part?.productCode || '';
    const orderNumber = units[0].orderNumber || '';
    const filename = `${orderNumber}_CHAROLA_${trayId}_${orderNumber}.csv`;
    const csvContent = "PN,SKU,SERIAL\n" + units.map(s => `${partNumber},${productCode},${s.serialNumber}`).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
};

  const isOrderComplete = activeOrder && scannedCount >= activeOrder.quantity;
  const isLotBased = activeOrderPart?.serialGenType === 'LOT_BASED';

  // Calcula progreso de la estación activa (para la barra superior)
  function getCurrentStationProgress(serials: SerialUnit[], currentOpId: string): { completed: number, total: number } {
      if (!activeOrder) return { completed: 0, total: 0 };
      const total = activeOrder.quantity;
      if (!currentOpId || !serials) return { completed: 0, total };
      const completed = serials.filter(s => s.history && s.history.some(h => h.operationId === currentOpId)).length;
      console.log( "Estacion completada", { completed, total });
      return { completed, total };
    
  }

  const stationProgress = getCurrentStationProgress(allOrderSerials, operation.id);
  const isStationComplete = activeOrder && stationProgress.completed >= activeOrder.quantity;

  const stdBoxQty = activeOrderPart?.StdBoxQty || 0;
  const totalBoxes = stdBoxQty > 0 && activeOrder ? Math.ceil(activeOrder.quantity / stdBoxQty) : 0;
  const completedBoxes = stdBoxQty > 0 ? Math.floor(stationProgress.completed / stdBoxQty) : 0;

  // --- Helper para LOT_BASED: Validar si todas las charolas han sido procesadas en la estación final ---
  type SerialGenType = 'PCB_SERIAL' | 'LOT_BASED' | 'ACCESSORIES';
  function allTraysProcessedInFinalStation(serials: SerialUnit[], part: PartNumber | null, op: Operation): boolean {
    if (!part || part.serialGenType !== 'LOT_BASED' || !op.isFinal) return false;
    // Todas las unidades deben estar completas
    return serials.length > 0 && serials.every(s => s.isComplete);
}

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
                    {isStationComplete ? (
                        <div className="text-center p-8 bg-green-50 rounded-xl border border-green-200">
                            <h4 className="font-bold text-green-700 text-lg flex items-center justify-center">
                                <CheckCircle size={20} className="mr-2" /> Estación Completada
                            </h4>
                            <p className="text-slate-600 mt-2 mb-6">Todas las unidades para esta orden ({activeOrder.sapOrderNumber}) han sido procesadas en la estación "{operation.name}".</p>
                            {operation.isFinal && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                                <button 
                                    onClick={handlePrintBoxLabel} 
                                    disabled={isPrintingBoxLabel}
                                    className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-lg disabled:opacity-50"
                                >
                                    <Printer size={16} className="mr-2"/> Imprimir Etiqueta de Caja
                                </button>
                               <button 
    onClick={handleFinishOrder} 
    disabled={isPrintingBoxLabel}
    className="flex items-center justify-center px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-bold shadow-lg disabled:opacity-50"
>
    <Box size={16} className="mr-2"/> Finalizar Orden
</button>
                            </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between items-baseline mb-2">
                                <label className="block text-sm font-bold text-slate-600 uppercase tracking-wider">
                                    {activeOrderPart?.serialGenType === 'ACCESSORIES' ? "Accesorios (Lotes)" : isLotBased ? "Escanear Charola" : "Escanear Serial"}
                                </label>
                                {activeOrder && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">Lote: {activeOrder.orderNumber}</span>}
                            </div>
                            {activeOrderPart?.serialGenType === 'ACCESSORIES' ? (
                                <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-200">
                                     <h4 className="font-bold text-slate-700 text-lg">Lote de Accesorios</h4>
                                  <p className="text-sm text-slate-500 mb-2">
                                    Procesando Lote de accesorios : {currentBatch + 1} de {totalBatches}
                                  </p>
                                  <div className="grid grid-cols-1 gap-4 mt-6">
                                      {waitingForContinue ? (
                                        <button 
                                          onClick={handleNextAccBatch} 
                                          className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-lg animate-pulse"
                                        >
                                          <ArrowRight size={16} className="mr-2"/> Continuar al siguiente caja de accesorios de esta orden
                                        </button>
                                      ) : isProcessingAccessories ? (
                                        <div className="flex items-center justify-center p-4 text-blue-600 font-bold">
                                          <RefreshCw size={20} className="animate-spin mr-2" /> Procesando lote...
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-2 gap-4">

                                          <button onClick={() => setIsReprinting(true)} className="flex items-center justify-center px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-semibold shadow-sm"><Printer size={16} className="mr-2"/> Re-Impresión</button>

                                          <button onClick={handleFinishAccessories} className="flex items-center justify-center px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-bold shadow-lg"><CheckCircle size={16} className="mr-2"/> Finalizar</button>
                                        </div>
                                      )}
                                      {!isProcessingAccessories && (
                                        <button 
                                          onClick={handlePrintBoxLabel} 
                                          disabled={isPrintingBoxLabel}
                                          className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-lg disabled:opacity-50"
                                        >
                                          <Printer size={16} className="mr-2"/> Imprimir Etiqueta de Caja
                                        </button>
                                      )}
                                      </div>
                                </div>

                             /*   <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-200">
                                 /* <h4 className="font-bold text-slate-700 text-lg">Lote de Accesorios Generado</h4>
                                  <div className="grid grid-cols-2 gap-4 mt-6">
                                      <button onClick={() => setIsReprinting(true)} className="flex items-center justify-center px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-semibold shadow-sm"><Printer size={16} className="mr-2"/> Re-Impresión</button>
                                      <button onClick={handleFinishAccessories} className="flex items-center justify-center px-4 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-bold shadow-lg"><CheckCircle size={16} className="mr-2"/> Finalizar</button>
                                       <button 
                                    onClick={handlePrintBoxLabel} 
                                    disabled={isPrintingBoxLabel}
                                    className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-lg disabled:opacity-50"
                                >
                                    <Printer size={16} className="mr-2"/> Imprimir Etiqueta de Caja
                                </button>
                                  </div>
                                </div>*/
                            ) : isLotBased ? (
                                operation.isInitial ? (
                                    trayGenerated ? (
                                        <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-200">
                                            <h4 className="font-bold text-slate-700 text-lg mb-4">Charola Generada</h4>
                                            <p className="text-sm text-slate-500 mb-6">Se han generado los seriales para la charola.</p>
                                            <div className="flex gap-4 justify-center">
                                                {lastCsvData && (
                                                    <button onClick={handleDownloadCsvAgain} className="flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-bold">
                                                        <FileDown size={18} className="mr-2"/> Descargar CSV
                                                    </button>
                                                )}
                                                <button onClick={handleFinishTrayInitial} className="flex items-center px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold">
                                                    <CheckCircle size={18} className="mr-2"/> Finalizar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleScanTrayInitial}>
                                            <div className="relative">
                                                <Scan className="absolute left-4 top-3.5 text-slate-400" />
                                                <input autoFocus value={trayInput} onChange={e => setTrayInput(e.target.value)} className="w-full pl-12 pr-4 py-3 text-lg border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none transition-all font-mono" placeholder="Escanear Nueva Charola"/>
                                            </div>
                                        </form>
                                    )
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
                            ) : (
                                <form onSubmit={handleSerialScan}>
                                  <div className="relative">
                                    <Scan className="absolute left-4 top-3.5 text-slate-400" />
                                    <input autoFocus value={serialInput} onChange={e => setSerialInput(e.target.value)} className="w-full pl-12 pr-4 py-3 text-lg border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none transition-all font-mono" placeholder="Escanear Serial"/>
                                  </div>
                                </form>
                            )}
                            <div className="mt-3 flex items-center gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100 animate-in slide-in-from-top-2 duration-300">
                                {availableParts.find(p => p.productCode === modelInput)?.picture ? (
                                    <div className="w-16 h-16 rounded-lg border border-blue-200 bg-white flex items-center justify-center overflow-hidden shadow-sm">
                                        <img src={availableParts.find(p => p.productCode === modelInput)?.picture} className="max-w-full max-h-full object-contain" alt="Preview" />
                                    </div>
                                ) : (
                                    <div className="w-16 h-16 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-300 shadow-sm">
                                        <ImageIcon size={24} />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{availableParts.find(p => p.productCode === modelInput)?.partNumber || 'Modelo no encontrado'}</p>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight line-clamp-2 leading-tight">
                                        {availableParts.find(p => p.productCode === modelInput)?.description || 'Verifique el código del modelo escaneado.'}
                                    </p>
                                </div>
                            </div>
                        </>
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
                            <div className="text-right"><p className="text-xs text-slate-400 font-bold uppercase">Progreso</p><p className="text-xl font-bold text-blue-600">{stationProgress.completed} / {stationProgress.total}</p></div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 mb-4 relative z-10"><div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{width: `${stationProgress.total > 0 ? Math.min((stationProgress.completed/stationProgress.total)*100, 100) : 0}%`}}></div></div>
                        
                        {stdBoxQty > 0 && (
                            <div className="mb-4 relative z-10">
                                <div className="flex justify-between items-end mb-1">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Cajas ({stdBoxQty} u/caja)</p>
                                    <p className="text-sm font-bold text-purple-600">{completedBoxes} / {totalBoxes}</p>
                                </div>
                                                                                                                                                                                                                                                                                                                             <div className="w-full bg-slate-100 rounded-full h-1.5"><div className="bg-purple-500 h-1.5 rounded-full transition-all duration-500" style={{width: `${totalBoxes > 0 ? Math.min((completedBoxes/totalBoxes)*100, 100) : 0}%`}}></div></div>
                            </div>
                        )}

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm space-y-2 relative z-10">
                            {activeOrderPart?.picture && (
                                <div className="mb-3 rounded-lg overflow-hidden border border-slate-200 bg-white h-32 flex items-center justify-center">
                                    <img src={activeOrderPart.picture} alt={activeOrderPart.productCode} className="max-h-full max-w-full object-contain" />
                                </div>
                            )}
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
                                <TrayProgressSummary serials={allOrderSerials} allOps={allOps} availableParts={availableParts} />
                            ) : (
                                <SerialProgressList serials={allOrderSerials} stdBoxQty={stdBoxQty} currentOpId={operation.id} />
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
                <div className="flex gap-2">
                    <button onClick={() => setIsReprinting(false)} className="flex-1 py-2 bg-slate-100 rounded-lg">Cancelar</button>
                    <button onClick={handleReprint} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold">Imprimir</button>
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

      {boxFullState && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md animate-in zoom-in-95 text-center">
                <div className="bg-blue-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 text-blue-600">
                    <Box size={40} />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Caja #{currentBoxNumber} Completada</h3>
                <p className="text-slate-600 mb-8">Se han completado {activeOrderPart?.StdBoxQty} unidades. Imprima la etiqueta de caja para continuar.</p>
                
                <div className="space-y-3">
                    {operation.isFinal && (
                        <button 
                            onClick={handlePrintSingleBoxLabel} 
                            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center justify-center"
                        >
                            <Printer size={20} className="mr-2"/> Imprimir Etiqueta de Caja
                        </button>
                    )}
                    <button 
                        onClick={() => setBoxFullState(false)} 
                        className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200"
                    >
                        Continuar con Orden
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}

function TrayProgressSummary({ serials, allOps, availableParts }: { serials: SerialUnit[], allOps: Operation[], availableParts: PartNumber[] }) {
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
                    <div key={tid} className="p-3 border rounded-lg text-sm bg-white shadow-sm flex flex-col gap-1">
                        <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-slate-700 flex items-center gap-2">
                                Charola: {tid}
                                <button
                                    type="button"
                                    title="Descargar CSV de esta charola"
                                    onClick={() => handleDownloadTrayCsv(tid)}
                                    className="ml-1 p-1 rounded hover:bg-blue-100 text-blue-600 border border-blue-100"
                                >
                                    <FileDown size={16} />
                                </button>
                            </span>
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">{total} pzas</span>
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

function SerialProgressList({ serials, stdBoxQty, currentOpId }: { serials: SerialUnit[], stdBoxQty?: number, currentOpId?: string }) {
    const [modalSerialId, setModalSerialId] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    const safeSerials = useMemo(() => Array.isArray(serials) ? serials : [], [serials]);

    // Filter serials processed in current station for accurate box grouping
    const processedInStation = useMemo(() => {
        if (!currentOpId) return safeSerials;
        return safeSerials.filter(s => s.history.some(h => h.operationId === currentOpId))
            .sort((a, b) => {
                const timeA = a.history.find(h => h.operationId === currentOpId)?.timestamp || '';
                const timeB = b.history.find(h => h.operationId === currentOpId)?.timestamp || '';
                return timeA.localeCompare(timeB); // Ascending (Oldest first) to group by box 1..N
            });
    }, [safeSerials, currentOpId]);

    const totalBoxes = stdBoxQty ? Math.ceil(processedInStation.length / stdBoxQty) : 1;

    // Auto-switch to current box (last one) when items update
    useEffect(() => {
        if (stdBoxQty) {
             const currentBox = Math.ceil(processedInStation.length / stdBoxQty) || 1;
             setPage(currentBox);
        }
    }, [processedInStation.length, stdBoxQty]);

    const displaySerials = useMemo(() => {
        if (!stdBoxQty) return [...safeSerials].reverse().slice(0, 20); // Default: Show recent 20 (descending)
        
        const startIndex = (page - 1) * stdBoxQty;
        const endIndex = startIndex + stdBoxQty;
        // Show current box items. We can show them Ascending (1..10) or Descending (10..1). 
        // Let's show Descending (newest on top) within the box.
        return [...processedInStation].slice(startIndex, endIndex).reverse();
    }, [processedInStation, safeSerials, stdBoxQty, page]);
    
    const modalSerial = modalSerialId ? safeSerials.find(s => s.serialNumber === modalSerialId) : null;

    if (safeSerials.length === 0) return <p className="text-xs text-slate-400 italic text-center">Sin actividad.</p>;

    return (
        <div className="space-y-2">
            {stdBoxQty && stdBoxQty > 0 && (
                <div className="flex justify-between items-center bg-slate-100 p-2 rounded mb-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"><ChevronLeft size={16}/></button>
                    <span className="text-xs font-bold text-slate-600">Caja {page} de {Math.max(1, totalBoxes)}</span>
                    <button onClick={() => setPage(p => Math.min(totalBoxes, p + 1))} disabled={page >= totalBoxes} className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"><ChevronRight size={16}/></button>
                </div>
            )}
            <div className="flex justify-between items-center p-2 border-b border-slate-200 text-xs font-bold bg-slate-50">
                <span className="font-mono text-slate-600 uppercase">SERIAL</span>
                <span className="text-slate-600">PRUEBA FUNCIONAL</span>
                <span className="text-slate-600">FIRMWARE VERSION</span>
                <span className="text-slate-600">Estado</span>
            </div>
            {displaySerials.map(s => (
                <div key={s.serialNumber} className="flex justify-between items-center p-2 border-b border-slate-50 text-xs">
                    <span className="font-mono text-blue-700 font-bold cursor-pointer underline" onClick={() => setModalSerialId(s.serialNumber)}>{s.serialNumber}</span>
                    <span>{s.testFechaRegistro ? new Date(s.testFechaRegistro).toLocaleString() : '-'}</span>
                    <span>{s.testSensorFW || '-'}</span>
                    {s.isComplete ? <CheckCircle size={14} className="text-green-500"/> : <span className="text-blue-500 font-bold">...</span>}
                </div>
            ))}
            {/* Modal de detalle de serial */}
            {modalSerial && (
                <SerialDetailModal serial={modalSerial} onClose={() => setModalSerialId(null)} />
            )}
        </div>
    )
}

// Modal de detalle de serial


function SerialDetailModal({ serial, onClose }: { serial: SerialUnit, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [partInfo, setPartInfo] = useState<PartNumber | null>(null);

  // ✅ Extrae la carga a una función reusable
  const loadPartInfo = useCallback(async () => {
    try {
      const parts = await db.getParts();
      const found = parts.find(p => p.id === serial.partNumberId);
      setPartInfo(found || null);
    } catch (e) {
      console.error("Error loading part info", e);
    }
  }, [serial.partNumberId]);

  useEffect(() => {
    loadPartInfo();
  }, [loadPartInfo]);

  // ✅ Botón de actualizar/refresh del modal
  const handleRefresh = async () => {
    setRefreshing(true);
    setMsg(null);
    try {
      await loadPartInfo();

      // Si también quieres refrescar historial o serial completo desde DB,
      // aquí sería el lugar (si tienes un endpoint o método db.getSerialById).
      // Ejemplo:
      // const updatedSerial = await db.getSerial(serial.serialNumber);
      // setSerialState(updatedSerial);

      setMsg("Información actualizada.");
    } catch (e: any) {
      setMsg("Error al actualizar: " + (e.message || e.toString()));
    } finally {
      setRefreshing(false);
    }
  };

  const handleReprintSerial = async () => {
    setLoading(true);
    setMsg(null);
    try {
      await db.printLabel(serial.serialNumber, serial.partNumberId, {
        jobDescription: `Reimpresión desde modal ${serial.serialNumber}`
      });
      setMsg("Reimpresión enviada correctamente.");
    } catch (e: any) {
      setMsg("Error al reimprimir: " + (e.message || e.toString()));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      {/* ✅ relative para anclar botones */}
      <div className="relative bg-white p-6 rounded-2xl shadow-xl w-full max-w-md animate-in zoom-in-95">

        {/* ✅ Header con botones tipo ventana */}
        <div className="flex items-start justify-between mb-4 border-b pb-2">
          <h3 className="text-xl font-bold text-slate-800">Detalle de Unidad</h3>

          <div className="flex gap-2">
            {/* ✅ Refresh */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Actualizar"
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white
                         hover:bg-slate-100 active:bg-slate-200 transition disabled:opacity-50"
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} size={18} />
            </button>

            {/* ✅ Close */}
            <button
              onClick={onClose}
              title="Cerrar"
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white
                         hover:bg-red-50 hover:border-red-200 active:bg-red-100 transition"
            >
              <X size={18} className="text-slate-700" />
            </button>
          </div>
        </div>

        {/* ---- TU CONTENIDO ORIGINAL ---- */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Serial Number</p>
            <p className="font-mono text-lg font-bold text-blue-700 break-all">{serial.serialNumber}</p>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Estado</p>
            <p className={`font-bold ${serial.isComplete ? "text-green-600" : "text-orange-500"}`}>
              {serial.isComplete ? "COMPLETADO" : "EN PROCESO"}
            </p>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Número de Parte</p>
            <p className="font-mono font-medium text-slate-700">{partInfo?.partNumber || serial.partNumberId}</p>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Modelo</p>
            <p className="font-mono font-medium text-slate-700">{partInfo?.productCode || "-"}</p>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center">
            <Layers size={16} className="mr-2" /> Historial de Operaciones
          </h4>

          <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
            <ul className="divide-y divide-slate-200">
              {serial.history && serial.history.length > 0 ? (
                <>
                  {serial.history.map((h, idx) => (
                    <li key={idx} className="p-3 text-sm hover:bg-slate-100 transition-colors">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-700">{h.operationName}</span>
                        <span className="text-xs text-slate-400">{new Date(h.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Operador: <span className="font-medium text-slate-600">{h.operatorName}</span>
                      </div>
                    </li>
                  ))}
                </>
              ) : (
                <li className="p-4 text-center text-slate-400 text-sm italic">Sin historial registrado</li>
              )}
            </ul>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center">
            <Printer size={16} className="mr-2" /> Logs de Impresión
          </h4>

          <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden max-h-60 overflow-y-auto">
            <ul className="divide-y divide-slate-200">
              {serial.printHistory && serial.printHistory.length > 0 ? (
                <>
                  {serial.printHistory.map((p, idx) => (
                    <li key={idx} className="p-3 text-sm hover:bg-slate-100 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <span className="font-bold text-slate-700 block">{p.fileName || "Archivo desconocido"}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                              p.status === "SUCCESS"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {p.timestamp ? new Date(p.timestamp).toLocaleString() : "-"}

                        </span>
                      </div>

                      <div className="mt-2 bg-slate-800 rounded p-2 overflow-x-auto">
                        <p className="text-[10px] font-mono text-green-400 whitespace-pre-wrap break-all">
                          {p.jobContent || p.message || "Sin contenido de comando"}
                        </p>
                      </div>
                    </li>
                  ))}
                </>
              ) : (
                <li className="p-4 text-center text-slate-400 text-sm italic">Sin etiquetas impresas</li>
              )}
            </ul>
          </div>
        </div>

        {msg && (
          <div
            className={`mb-4 p-3 rounded-lg text-center text-sm font-bold ${
              msg.startsWith("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
            }`}
          >
            {msg}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center"
            onClick={handleReprintSerial}
            disabled={loading}
          >
            {loading ? <RefreshCw className="animate-spin mr-2" size={16} /> : <Printer className="mr-2" size={16} />}
            {loading ? "Enviando..." : "Reimprimir Última Etiqueta"}
          </button>
        </div>
      </div>
    </div>
  );
}
