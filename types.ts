export enum UserRole {
  ADMIN = 'ADMIN',
  SUPERVISOR = 'SUPERVISOR',
  OPERATOR = 'OPERATOR'
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  password?: string; // Optional for operators or when fetching list (security)
}

export interface Operation {
  id: string;
  name: string;
  orderIndex: number; // 10, 20, 30...
  isInitial: boolean;
  isFinal: boolean; // For Empaque logic
  requireTestLog?: boolean; // Validar si unidades fueron probadas previo a iniciar
}

export interface ProcessRouteStep {
  id: string;
  processRouteId: string;
  operationId: string;
  stepOrder: number;
  operationName?: string; // For UI
}

export interface ProcessRoute {
  id: string;
  name: string;
  description: string;
  steps: ProcessRouteStep[];
}

export type SerialGenType = 'PCB_SERIAL' | 'LOT_BASED' | 'ACCESSORIES';

export interface PartNumber {
  id: string;
  partNumber: string;
  revision: string;
  description: string;
  productCode: string; // The "Model" scanned
  serialMask: string; // e.g., "31########"
  serialGenType?: SerialGenType;
  processRouteId?: string; // New field
}

export interface WorkOrder {
  id: string;
  sapOrderNumber: string; // External Order (10 digits)
  orderNumber: string;    // Internal Lot Number (KD001)
  partNumberId: string;
  quantity: number;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  mask: string; // Mask for order number
}

export interface PrintLog {
  id: number;
  status: 'SUCCESS' | 'ERROR';
  message: string;
  timestamp: string;
  fileName?: string;
  jobId?: string;
  jobContent?: string;
}

export interface LabelConfig {
  id: string;
  sku: string;           // Product Code
  labelName: string;     // e.g. "Carton" (without .fmt or with, handled in backend)
  formatPath: string;    // e.g. "C:\Formatos"
  printerName: string;   // e.g. "Zebra_420"
  defaultQuantity: number;
  labelType: 'NAMEPLATE' | 'CARTON1' | 'CARTON2'| 'BOX_LABEL';
}

export type LabelDataSource = 'SERIAL' | 'PART' | 'SKU' | 'DESC' | 'DATE' | 'STATIC';

export interface LabelField {
  id: number;
  labelConfigId: string;
  fieldName: string; // The variable name in EasyLabel file
  dataSource: LabelDataSource;
  staticValue?: string;
}

export interface SerialUnit {
  serialNumber: string;
  orderNumber: string; // This refers to the LOT NUMBER
  partNumberId: string;
  currentOperationId: string;
  trayId?: string; // New Field for Lot Based Trays
  history: {
    operationId: string;
    operationName: string; // Added for UI
    operatorId: string;
    operatorName: string; // Added for UI
    timestamp: string;
  }[];
  printHistory: PrintLog[]; // Added for Print Logging
  isComplete: boolean;
  // Nuevos campos para mostrar resultado de prueba funcional
  testFechaRegistro?: string;
  testSensorFW?: string;
  // --- Added for per-station progress ---
  progressByStation?: { stationName: string; completed: boolean }[];
}
