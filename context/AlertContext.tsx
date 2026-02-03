import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, X, Loader2 } from 'lucide-react';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertState {
  isOpen: boolean;
  type: AlertType;
  title: string;
  message: string;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface LoadingState {
  isOpen: boolean;
  message?: string;
}

interface AlertContextType {
  showAlert: (title: string, message: string, type?: AlertType) => Promise<void>;
  showConfirm: (title: string, message: string) => Promise<boolean>;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Alert State
  const [alertState, setAlertState] = useState<AlertState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  // Confirm State
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {},
  });

  // Loading State
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isOpen: false,
    message: 'Procesando...'
  });

  // Promise resolver for Alert to allow "await showAlert(...)"
  const [alertResolver, setAlertResolver] = useState<(() => void) | null>(null);

  const showAlert = useCallback((title: string, message: string, type: AlertType = 'info') => {
    return new Promise<void>((resolve) => {
      setAlertState({ isOpen: true, title, message, type });
      setAlertResolver(() => resolve);
    });
  }, []);

  const closeAlert = () => {
    setAlertState((prev) => ({ ...prev, isOpen: false }));
    if (alertResolver) {
      alertResolver();
      setAlertResolver(null);
    }
  };

  const showConfirm = useCallback((title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
          resolve(false);
        },
      });
    });
  }, []);

  const showLoading = useCallback((message: string = 'Procesando...') => {
    setLoadingState({ isOpen: true, message });
  }, []);

  const hideLoading = useCallback(() => {
    setLoadingState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // --- ICONS ---
  const getIcon = (type: AlertType) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-16 h-16 text-green-500 mb-4" />;
      case 'error': return <XCircle className="w-16 h-16 text-red-500 mb-4" />;
      case 'warning': return <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />;
      default: return <HelpCircle className="w-16 h-16 text-blue-500 mb-4" />;
    }
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm, showLoading, hideLoading }}>
      {children}

      {/* ALERT MODAL */}
      {alertState.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center text-center transform transition-all scale-100 animate-in zoom-in-95 duration-200">
            {getIcon(alertState.type)}
            <h3 className="text-2xl font-bold text-slate-800 mb-2">{alertState.title}</h3>
            <p className="text-slate-600 mb-6">{alertState.message}</p>
            <button 
              onClick={closeAlert}
              className={`w-full py-3 rounded-xl font-bold text-white transition-colors shadow-lg ${
                alertState.type === 'error' ? 'bg-red-600 hover:bg-red-700' :
                alertState.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full flex flex-col items-center text-center transform transition-all scale-100 animate-in zoom-in-95 duration-200">
            <AlertTriangle className="w-16 h-16 text-orange-500 mb-4" />
            <h3 className="text-2xl font-bold text-slate-800 mb-2">{confirmState.title}</h3>
            <p className="text-slate-600 mb-8">{confirmState.message}</p>
            <div className="flex gap-4 w-full">
               <button 
                onClick={confirmState.onCancel}
                className="flex-1 py-3 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmState.onConfirm}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg"
              >
                Sí, Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {loadingState.isOpen && (
        <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
          <h3 className="text-xl font-bold text-white animate-pulse">{loadingState.message}</h3>
        </div>
      )}

    </AlertContext.Provider>
  );
};