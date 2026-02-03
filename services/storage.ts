import { User, Operation, PartNumber, WorkOrder, SerialUnit, LabelConfig, LabelField, ProcessRoute } from '../types';

// CAMBIO IMPORTANTE: Usar ruta relativa.
// Al servir el frontend desde el mismo backend (Express), '/api' se resolverá automáticamente al puerto correcto.
const API_URL = '/api';

async function apiCall<T>(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: any): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_URL}${endpoint}`, options);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || res.statusText || 'API Error');
    }
    return res.json();
  } catch (error: any) {
    console.error(`API Call Failed: ${endpoint}`, error);
    throw error; 
  }
}

export const dbSystem = {
  checkConnection: async (): Promise<boolean> => {
    try { await apiCall('/health'); return true; } 
    catch (error) { throw new Error("No se pudo conectar al servidor Backend."); }
  },
  initDatabase: async (): Promise<string[]> => {
    const res = await apiCall<{ success: boolean, logs: string[] }>('/setup', 'POST');
    return res.logs;
  }
};

export const db = {
  login: (username: string, password?: string) => 
      apiCall<{ success: boolean, user: User }>('/auth/login', 'POST', { username, password }),

  getUsers: () => apiCall<User[]>('/users'),
  addUser: (user: User) => apiCall('/users', 'POST', user),
  updateUser: (id: string, user: Partial<User>) => apiCall(`/users/${id}`, 'PUT', user),
  deleteUser: (id: string) => apiCall(`/users/${id}`, 'DELETE'),
  
  getOperations: () => apiCall<Operation[]>('/operations'),
  addOperation: (op: Operation) => apiCall('/operations', 'POST', op),
  updateOperation: (id: string, op: Partial<Operation>) => apiCall(`/operations/${id}`, 'PUT', op),
  deleteOperation: (id: string) => apiCall(`/operations/${id}`, 'DELETE'),
  
  enterStation: (opId: string, userId: string) => apiCall(`/operations/${opId}/enter`, 'POST', { userId }),
  exitStation: (opId: string, userId: string) => apiCall(`/operations/${opId}/exit`, 'POST', { userId }),
  unlockStation: (opId: string) => apiCall(`/operations/${opId}/unlock`, 'POST'),

  getParts: () => apiCall<PartNumber[]>('/parts'),
  addPart: (part: PartNumber) => apiCall('/parts', 'POST', part),
  updatePart: (id: string, part: Partial<PartNumber>) => apiCall(`/parts/${id}`, 'PUT', part),
  deletePart: (id: string) => apiCall(`/parts/${id}`, 'DELETE'),
  
  getPartByMask: async (serial: string): Promise<PartNumber | undefined> => {
    const parts = await apiCall<PartNumber[]>('/parts');
    return parts.find(p => {
      const regexStr = '^' + p.serialMask.replace(/#/g, '\\d') + '$';
      const regex = new RegExp(regexStr);
      return regex.test(serial);
    });
  },

  getOrders: () => apiCall<WorkOrder[]>('/orders'),
  addOrder: (order: WorkOrder) => apiCall('/orders', 'POST', order),
  updateOrder: (id: string, updates: Partial<WorkOrder>) => apiCall(`/orders/${id}`, 'PUT', updates),
  deleteOrder: (id: string) => apiCall(`/orders/${id}`, 'DELETE'),

  getOrderByNumber: async (num: string): Promise<WorkOrder | undefined> => {
     const orders = await apiCall<WorkOrder[]>('/orders');
     return orders.find(o => o.orderNumber === num);
  },

  // UPDATED: Now takes SAPOrder and ProductCode
  generateAutoOrder: (sapOrderNumber: string, productCode: string, quantity: number, mask?: string) => 
     apiCall<{ success: boolean, orderNumber: string, orderId: string }>('/orders/generate', 'POST', { sapOrderNumber, productCode, quantity, mask }),

  getSerials: () => apiCall<SerialUnit[]>('/serials'),
  // New method for Tray Fetch
  getSerialsByTray: (trayId: string) => apiCall<SerialUnit[]>(`/serials/tray/${encodeURIComponent(trayId)}`),
  
  saveSerial: (unit: Partial<SerialUnit> & { isAutoGenerate?: boolean }) => apiCall<{success: boolean, generatedSerial?: string}>('/serials', 'POST', unit),
  
  // High performance batch update
  updateBatchSerials: (data: { serials: string[], operationId: string, operatorId: string, isComplete?: boolean }) => 
     apiCall<{ success: boolean }>('/serials/batch-update', 'POST', data),

  // New method for Batch Generation (Added autoComplete)
  generateBatchSerials: (data: { orderNumber: string, partNumberId: string, currentOperationId: string, trayId?: string, operatorId: string, quantity: number, autoComplete?: boolean }) =>
     apiCall<{ success: boolean, serials: { serialNumber: string }[] }>('/serials/batch-generate', 'POST', data),

  getSerial: async (serialNumber: string): Promise<SerialUnit | undefined> => {
    const serials = await apiCall<SerialUnit[]>('/serials');
    return serials.find(s => s.serialNumber === serialNumber);
  },
  deleteSerial: (serialNumber: string) => apiCall(`/serials/${encodeURIComponent(serialNumber)}`, 'DELETE'),

  getLabelConfigs: () => apiCall<LabelConfig[]>('/label-configs'),
  saveLabelConfig: (config: LabelConfig) => apiCall('/label-configs', 'POST', config),
  deleteLabelConfig: (id: string) => apiCall(`/label-configs/${id}`, 'DELETE'),

  getLabelFields: (configId: string) => apiCall<LabelField[]>(`/label-fields/${configId}`),
  addLabelField: (field: Omit<LabelField, 'id'>) => apiCall('/label-fields', 'POST', field),
  deleteLabelField: (id: number) => apiCall(`/label-fields/${id}`, 'DELETE'),

  printLabel: (serialNumber: string, partNumber: string, options?: any) => 
      apiCall('/print-label', 'POST', { serialNumber, partNumber, ...options }),
  
  printMultiLabels: (serials: SerialUnit[], sku: string, partNumber: string) =>
      apiCall('/print-label/multi', 'POST', { serials, sku, partNumber }),

  // ROUTES
  getRoutes: () => apiCall<ProcessRoute[]>('/routes'),
  addRoute: (route: ProcessRoute) => apiCall('/routes', 'POST', route),
  updateRoute: (id: string, route: Omit<Partial<ProcessRoute>, 'steps'> & { steps: { operationId: string, stepOrder: number }[] }) => apiCall(`/routes/${id}`, 'PUT', route),
  deleteRoute: (id: string) => apiCall(`/routes/${id}`, 'DELETE'),

  // TEST LOGS
  getTestLogBySerial: async (serialNumber: string) => {
    const res = await apiCall<{ success: boolean, data?: { serialNumber: string, fechaRegistro: string, sensorFW: string }, message?: string }>(`/test_logs/${encodeURIComponent(serialNumber)}`);
    if (res.success && res.data) return res.data;
    // If not found, return null and optionally handle message
    return null;
  },
};
