import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/layout/AppShell';
import { NAV } from '@/nav';
import { StubPage } from '@/pages/StubPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {NAV.map((item) => (
          <Route
            key={item.path}
            index={item.path === '/'}
            path={item.path === '/' ? undefined : item.path}
            element={<StubPage item={item} />}
          />
        ))}
      </Route>
    </Routes>
  );
}
