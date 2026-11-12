import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/AuthContext.jsx';
import { ConfirmProvider, Spinner } from './components/ui.jsx';
import AppShell from './components/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Projects = lazy(() => import('./pages/Projects.jsx'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const Commands = lazy(() => import('./pages/Commands.jsx'));
const Services = lazy(() => import('./pages/Services.jsx'));
const Notes = lazy(() => import('./pages/Notes.jsx'));
const NoteDetail = lazy(() => import('./pages/NoteDetail.jsx'));
const Activity = lazy(() => import('./pages/Activity.jsx'));
const GitHub = lazy(() => import('./pages/GitHub.jsx'));
const SearchPage = lazy(() => import('./pages/SearchPage.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

function FullPageLoader({ label = 'Loading workspace…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
        <span className="text-[17px] font-black">D</span>
      </div>
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <Spinner size={13} /> {label}
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export default function App() {
  const { user, booting } = useAuth();

  return (
    <ConfirmProvider>
      <ScrollToTop />
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route
            path="/login"
            element={booting ? <FullPageLoader /> : user ? <Navigate to="/" replace /> : <LoginPage />}
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="commands" element={<Commands />} />
            <Route path="services" element={<Services />} />
            <Route path="notes" element={<Notes />} />
            <Route path="notes/:id" element={<NoteDetail />} />
            <Route path="activity" element={<Activity />} />
            <Route path="github" element={<GitHub />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ConfirmProvider>
  );
}
