import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  CubeTransparentIcon,
  ShieldCheckIcon,
  ServerStackIcon,
  CheckCircleIcon,
  CogIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

const api = axios.create({ baseURL: '/api' });

export default function Setup() {
  const { setup, login } = useAuthStore();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Dependency states
  const [javaInstalled, setJavaInstalled] = useState<boolean | null>(null);
  const [javaChecking, setJavaChecking] = useState(false);
  const [javaInstalling, setJavaInstalling] = useState(false);
  const [javaProgress, setJavaProgress] = useState(0);
  const [javaError, setJavaError] = useState<string | null>(null);
  const progressPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps = [
    { icon: CubeTransparentIcon, label: 'Welcome' },
    { icon: CogIcon, label: 'Dependencies' },
    { icon: ShieldCheckIcon, label: 'Admin Account' },
    { icon: ServerStackIcon, label: 'Complete' },
  ];

  // Check Java on mount and when entering step 1
  useEffect(() => {
    if (step === 1) {
      checkJava();
    }
    return () => {
      if (progressPoll.current) clearInterval(progressPoll.current);
    };
  }, [step]);

  const checkJava = async () => {
    setJavaChecking(true);
    setJavaError(null);
    try {
      const { data } = await api.get('/setup/status');
      setJavaInstalled(data.java?.installed ?? false);
    } catch {
      setJavaInstalled(false);
    } finally {
      setJavaChecking(false);
    }
  };

  const installJava = async () => {
    setJavaInstalling(true);
    setJavaError(null);
    setJavaProgress(0);

    // Poll progress
    progressPoll.current = setInterval(async () => {
      try {
        const { data } = await api.get('/setup/java-progress');
        if (data.downloading) {
          setJavaProgress(data.progress);
        }
      } catch { /* ignore */ }
    }, 1000);

    try {
      await api.post('/setup/install-java');
      setJavaInstalled(true);
      setJavaProgress(100);
      toast.success('Java installed successfully!');
    } catch (err: any) {
      setJavaError(err.response?.data?.error || 'Failed to install Java');
      toast.error('Java installation failed');
    } finally {
      setJavaInstalling(false);
      if (progressPoll.current) {
        clearInterval(progressPoll.current);
        progressPoll.current = null;
      }
    }
  };

  const handleCreateAccount = async (e: FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      await setup(username, email, password);
      setStep(3);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Setup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = async () => {
    setIsLoading(true);
    try {
      await login(username, password);
      toast.success('Setup complete! Welcome to CraftOS.');
      window.location.href = '/';
    } catch (err: any) {
      toast.error('Auto-login failed. Please go to the login page.');
      window.location.href = '/login';
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-success-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                  i <= step
                    ? 'bg-accent-600 text-white'
                    : 'bg-dark-800 text-dark-500'
                }`}
              >
                <s.icon className="w-5 h-5" />
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-12 h-0.5 ${
                    i < step ? 'bg-accent-600' : 'bg-dark-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="card">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-accent-600/20 rounded-3xl">
                <CubeTransparentIcon className="w-11 h-11 text-accent-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-dark-50">Welcome to CraftOS</h1>
                <p className="text-dark-400 mt-2 max-w-sm mx-auto">
                  The professional Minecraft server management platform. Let's get you set up.
                </p>
              </div>
              <div className="space-y-3 text-sm text-dark-300 text-left bg-dark-800/50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-success-400 flex-shrink-0" />
                  <span>Manage multiple Minecraft servers</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-success-400 flex-shrink-0" />
                  <span>Real-time console & monitoring</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-success-400 flex-shrink-0" />
                  <span>Plugin & mod management</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-success-400 flex-shrink-0" />
                  <span>Automated backups & scheduling</span>
                </div>
              </div>
              <button className="btn-primary w-full" onClick={() => setStep(1)}>
                Get Started
              </button>
            </div>
          )}

          {/* Step 1: Dependencies */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-2">
                <h2 className="text-xl font-semibold text-dark-50">Setting Up Dependencies</h2>
                <p className="text-dark-400 text-sm mt-1">
                  CraftOS needs Java to run Minecraft servers. We'll check and install it for you.
                </p>
              </div>

              <div className="space-y-4">
                {/* Java Status */}
                <div className="bg-dark-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        javaInstalled ? 'bg-success-600/20' :
                        javaInstalling ? 'bg-accent-600/20' :
                        'bg-dark-700'
                      }`}>
                        {javaChecking ? (
                          <div className="w-5 h-5 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
                        ) : javaInstalled ? (
                          <CheckCircleIcon className="w-5 h-5 text-success-400" />
                        ) : javaInstalling ? (
                          <ArrowDownTrayIcon className="w-5 h-5 text-accent-400" />
                        ) : (
                          <ExclamationTriangleIcon className="w-5 h-5 text-amber-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-dark-100">Java Runtime (JRE 21)</p>
                        <p className="text-xs text-dark-400">
                          {javaChecking ? 'Checking...' :
                           javaInstalled ? 'Installed and ready' :
                           javaInstalling ? 'Downloading...' :
                           'Required for Minecraft servers'}
                        </p>
                      </div>
                    </div>

                    {!javaChecking && !javaInstalled && !javaInstalling && (
                      <button
                        className="btn-primary text-sm px-4 py-2"
                        onClick={installJava}
                      >
                        Install
                      </button>
                    )}
                  </div>

                  {/* Progress bar */}
                  {javaInstalling && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-dark-400 mb-1">
                        <span>Downloading Java 21 JRE...</span>
                        <span>{javaProgress}%</span>
                      </div>
                      <div className="w-full bg-dark-700 rounded-full h-2">
                        <div
                          className="bg-accent-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${javaProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-dark-500 mt-2">
                        This may take a minute depending on your connection...
                      </p>
                    </div>
                  )}

                  {/* Error */}
                  {javaError && (
                    <div className="mt-3 p-3 bg-danger-600/10 border border-danger-600/20 rounded-lg">
                      <p className="text-xs text-danger-400">{javaError}</p>
                      <button
                        className="text-xs text-accent-400 hover:text-accent-300 mt-1"
                        onClick={installJava}
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setStep(0)}
                  disabled={javaInstalling}
                >
                  Back
                </button>
                <button
                  className="btn-primary flex-1"
                  onClick={() => setStep(2)}
                  disabled={javaInstalling}
                >
                  {javaInstalled ? 'Continue' : 'Skip for Now'}
                </button>
              </div>

              {!javaInstalled && !javaChecking && !javaInstalling && (
                <p className="text-xs text-dark-500 text-center">
                  You can also install Java manually and CraftOS will detect it automatically.
                </p>
              )}
            </div>
          )}

          {/* Step 2: Admin Account */}
          {step === 2 && (
            <form onSubmit={handleCreateAccount} className="space-y-5">
              <div className="text-center mb-2">
                <h2 className="text-xl font-semibold text-dark-50">Create Admin Account</h2>
                <p className="text-dark-400 text-sm mt-1">
                  This account will have full control over all servers
                </p>
              </div>

              <div>
                <label htmlFor="setup-username" className="label">Username</label>
                <input
                  id="setup-username"
                  type="text"
                  className="input"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  autoFocus
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="setup-email" className="label">Email</label>
                <input
                  id="setup-email"
                  type="email"
                  className="input"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="setup-password" className="label">Password</label>
                <input
                  id="setup-password"
                  type="password"
                  className="input"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="setup-confirm" className="label">Confirm Password</label>
                <input
                  id="setup-confirm"
                  type="password"
                  className="input"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setStep(1)}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Complete */}
          {step === 3 && (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-success-600/20 rounded-3xl">
                <CheckCircleIcon className="w-11 h-11 text-success-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-dark-50">You're All Set!</h2>
                <p className="text-dark-400 mt-2">
                  Your admin account has been created. You can now start managing your Minecraft servers.
                </p>
              </div>
              <button className="btn-primary w-full" onClick={handleFinish} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Launch Dashboard'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
