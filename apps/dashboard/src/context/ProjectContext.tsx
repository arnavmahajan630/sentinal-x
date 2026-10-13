import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { fetchProjects, loadLocalProject, cloneGitProject, triggerAssessment, deleteProject } from '@/lib/api';
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
  loadProjectFromPath: (path: string, name?: string) => Promise<any>;
  cloneProject: (gitUrl: string, name?: string, branch?: string) => Promise<any>;
  deleteProjectById: (projectId: string) => Promise<any>;
  runAnalysis: () => Promise<void>;
  reloadProjects: () => Promise<Project[]>;
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
  cloneProject: async () => {},
  deleteProjectById: async () => {},
  runAnalysis: async () => {},
  reloadProjects: async () => [],
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

  const reloadProjects = useCallback(async (): Promise<Project[]> => {
    try {
      const raw = await fetchProjects();
      const list = Array.isArray(raw) ? raw : [];
      setAllProjects(list);

      setActiveProject((prev) => {
        // 1. Check URL query param ?projectId=
        const urlParams = new URLSearchParams(window.location.search);
        const urlProjectId = urlParams.get('projectId');
        if (urlProjectId) {
          const match = list.find((p) => p.projectId === urlProjectId || p.name === urlProjectId);
          if (match) return match;
        }

        // 2. Check previous or saved ID
        const targetId = prev?.projectId || localStorage.getItem('sx-active-project');
        if (targetId) {
          const match = list.find((p) => p.projectId === targetId || p.name === targetId || p.name === prev?.name);
          if (match) return match;
        }

        // 3. Fallback: return null if empty, or first project if active is required
        return list[0] || null;
      });
      return list;
    } catch {
      return [];
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

  const loadProjectFromPath = async (repoPath: string, name?: string) => {
    setIsLoading(true);
    try {
      const res = await loadLocalProject(repoPath, name);
      await reloadProjects();
      if (res.project) {
        selectProject(res.project);
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  const cloneProject = async (gitUrl: string, name?: string, branch?: string) => {
    setIsLoading(true);
    try {
      const res = await cloneGitProject(gitUrl, name, branch);
      await reloadProjects();
      if (res.project) {
        selectProject(res.project);
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteProjectById = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await deleteProject(id);
      if (activeProject && (activeProject.projectId === id || activeProject.name === id)) {
        clearProject();
      }
      await reloadProjects();
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
        cloneProject,
        deleteProjectById,
        runAnalysis,
        reloadProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => useContext(ProjectContext);
