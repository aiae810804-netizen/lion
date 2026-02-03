import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { db } from '../services/storage';
import { ArrowRight, Lock } from 'lucide-react';

const Login: React.FC = () => {
  const { login } = useContext(AuthContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Check role when username changes (on blur or specific button)
  const handleCheckUser = async () => {
      if(!username.trim()) return;
      setLoading(true);
      setError('');
      try {
          const users = await db.getUsers();
          const user = users.find(u => u.username === username.trim());
          
          if (!user) {
              setError("Usuario no encontrado.");
              setLoading(false);
              return;
          }

          if (user.role === 'OPERATOR') {
              // Login directly
              const success = await login(username);
              if (!success) setError("Error al iniciar sesión.");
          } else {
              // Admin/Supervisor requires password
              setNeedsPassword(true);
          }
      } catch (e) {
          setError("Error de conexión.");
      } finally {
          setLoading(false);
      }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;
    
    // If we haven't checked user yet
    if (!needsPassword) {
        await handleCheckUser();
        return;
    }

    // Attempt login with password
    setLoading(true);
    setError('');
    
    try {
        const success = await login(username, password);
        if (!success) {
            setError('Contraseña incorrecta.');
        }
    } catch (e) {
        setError('Error al autenticar.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-600 to-red-400"></div>
        
        <div className="flex justify-center mb-6">
            <div className="bg-red-600 text-white font-black text-4xl w-16 h-16 flex items-center justify-center rounded shadow-lg select-none">
              H
            </div>
        </div>

        <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Welcome Back</h2>
        <p className="text-center text-slate-500 mb-8">Li-Ion Manufacturing Process</p>

        <form onSubmit={handleFinalSubmit} className="space-y-6">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Username / ID</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setNeedsPassword(false); setError(''); }}
              onBlur={() => { if(username && !needsPassword) handleCheckUser(); }}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
              placeholder="e.g. admin, op1"
              disabled={loading || needsPassword}
            />
          </div>

          {needsPassword && (
              <div className="animate-in slide-in-from-top-4 duration-300">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                    <Lock size={14}/> Contraseña
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Ingrese su contraseña"
                    disabled={loading}
                />
              </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center">
                <span className="w-1 h-1 rounded-full bg-red-500 mr-2"></span> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center group disabled:opacity-70"
          >
            {loading ? 'Verificando...' : (needsPassword ? 'Iniciar Sesión' : 'Continuar')}
            {!loading && <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>
        
        {needsPassword && (
             <button onClick={() => { setNeedsPassword(false); setUsername(''); setPassword(''); }} className="w-full text-center mt-4 text-xs text-slate-500 underline">
                 Cambiar Usuario
             </button>
        )}
      </div>
    </div>
  );
};

export default Login;