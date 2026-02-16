import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSubscriptionStore } from './stores/subscriptionStore';
import { useAdStore } from './stores/adStore';
import Layout from './components/layout/Layout';
import { PremiumGate } from './components/PremiumGate';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import Console from './pages/Console';
import Players from './pages/Players';
import Files from './pages/Files';
import Plugins from './pages/Plugins';
import Backups from './pages/Backups';
import Settings from './pages/Settings';
import AuditLog from './pages/AuditLog';
import ServerProperties from './pages/ServerProperties';
import Performance from './pages/Performance';
import Worlds from './pages/Worlds';
import Analytics from './pages/Analytics';
import Templates from './pages/Templates';
import LogSearch from './pages/LogSearch';
import Tools from './pages/Tools';
import Subscription from './pages/Subscription';
import Network from './pages/Network';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-dark-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { checkAuth, checkSetup, isLoading, setupRequired, isAuthenticated, backendError, retryBackend } = useAuthStore();
  const fetchSubscriptionStatus = useSubscriptionStore((s) => s.fetchStatus);
  const fetchAdConfig = useAdStore((s) => s.fetchConfig);

  useEffect(() => {
    checkSetup().then(() => {
      // Only check auth if backend is connected and setup is not required
      const state = useAuthStore.getState();
      if (state.backendConnected && !state.setupRequired) {
        checkAuth();
      }
    });
  }, []);

  // Fetch subscription status and ad config when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchSubscriptionStatus();
      fetchAdConfig();
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-xl font-semibold text-dark-200">CraftOS</h2>
          <p className="text-dark-400 text-sm">Connecting to server...</p>
        </div>
      </div>
    );
  }

  // Backend connection error screen
  if (backendError) {
    const handleRetry = async () => {
      // Try Electron IPC restart first (if running in Electron)
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.restartBackend) {
        try {
          const result = await electronAPI.restartBackend();
          if (!result.success) {
            console.warn('Backend restart failed:', result.error);
          }
          // Wait a moment for backend to initialize
          await new Promise((r) => setTimeout(r, 2000));
        } catch {
          // Not in Electron or IPC failed, normal retry
        }
      }
      retryBackend();
    };

    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-950 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-danger-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-danger-600/20 rounded-2xl mb-6">
            <svg className="w-8 h-8 text-danger-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-dark-50 mb-2">Connection Error</h1>
          <p className="text-dark-400 mb-6">
            CraftOS couldn't connect to the backend server. The server may still be starting up.
          </p>
          <div className="bg-dark-800/60 border border-dark-700 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs text-dark-500 mb-1">Error details:</p>
            <p className="text-sm text-danger-400 font-mono break-all">{backendError}</p>
          </div>
          <button
            className="btn-primary w-full"
            onClick={handleRetry}
          >
            Retry Connection
          </button>
          <p className="text-dark-500 text-xs mt-4">
            If this keeps happening, try restarting the application.
          </p>
        </div>
      </div>
    );
  }

  if (setupRequired) {
    return (
      <Routes>
        <Route path="*" element={<Setup />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/servers" element={<Servers />} />
                <Route path="/console/:id?" element={<Console />} />
                <Route path="/players/:id?" element={<Players />} />
                <Route path="/files/:id?" element={<Files />} />
                <Route path="/plugins/:id?" element={<Plugins />} />
                <Route path="/backups/:id?" element={<Backups />} />
                <Route path="/properties/:id?" element={<ServerProperties />} />
                <Route path="/performance/:id?" element={<PremiumGate feature="performanceMonitor" featureLabel="Performance Monitor"><Performance /></PremiumGate>} />
                <Route path="/worlds/:id?" element={<PremiumGate feature="worldManagement" featureLabel="World Management"><Worlds /></PremiumGate>} />
                <Route path="/analytics" element={<PremiumGate feature="analytics" featureLabel="Analytics"><Analytics /></PremiumGate>} />
                <Route path="/templates" element={<PremiumGate feature="templates" featureLabel="Templates"><Templates /></PremiumGate>} />
                <Route path="/logs" element={<PremiumGate feature="logSearch" featureLabel="Log Search"><LogSearch /></PremiumGate>} />
                <Route path="/tools" element={<PremiumGate feature="jvmTuner" featureLabel="JVM Tuner & Tools"><Tools /></PremiumGate>} />
                <Route path="/network" element={<PremiumGate feature="networkProxy" featureLabel="Network & Proxy"><Network /></PremiumGate>} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/audit" element={<AuditLog />} />
                <Route path="/subscription" element={<Subscription />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
