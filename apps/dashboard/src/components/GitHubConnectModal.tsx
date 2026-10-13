import { useState } from 'react';
import {
  Github,
  X,
  CheckCircle2,
  Loader2,
  Search,
  ArrowRight,
  FolderGit2,
  ExternalLink,
  Shield,
  Star,
  RefreshCw,
} from 'lucide-react';

interface GitHubConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportRepo: (repoPath: string, repoName: string, isRemoteUrl?: boolean) => void;
}

interface MockRepo {
  name: string;
  fullName: string;
  description: string;
  stars: number;
  tags: string[];
  path: string;
  isRemote?: boolean;
}

export function GitHubConnectModal({ isOpen, onClose, onImportRepo }: GitHubConnectModalProps) {
  const [usernameInput, setUsernameInput] = useState('');
  const [connectedUser, setConnectedUser] = useState<string | null>(() => {
    try {
      return typeof window !== 'undefined' ? window.localStorage?.getItem('sx-github-connected-user') : null;
    } catch {
      return null;
    }
  });
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  if (!isOpen) return null;

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = usernameInput.trim() || 'arnav630';
    setIsAuthorizing(true);
    setTimeout(() => {
      setIsAuthorizing(false);
      setConnectedUser(targetUser);
      try {
        window.localStorage?.setItem('sx-github-connected-user', targetUser);
      } catch {}
    }, 1200);
  };

  const handleDisconnect = () => {
    setConnectedUser(null);
    try {
      window.localStorage?.removeItem('sx-github-connected-user');
    } catch {}
  };

  const userRepos: MockRepo[] = [
    {
      name: 'vulnerable-mern-app',
      fullName: `${connectedUser || 'user'}/vulnerable-mern-app`,
      description: 'Deliberately vulnerable MERN application for security research and automated verification.',
      stars: 42,
      tags: ['Express', 'React', 'Node.js', 'MongoDB'],
      path: '/app/sandbox-target',
    },
    {
      name: 'mern-auth-service',
      fullName: `${connectedUser || 'user'}/mern-auth-service`,
      description: 'Authentication microservice with JWT tokens, role middleware, and MongoDB.',
      stars: 18,
      tags: ['Express', 'TypeScript', 'MongoDB'],
      path: '/app/sandbox-target',
    },
    {
      name: 'ecommerce-platform',
      fullName: `${connectedUser || 'user'}/ecommerce-platform`,
      description: 'Modular shopping cart and order processing backend with Mongoose schemas.',
      stars: 27,
      tags: ['Express', 'React', 'MongoDB'],
      path: '/app/sandbox-target',
    },
  ];

  const filteredRepos = userRepos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      r.description.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border/90 bg-surface p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3.5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-alt border border-border/80 text-fg">
              <Github className="size-5" />
            </span>
            <div>
              <h3 className="font-bold text-fg text-base">Connect GitHub</h3>
              <p className="text-xs text-muted">Import repositories from your GitHub account</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* State 1: Disconnected */}
        {!connectedUser ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-border/70 bg-surface-alt/40 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                <Shield className="size-4 text-primary" />
                <span>Secure Read-Only Access</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Connect your GitHub account to import private or public repositories. Sentinel-X only reads AST
                syntax and never modifies remote repository code.
              </p>
            </div>

            <form onSubmit={handleConnect} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-fg mb-1">GitHub Account Handle</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs text-muted font-mono">@</span>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Enter username (e.g. arnav630)"
                    disabled={isAuthorizing}
                    className="w-full rounded-xl border border-border bg-surface-alt py-2 pl-8 pr-3 text-xs text-fg placeholder:text-muted/50 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAuthorizing}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-all cursor-pointer"
              >
                {isAuthorizing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Authorizing with GitHub OAuth...</span>
                  </>
                ) : (
                  <>
                    <Github className="size-4" />
                    <span>Connect GitHub Account</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* State 2: Connected */
          <div className="space-y-4">
            {/* Account Status Card */}
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-fg">Connected as</span>
                <span className="font-mono text-primary font-bold">@{connectedUser}</span>
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-[11px] text-muted hover:text-danger hover:underline cursor-pointer"
              >
                Disconnect
              </button>
            </div>

            {/* Search Filter */}
            <div className="relative">
              <Search className="absolute left-3.5 top-2.5 size-3.5 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search repositories in your account..."
                className="w-full rounded-xl border border-border/80 bg-surface-alt/50 py-2 pl-9 pr-3 text-xs text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Repository List */}
            <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
              {filteredRepos.map((repo) => (
                <div
                  key={repo.name}
                  className="flex items-center justify-between rounded-xl border border-border/80 bg-surface-alt/30 p-3 transition-colors hover:border-primary/40 hover:bg-surface-alt/60"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="size-3.5 text-primary shrink-0" />
                      <span className="font-bold text-fg text-xs truncate">{repo.name}</span>
                      <span className="rounded bg-surface px-1.5 py-0.2 font-mono text-[10px] text-muted flex items-center gap-0.5">
                        <Star className="size-2.5" />
                        <span>{repo.stars}</span>
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted line-clamp-1">{repo.description}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {repo.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-surface border border-border/60 px-1.5 py-0.2 font-mono text-[9.5px] text-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onImportRepo(repo.path, repo.name, repo.isRemote);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-primary/90 shrink-0 cursor-pointer"
                  >
                    <span>Import & Analyze</span>
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              ))}

              {filteredRepos.length === 0 && (
                <div className="py-6 text-center text-xs text-muted">
                  No repositories match "{searchFilter}".
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
