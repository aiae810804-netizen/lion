
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { User, UserRole } from './types';
import { db, dbSystem } from './services/storage';
import { AuthContext } from './context/AuthContext';
import { AlertProvider } from './context/AlertContext';

// Icons
import { Settings, LogOut, Scan, LayoutDashboard, XCircle, Loader2, BarChart3 } from 'lucide-react';

// Components
import Login from './pages/Login';
import AdminDashboard from './pages/Admin/AdminDashboard';
import SupervisorDashboard from './pages/Supervisor/SupervisorDashboard';
import OperatorStation from './pages/Operator/OperatorStation';
import MainDashboard from './pages/Dashboard/MainDashboard';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const navItemClass = (path: string) => 
    `flex items-center p-3 mb-2 rounded-lg transition-colors ${location.pathname.startsWith(path) ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`;

  if (!user) return <>{children}</>;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-10">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-red-600 text-white font-sans font-black text-2xl w-10 h-10 flex items-center justify-center rounded shadow-lg shrink-0 select-none">
              H
            </div>
            <h1 className="text-sm font-bold leading-tight text-white">
              Li-Ion Manufacturing Process
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1 ml-1">Version 1.0</p>
        </div>
        
        <nav className="flex-1 p-4">
          <button onClick={() => navigate('/dashboard')} className={navItemClass('/dashboard')}>
             <BarChart3 size={20} className="mr-3" /> Dashboard
          </button>

          {(user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR) && (
             <button onClick={() => navigate('/supervisor')} className={navItemClass('/supervisor')}>
             <LayoutDashboard size={20} className="mr-3" /> Production Mgr
           </button>
          )}

          <button onClick={() => navigate('/operator')} className={navItemClass('/operator')}>
             <Scan size={20} className="mr-3" /> Operator Station
          </button>

          {user.role === UserRole.ADMIN && (
            <button onClick={() => navigate('/admin')} className={navItemClass('/admin')}>
              <Settings size={20} className="mr-3" /> Admin Panel
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-sm">
              {user.name.charAt(0)}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-slate-400 capitalize">{user.role}</p>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center justify-center p-2 bg-slate-800 hover:bg-red-600 rounded-md transition-colors text-sm">
            <LogOut size={16} className="mr-2" /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">
        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [dbStatus, setDbStatus] = useState<'connecting' | 'initializing' | 'ready' | 'error'>('connecting');
  const [dbLogs, setDbLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Startup Routine
  useEffect(() => {
    const initSystem = async () => {
      try {
        // 1. Check Connection
        await dbSystem.checkConnection();
        setDbStatus('initializing');
        
        // 2. Initialize DB / Run Scripts
        const logs = await dbSystem.initDatabase();
        setDbLogs(logs);
        
        // 3. Ready
        setTimeout(() => setDbStatus('ready'), 1500); // Short delay to read logs
      } catch (err: any) {
        setDbStatus('error');
        setErrorMsg(err.message || "Unknown Database Error");
      }
    };

    initSystem();
  }, []);
  
  const login = async (username: string, password?: string) => {
    try {
      const response = await db.login(username, password);
      if (response.success && response.user) {
        setUser(response.user);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Login error", e);
      return false;
    }
  };

  const logout = () => setUser(null);

  // --- LOADING SCREEN (Initializing DB) ---
  if (dbStatus === 'connecting' || dbStatus === 'initializing') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-8">
        <Loader2 size={48} className="animate-spin text-red-600 mb-6" />
        <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-600 text-white font-black text-2xl w-10 h-10 flex items-center justify-center rounded">H</div>
            <h2 className="text-2xl font-bold">Li-Ion Manufacturing</h2>
        </div>
        <p className="text-slate-400 mb-8">{dbStatus === 'connecting' ? 'Conectando a MS SQL Server...' : 'Verificando Estructura de Base de Datos...'}</p>
        
        <div className="w-full max-w-2xl bg-slate-950 rounded-lg p-4 font-mono text-xs h-64 overflow-y-auto border border-slate-800 shadow-inner">
          <p className="text-green-500">$ system start --verbose</p>
          <p className="text-blue-400">[INF] Attempting connection to SQL Instance...</p>
          {dbStatus === 'initializing' && <p className="text-green-400">[OK] Connection Established.</p>}
          {dbLogs.map((log, i) => (
            <p key={i} className="text-slate-300 ml-2">&gt; {log}</p>
          ))}
          {dbLogs.length > 0 && <p className="text-green-500 animate-pulse">_</p>}
        </div>
      </div>
    );
  }

  // --- ERROR SCREEN (Connection Failed) ---
  if (dbStatus === 'error') {
    return (
      <div className="min-h-screen bg-red-950 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
          <div className="bg-red-600 p-6 flex items-center">
             <XCircle className="text-white mr-4" size={40} />
             <div>
                <h2 className="text-xl font-bold text-white">Error Crítico de Sistema</h2>
                <p className="text-red-100 text-sm">Fallo en Conexión de Base de Datos</p>
             </div>
          </div>
          <div className="p-8">
            <div className="bg-red-50 p-4 rounded border border-red-100 mb-6">
              <h3 className="font-bold text-red-800 mb-2 text-sm uppercase">Diagnóstico</h3>
              <p className="text-red-700 font-mono text-sm break-words">{errorMsg}</p>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              La aplicación no puede iniciar porque no se detectó una instancia válida de MS SQL Server o la conexión fue rechazada.
            </p>
            <button onClick={() => window.location.reload()} className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors">
              Reintentar Conexión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AlertProvider>
      <AuthContext.Provider value={{ user, login, logout }}>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/login" element={!user ? <Login /> : <Navigate to={user.role === 'OPERATOR' ? '/operator' : '/dashboard'} />} />
              
              <Route path="/dashboard" element={
                user ? <MainDashboard /> : <Navigate to="/login" />
              } />

              <Route path="/admin/*" element={
                user?.role === UserRole.ADMIN ? <AdminDashboard /> : <Navigate to="/login" />
              } />

              <Route path="/supervisor/*" element={
                (user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERVISOR) ? <SupervisorDashboard /> : <Navigate to="/login" />
              } />

              <Route path="/operator/*" element={
                user ? <OperatorStation /> : <Navigate to="/login" />
              } />

              <Route path="*" element={<Navigate to="/login" />} />
            </Routes>
          </Layout>
        </HashRouter>
      </AuthContext.Provider>
    </AlertProvider>
  );
}

export default App;
