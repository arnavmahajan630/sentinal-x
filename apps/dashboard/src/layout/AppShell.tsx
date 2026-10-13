import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ProjectModal } from '@/components/ProjectModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function AppShell() {
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('sx-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sx-sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-full bg-bg text-fg overflow-hidden">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        onOpenProjectModal={() => setProjectModalOpen(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out">
        <TopBar
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          onOpenProjectModal={() => setProjectModalOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
          <ErrorBoundary fallbackTitle="Page Render Error">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
      />
    </div>
  );
}
