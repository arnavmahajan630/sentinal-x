import {
  BookOpen,
  Bot,
  FileSearch,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Network,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  quote?: string;
  /** Phase that fills this page (shown in the C0 empty state). */
  phase: string;
}

/** The 9 dashboard views (from the final UI images). */
export const NAV: NavItem[] = [
  {
    path: '/',
    label: 'Overview',
    icon: LayoutDashboard,
    title: 'Overview',
    tagline: 'Analyze. Understand. Verify. Track.',
    phase: 'C11',
  },
  {
    path: '/attack-surface',
    label: 'Attack Surface',
    icon: ShieldAlert,
    title: 'Attack Surface',
    tagline: 'Every exposed route, entry point, and security boundary in your application.',
    quote: 'Attack surface is not just what you expose, but what you assume.',
    phase: 'C11',
  },
  {
    path: '/graph',
    label: 'Security Graph',
    icon: Network,
    title: 'Security Graph',
    tagline: 'Visualize your application. See how it all connects.',
    quote: 'Every vulnerability is a path. The graph shows the bigger picture.',
    phase: 'C2 / C11',
  },
  {
    path: '/findings',
    label: 'Findings',
    icon: FileSearch,
    title: 'Findings',
    tagline: 'All discovered security issues, ranked by risk and backed by real evidence.',
    quote: 'Findings turn uncertainty into action.',
    phase: 'C7',
  },
  {
    path: '/agents',
    label: 'Agent Activity',
    icon: Bot,
    title: 'Agent Activity',
    tagline: 'Watch specialist agents investigate your application, live.',
    phase: 'C5 – C6',
  },
  {
    path: '/verification',
    label: 'Verification',
    icon: FlaskConical,
    title: 'Verification',
    tagline: 'Automatically verify security findings with real exploits in a safe environment.',
    quote: "Don't just find vulnerabilities. Prove them.",
    phase: 'C7',
  },
  {
    path: '/changes',
    label: 'Changes',
    icon: GitBranch,
    title: 'Changes',
    tagline: 'Code changes, their security impact, and how findings transition over time.',
    phase: 'C10',
  },
  {
    path: '/knowledge',
    label: 'Knowledge',
    icon: BookOpen,
    title: 'Knowledge',
    tagline: 'The security playbooks that guide how agents investigate and what proves a bug.',
    phase: 'C4',
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    title: 'Settings',
    tagline: 'Engine, LLM provider, and sandbox configuration.',
    phase: 'C11',
  },
];
