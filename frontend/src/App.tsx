import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';
import { LandingDashboardPage } from './pages/LandingDashboardPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { CustomerRegisterPage } from './pages/CustomerRegisterPage';
import { CustomerLoginPage } from './pages/CustomerLoginPage';
import { CustomerProfilePage } from './pages/CustomerProfilePage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminAccountManagementPage } from './pages/AdminAccountManagementPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<LandingDashboardPage />} />
            <Route path="system-status" element={<SystemStatusPage />} />
            <Route path="register" element={<CustomerRegisterPage />} />
            <Route path="login" element={<CustomerLoginPage />} />
            <Route path="admin/login" element={<AdminLoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="customer/profile" element={<CustomerProfilePage />} />
              <Route
                path="customer/dashboard"
                element={<CustomerProfilePage />}
              />
              <Route path="dashboard" element={<CustomerProfilePage />} />
              <Route path="profile" element={<CustomerProfilePage />} />
            </Route>
            <Route element={<AdminProtectedRoute />}>
              <Route
                path="admin/accounts"
                element={<AdminAccountManagementPage />}
              />
              <Route path="admin" element={<AdminAccountManagementPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
