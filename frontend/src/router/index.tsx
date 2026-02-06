import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute.tsx';
import { LoginPage } from '../pages/LoginPage.tsx';
import { AuthCallbackPage } from '../pages/AuthCallbackPage.tsx';
import { DashboardPage } from '../pages/DashboardPage.tsx';
import { PatientsPage } from '../pages/PatientsPage.tsx';
import { DoctorsPage } from '../pages/DoctorsPage.tsx';
import { ServicesPage } from '../pages/ServicesPage.tsx';
import { RoomsPage } from '../pages/RoomsPage.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <DashboardPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/patients',
    element: (
      <ProtectedRoute>
        <PatientsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/doctors',
    element: (
      <ProtectedRoute>
        <DoctorsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/services',
    element: (
      <ProtectedRoute>
        <ServicesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/rooms',
    element: (
      <ProtectedRoute>
        <RoomsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
