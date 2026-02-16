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
  const { checkAuth, checkSetup, isLoading, setupRequired, isAuthenticated } = useAuthStore();
  const fetchSubscriptionStatus = useSubscriptionStore((s) => s.fetchStatus);
  const fetchAdConfig = useAdStore((s) => s.fetchConfig);

  useEffect(() => {
    checkSetup().then(() => checkAuth());
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
          <p className="text-dark-400 text-sm">Starting up...</p>
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
