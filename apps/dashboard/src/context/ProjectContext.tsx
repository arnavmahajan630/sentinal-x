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
  selectProject: (p: Project) => void;
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
  loadProjectFromPath: async () => {},
  runAnalysis: async () => {},
  reloadProjects: async () => {},
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  const reloadProjects = useCallback(async () => {
    try {
      const list = await fetchProjects();
      setAllProjects(list);
      if (list.length > 0 && !activeProject) {
        // Try restoring last selected from localStorage or pick the first
        const savedId = localStorage.getItem('sx-active-project');
        const found = list.find((p) => p.projectId === savedId) || list[0];
        if (found) {
          setActiveProject(found);
        }
      }
    } catch {
      // Ignore if server unreachable
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    reloadProjects();
  }, [reloadProjects]);

  const selectProject = (p: Project) => {
    setActiveProject(p);
    localStorage.setItem('sx-active-project', p.projectId);
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
