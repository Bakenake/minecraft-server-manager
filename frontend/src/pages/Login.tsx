import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { EyeIcon, EyeSlashIcon, CubeTransparentIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Password recovery state
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showFactoryReset, setShowFactoryReset] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await login(username, password, needs2FA ? totpToken : undefined);

      if (result.requiresTwoFactor) {
        setNeeds2FA(true);
        setIsLoading(false);
        return;
      }

      toast.success('Welcome back!');
      navigate('/', { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsResetting(true);
    try {
      await api.post('/auth/reset-admin', {
        username: recoveryUsername,
        newPassword,
      });
      toast.success('Password reset! You can now log in.');
      setShowRecovery(false);
      setUsername(recoveryUsername);
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  const handleFactoryReset = async () => {
    setIsResetting(true);
    try {
      await api.post('/auth/factory-reset', { confirm: 'RESET' });
      toast.success('All accounts deleted. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Factory reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  // Recovery UI
  if (showRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent-600/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-600/20 rounded-2xl mb-4">
              <ArrowPathIcon className="w-9 h-9 text-accent-400" />
            </div>
            <h1 className="text-2xl font-bold text-dark-50">Reset Password</h1>
            <p className="text-dark-400 mt-1 text-sm">
              Reset your admin account password
            </p>
          </div>

          {!showFactoryReset ? (
            <div className="card">
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <label htmlFor="recovery-username" className="label">Admin Username</label>
                  <input
                    id="recovery-username"
                    type="text"
                    className="input"
                    placeholder="admin"
                    value={recoveryUsername}
                    onChange={(e) => setRecoveryUsername(e.target.value)}
                    required
                    autoFocus
                    disabled={isResetting}
                  />
                </div>

                <div>
                  <label htmlFor="new-password" className="label">New Password</label>
                  <input
                    id="new-password"
                    type="password"
                    className="input"
                    placeholder="Min. 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={isResetting}
                  />
                </div>

                <div>
                  <label htmlFor="confirm-new-password" className="label">Confirm New Password</label>
                  <input
                    id="confirm-new-password"
                    type="password"
                    className="input"
                    placeholder="Confirm password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    disabled={isResetting}
                  />
                </div>

                <button type="submit" className="btn-primary w-full" disabled={isResetting}>
                  {isResetting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </button>

                <button
                  type="button"
                  className="btn-ghost w-full"
                  onClick={() => setShowRecovery(false)}
                  disabled={isResetting}
                >
                  Back to login
                </button>
              </form>

              <div className="border-t border-dark-700 mt-5 pt-4">
                <button
                  className="text-xs text-dark-500 hover:text-danger-400 transition-colors w-full text-center"
                  onClick={() => setShowFactoryReset(true)}
                >
                  Don't remember your username? Start fresh with factory reset
                </button>
              </div>
            </div>
          ) : (
            <div className="card text-center space-y-4">
              <div className="bg-danger-600/10 border border-danger-600/20 rounded-lg p-4">
                <p className="text-sm text-danger-300 font-medium mb-1">Warning: Factory Reset</p>
                <p className="text-xs text-dark-400">
                  This will delete all user accounts and return to the initial setup wizard.
                  Your servers, backups, and data will NOT be affected.
                </p>
              </div>

              <button
                className="btn-danger w-full"
                onClick={handleFactoryReset}
                disabled={isResetting}
              >
                {isResetting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Delete All Accounts & Start Fresh'
                )}
              </button>

              <button
                className="btn-ghost w-full"
                onClick={() => setShowFactoryReset(false)}
                disabled={isResetting}
              >
                Cancel
              </button>
            </div>
          )}

          <p className="text-center text-dark-500 text-xs mt-6">
            CraftOS Server Manager v{__APP_VERSION__}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-600/20 rounded-2xl mb-4">
            <CubeTransparentIcon className="w-9 h-9 text-accent-400" />
          </div>
          <h1 className="text-3xl font-bold text-dark-50">CraftOS</h1>
          <p className="text-dark-400 mt-1">Server Manager</p>
        </div>

        {/* Form Card */}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!needs2FA ? (
              <>
                <div>
                  <label htmlFor="username" className="label">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    className="input"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="label">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-200"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="totp" className="label">
                  Two-Factor Code
                </label>
                <input
                  id="totp"
                  type="text"
                  className="input text-center text-lg tracking-widest"
                  placeholder="000000"
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoFocus
                  maxLength={6}
                  disabled={isLoading}
                />
                <p className="text-dark-400 text-xs mt-2">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </>
              ) : needs2FA ? (
                'Verify'
              ) : (
                'Sign in'
              )}
            </button>

            {needs2FA && (
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => {
                  setNeeds2FA(false);
                  setTotpToken('');
                }}
              >
                Back to login
              </button>
            )}
          </form>

          {!needs2FA && (
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-sm text-dark-400 hover:text-accent-400 transition-colors"
                onClick={() => setShowRecovery(true)}
              >
                Forgot password?
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-dark-500 text-xs mt-6">
          CraftOS Server Manager v{__APP_VERSION__}
        </p>
      </div>
    </div>
  );
}
