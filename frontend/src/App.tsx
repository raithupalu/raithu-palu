import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import { RoleRedirect } from './components/RoleRedirect';
import { LandingDashboardPage } from './pages/LandingDashboardPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { CustomerRegisterPage } from './pages/CustomerRegisterPage';
import { UnifiedLoginPage } from './pages/UnifiedLoginPage';
import { CustomerProfilePage } from './pages/CustomerProfilePage';
import { AdminAccountManagementPage } from './pages/AdminAccountManagementPage';
import { CustomerManagementPage } from './pages/CustomerManagementPage';
import { StaffDashboardPage } from './pages/StaffDashboardPage';
import { FarmerDashboardPage } from './pages/FarmerDashboardPage';
import { GrazingWorkerDashboardPage } from './pages/GrazingWorkerDashboardPage';
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
            {/* Unified login for all five roles */}
            <Route path="login" element={<UnifiedLoginPage />} />
            {/* Legacy alias — redirects to unified login */}
            <Route path="admin/login" element={<UnifiedLoginPage />} />

            {/* Convenience entry — redirects authenticated user to their role dashboard */}
            <Route path="dashboard" element={<RoleRedirect />} />

            {/* Authenticated shell — blocks unauthenticated and non-ACTIVE statuses */}
            <Route element={<RequireAuth />}>
              {/* Also expose RoleRedirect inside auth shell for post-login safety */}
              <Route path="dashboard/redirect" element={<RoleRedirect />} />
            </Route>

            {/* CUSTOMER dashboard/profile */}
            <Route element={<RequireRole roles={['CUSTOMER']} />}>
              <Route path="customer/profile" element={<CustomerProfilePage />} />
              <Route path="customer/dashboard" element={<CustomerProfilePage />} />
              <Route path="customer" element={<CustomerProfilePage />} />
              <Route path="profile" element={<CustomerProfilePage />} />
            </Route>

            {/* ADMIN dashboard */}
            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route path="admin/accounts" element={<AdminAccountManagementPage />} />
              <Route path="admin/customers" element={<CustomerManagementPage />} />
              <Route path="admin" element={<AdminAccountManagementPage />} />
            </Route>

            {/* STAFF dashboard */}
            <Route element={<RequireRole roles={['STAFF']} />}>
              <Route path="staff/dashboard" element={<StaffDashboardPage />} />
              <Route path="staff" element={<StaffDashboardPage />} />
            </Route>

            {/* FARMER dashboard */}
            <Route element={<RequireRole roles={['FARMER']} />}>
              <Route path="farmer/dashboard" element={<FarmerDashboardPage />} />
              <Route path="farmer" element={<FarmerDashboardPage />} />
            </Route>

            {/* GRAZING_WORKER dashboard */}
            <Route element={<RequireRole roles={['GRAZING_WORKER']} />}>
              <Route path="grazing/dashboard" element={<GrazingWorkerDashboardPage />} />
              <Route path="grazing" element={<GrazingWorkerDashboardPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
