import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { fetchProjects, loadLocalProject, triggerAssessment } from '@/lib/api';
import type { Project } from '@/lib/api';

interface ProjectContextType {
  activeProject: Project | null;
  projectId: string | null;
  allProjects: Project[];
  isLoading: boolean;
  isAnalyzing: boolean;
  currentRunId: string | null;
  selectProject: (p: Project | null) => void;
  clearProject: () => void;
  loadProjectFromPath: (path: string) => Promise<any>;
  runAnalysis: () => Promise<void>;
  reloadProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType>({
  activeProject: null,
  projectId: null,
  allProjects: [],
  isLoading: false,
  isAnalyzing: false,
  currentRunId: null,
  selectProject: () => {},
  clearProject: () => {},
  loadProjectFromPath: async () => {},
  runAnalysis: async () => {},
  reloadProjects: async () => {},
});

export function ProjectProvider({
  children,
  initialProject = null,
}: {
  children: ReactNode;
  initialProject?: Project | null;
}) {
  const [activeProject, setActiveProject] = useState<Project | null>(initialProject);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  const reloadProjects = useCallback(async () => {
    try {
      const raw = await fetchProjects();
      const list = Array.isArray(raw) ? raw : [];
      setAllProjects(list);
      // If a project is currently active, keep its data updated
      setActiveProject((prev) => {
        if (!prev) return null;
        return list.find((p) => p.projectId === prev.projectId) || prev;
      });
    } catch {
      // Ignore if server unreachable
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadProjects();
  }, [reloadProjects]);

  const selectProject = (p: Project | null) => {
    setActiveProject(p);
    if (p) {
      localStorage.setItem('sx-active-project', p.projectId);
    } else {
      localStorage.removeItem('sx-active-project');
    }
  };

  const clearProject = () => {
    selectProject(null);
  };

  const loadProjectFromPath = async (repoPath: string) => {
    setIsLoading(true);
    try {
      const res = await loadLocalProject(repoPath);
      await reloadProjects();
      if (res.project) {
        selectProject(res.project);
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (!activeProject) return;
    setIsAnalyzing(true);
    try {
      const runId = `run-${Date.now().toString(36)}`;
      setCurrentRunId(runId);
      await triggerAssessment(activeProject.projectId, 'full');
    } catch (err) {
      console.error('Failed to trigger analysis:', err);
    } finally {
      // Keep analyzing indicator briefly until SSE picks up
      setTimeout(() => setIsAnalyzing(false), 2000);
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        activeProject,
        projectId: activeProject?.projectId ?? null,
        allProjects,
        isLoading,
        isAnalyzing,
        currentRunId,
        selectProject,
        clearProject,
        loadProjectFromPath,
        runAnalysis,
        reloadProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => useContext(ProjectContext);
