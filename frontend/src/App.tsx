import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingDashboardPage } from './pages/LandingDashboardPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { CustomerRegisterPage } from './pages/CustomerRegisterPage';
import { CustomerLoginPage } from './pages/CustomerLoginPage';
import { CustomerProfilePage } from './pages/CustomerProfilePage';
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
            <Route element={<ProtectedRoute />}>
              <Route path="customer/profile" element={<CustomerProfilePage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
