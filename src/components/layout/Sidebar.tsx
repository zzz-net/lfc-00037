import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ListTodo,
  PlusCircle,
  Settings,
  Download,
  Library,
  Gauge,
  LogOut,
  User,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { ROLE_LABELS } from '../../../shared/types';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: '看板', roles: ['reader', 'technician', 'admin'] },
    { to: '/tickets', icon: ListTodo, label: '工单列表', roles: ['reader', 'technician', 'admin'] },
    { to: '/submit', icon: PlusCircle, label: '提交报修', roles: ['reader', 'technician', 'admin'] },
    { to: '/config/priorities', icon: Gauge, label: '优先级配置', roles: ['admin'] },
    { to: '/config/assets', icon: Library, label: '资产分组', roles: ['admin'] },
    { to: '/export', icon: Download, label: '导出中心', roles: ['admin'] },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col h-screen sticky top-0">
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Library className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">图书馆报修</h1>
            <p className="text-xs text-slate-400">设备管理系统</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems
          .filter((item) => user && item.roles.includes(user.role))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
            <User className="w-5 h-5 text-slate-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-slate-400">{user ? ROLE_LABELS[user.role] : ''}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          退出登录
        </button>
      </div>
    </aside>
  );
}
