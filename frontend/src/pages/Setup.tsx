import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import {
  CubeTransparentIcon,
  ShieldCheckIcon,
  ServerStackIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

export default function Setup() {
  const { setup, login } = useAuthStore();
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const steps = [
    { icon: CubeTransparentIcon, label: 'Welcome' },
    { icon: ShieldCheckIcon, label: 'Admin Account' },
    { icon: ServerStackIcon, label: 'Complete' },
  ];

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
      setStep(2);
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

          {/* Step 1: Admin Account */}
          {step === 1 && (
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
                  onClick={() => setStep(0)}
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

          {/* Step 2: Complete */}
          {step === 2 && (
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
