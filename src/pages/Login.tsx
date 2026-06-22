import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { showToastGlobal } from '../components/layout/MainLayout';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const login = useAuthStore((s) => s.login);
  const user = useAuthStore((s) => s.user);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      showToastGlobal('请输入用户名和密码', 'error');
      return;
    }
    setSubmitting(true);
    clearError();
    try {
      await login(username, password);
      showToastGlobal('登录成功', 'success');
      navigate('/');
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '登录失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const demoAccounts = [
    { username: 'admin', password: 'admin123', role: '管理员' },
    { username: 'tech1', password: 'tech123', role: '技术员' },
    { username: 'reader1', password: 'reader123', role: '读者/馆员' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-blue-900/50 mb-4">
            <Library className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">图书馆设备报修系统</h1>
          <p className="text-slate-400 text-sm">请登录以访问系统</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">用户名</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full pl-11 pr-12 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-900/30 disabled:opacity-50"
            >
              {submitting ? '登录中...' : '登 录'}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <p className="text-slate-500 text-xs mb-3">演示账号</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {demoAccounts.map((acc) => (
              <button
                key={acc.username}
                type="button"
                onClick={() => {
                  setUsername(acc.username);
                  setPassword(acc.password);
                }}
                className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                {acc.role}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
