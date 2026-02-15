import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import { EyeIcon, EyeSlashIcon, CubeTransparentIcon } from '@heroicons/react/24/outline';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
        </div>

        <p className="text-center text-dark-500 text-xs mt-6">
          CraftOS Server Manager v1.0.0-beta.1
        </p>
      </div>
    </div>
  );
}
