import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ProjectModal } from '@/components/ProjectModal';

export function AppShell() {
  const [projectModalOpen, setProjectModalOpen] = useState(false);

  return (
    <div className="flex h-full bg-bg text-fg">
      <Sidebar onOpenProjectModal={() => setProjectModalOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenProjectModal={() => setProjectModalOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
          <Outlet />
        </main>
      </div>
      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
      />
    </div>
  );
}
