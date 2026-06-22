import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout, { ToastContext } from './components/layout/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TicketList from './pages/TicketList';
import TicketDetail from './pages/TicketDetail';
import SubmitTicket from './pages/SubmitTicket';
import ConfigPriorities from './pages/ConfigPriorities';
import ConfigAssets from './pages/ConfigAssets';
import ExportCenter from './pages/ExportCenter';
import { useAuthStore } from './store';
import type { UserRole } from '../shared/types';

function RequireAuth({ children, allowedRoles }: { children: JSX.Element; allowedRoles?: UserRole[] }) {
  const { user, token, checkAuth } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!user && token) checkAuth();
  }, [user, token, checkAuth]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Router>
      <ToastContext>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <MainLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="tickets" element={<TicketList />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="submit" element={<SubmitTicket />} />
            <Route
              path="config/priorities"
              element={
                <RequireAuth allowedRoles={['admin']}>
                  <ConfigPriorities />
                </RequireAuth>
              }
            />
            <Route
              path="config/assets"
              element={
                <RequireAuth allowedRoles={['admin']}>
                  <ConfigAssets />
                </RequireAuth>
              }
            />
            <Route
              path="export"
              element={
                <RequireAuth allowedRoles={['admin']}>
                  <ExportCenter />
                </RequireAuth>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastContext>
    </Router>
  );
}
