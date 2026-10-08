import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/layout/AppShell';
import { Overview } from '@/pages/Overview';
import { AttackSurface } from '@/pages/AttackSurface';
import { Graph } from '@/pages/Graph';
import { Findings } from '@/pages/Findings';
import { AgentActivity } from '@/pages/AgentActivity';
import { Verification } from '@/pages/Verification';
import { Changes } from '@/pages/Changes';
import { Knowledge } from '@/pages/Knowledge';
import { Settings } from '@/pages/Settings';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="attack-surface" element={<AttackSurface />} />
        <Route path="graph" element={<Graph />} />
        <Route path="findings" element={<Findings />} />
        <Route path="agents" element={<AgentActivity />} />
        <Route path="verification" element={<Verification />} />
        <Route path="changes" element={<Changes />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
