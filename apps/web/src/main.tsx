import { StrictMode, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './ui/styles.css';
import { SessionProvider, useSession } from './app/session';
import { Shell } from './app/Shell';
import { Access } from './features/Access';
import { Panel } from './features/Panel';
import { Loading } from './ui/components';

const Processes = lazy(() => import('./features/Processes'));
const DataEntry = lazy(() => import('./features/DataEntry'));
const ControlCharts = lazy(() => import('./features/ControlCharts'));
const Capability = lazy(() => import('./features/Capability'));
const History = lazy(() => import('./features/History'));
const Monitoring = lazy(() => import('./features/Monitoring'));
const Performance = lazy(() => import('./features/Performance'));
const Sampling = lazy(() => import('./features/Sampling'));
const Report = lazy(() => import('./features/Report'));
const Admin = lazy(() => import('./features/Admin'));
const Manual = lazy(() => import('./features/Manual'));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 } } });
const page = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

function Guard() {
  const { user, ready } = useSession();
  if (!ready) return <Loading text="Verificando sesión…" />;
  if (!user) return <Access />;
  return <Shell />;
}

const router = createBrowserRouter([
  {
    path: '/', element: <Guard />,
    children: [
      { index: true, element: <Panel /> },
      { path: 'fase-1', element: <Navigate to="/fase-1/procesos" replace /> },
      { path: 'fase-1/procesos', element: page(<Processes />) },
      { path: 'fase-1/entrada', element: page(<DataEntry />) },
      { path: 'fase-1/cartas', element: page(<ControlCharts />) },
      { path: 'capacidad', element: page(<Capability />) },
      { path: 'fase-2', element: <Navigate to="/fase-2/monitoreo" replace /> },
      { path: 'fase-2/monitoreo', element: page(<Monitoring />) },
      { path: 'fase-2/desempeno', element: page(<Performance />) },
      { path: 'muestreo', element: page(<Sampling />) },
      { path: 'informes', element: page(<Report />) },
      { path: 'datos', element: page(<History />) },
      { path: 'admin', element: page(<Admin />) },
      { path: 'manual', element: page(<Manual />) },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>
);
