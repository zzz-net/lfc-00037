import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { ToastContainer } from '../common/Toast';
import { useToast } from '../../hooks/useToast';
import { useEffect } from 'react';
import { useTicketStore, useConfigStore } from '../../store';

export function ToastContext({ children }: { children: React.ReactNode }) {
  const { toasts, showToast, removeToast } = useToast();

  useEffect(() => {
    (window as unknown as { __showToast?: typeof showToast }).__showToast = showToast;
  }, [showToast]);

  return (
    <>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export function showToastGlobal(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const fn = (window as unknown as { __showToast?: (m: string, t: string) => void }).__showToast;
  if (fn) fn(message, type);
}

export default function MainLayout() {
  const fetchTickets = useTicketStore((s) => s.fetchTickets);
  const fetchAssets = useConfigStore((s) => s.fetchAssets);
  const fetchPriorities = useConfigStore((s) => s.fetchPriorities);
  const fetchTechnicians = useConfigStore((s) => s.fetchTechnicians);

  useEffect(() => {
    fetchTickets();
    fetchAssets();
    fetchPriorities();
    fetchTechnicians();
  }, [fetchTickets, fetchAssets, fetchPriorities, fetchTechnicians]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
