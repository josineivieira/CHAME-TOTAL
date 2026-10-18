import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { me, ApiError } from '../services/api';
import { Session, can, useSession } from './session';
import { Shell } from '../layouts/Shell';
import { SetupPage } from '../modules/auth/SetupPage';
import { AuthPage } from '../modules/auth/AuthPage';
import { lazy, Suspense } from 'react';
const Dashboard = lazy(() =>
  import('../modules/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })),
);
import { EntityView } from '../modules/catalog/EntityView';
import { Catalog, EntityForm } from '../modules/catalog/Catalog';
import { entities } from '../modules/catalog/config';
import { Guard, operations } from '../routes/operations';
import { Feedback, Loading, Title } from '../components/ui';
function Protected() {
  const location = useLocation();
  const query = useQuery({ queryKey: ['session'], queryFn: me, retry: false, staleTime: 30000 });
  if (query.isLoading) return <Loading />;
  if (query.error) {
    if (query.error instanceof ApiError && query.error.status === 401)
      return <Navigate to="/login" replace />;
    return (
      <>
        <Feedback error={query.error} />
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      </>
    );
  }
  if (!query.data) return <Navigate to="/login" replace />;
  if (query.data.mfaRequired && !query.data.mfaEnabled && location.pathname !== '/security')
    return <Navigate to="/security" replace />;
  return (
    <Session.Provider value={query.data}>
      <Outlet />
    </Session.Provider>
  );
}
function Landing() {
  const user = useSession();
  if (can(user, 'dashboard.read'))
    return (
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
    );
  const path = can(user, 'sales.create')
    ? '/pdv'
    : can(user, 'finance.read')
      ? '/finance'
      : '/inventory';
  return <Navigate to={path} replace />;
}
const catalogRoutes = Object.entries(entities).flatMap(([resource, c]) => [
  {
    path: resource,
    element: (
      <Guard permission={c.read}>
        <Catalog resource={resource} />
      </Guard>
    ),
  },
  {
    path: resource + '/:id',
    element: (
      <Guard permission={c.read}>
        <EntityView resource={resource} />
      </Guard>
    ),
  },
  {
    path: resource + '/new',
    element: (
      <Guard permission={c.write}>
        <EntityForm key={resource + 'new'} resource={resource} />
      </Guard>
    ),
  },
  {
    path: resource + '/:id/edit',
    element: (
      <Guard permission={c.write}>
        <EntityForm key={resource + 'edit'} resource={resource} />
      </Guard>
    ),
  },
]);
const router = createBrowserRouter([
  { path: '/setup', element: <SetupPage /> },
  { path: '/login', element: <AuthPage /> },
  { path: '/reset', element: <AuthPage reset /> },
  {
    element: <Protected />,
    children: [
      {
        path: '/',
        element: <Shell />,
        children: [
          { index: true, element: <Landing /> },
          ...catalogRoutes,
          ...operations,
          {
            path: '*',
            element: (
              <Title title="Página não encontrada" subtitle="Escolha uma opção no menu lateral." />
            ),
          },
        ],
      },
    ],
  },
]);
export function App() {
  return <RouterProvider router={router} />;
}
