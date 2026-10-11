import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error inside ErrorBoundary:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-danger/30 bg-surface/80 p-8 text-center shadow-xl">
          <div className="grid size-14 place-items-center rounded-2xl bg-danger/15 text-danger mb-4 shadow-sm">
            <AlertOctagon className="size-7" />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-fg">
            {this.props.fallbackTitle || 'Component Render Error'}
          </h2>

          <p className="mt-2 max-w-lg text-sm text-muted">
            An unexpected error occurred while rendering this view. Your session and sidebar remain active.
          </p>

          {this.state.error?.message && (
            <div className="mt-4 max-w-xl rounded-xl border border-danger/20 bg-danger/5 px-4 py-2.5 font-mono text-xs text-danger text-left overflow-x-auto">
              {this.state.error.message}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="size-3.5" />
              Try Again
            </button>

            <Link
              to="/overview"
              onClick={this.handleReset}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface-alt px-4 py-2 text-xs font-semibold text-fg hover:bg-surface transition-colors"
            >
              <Home className="size-3.5" />
              Return to Overview
            </Link>

            <Link
              to="/"
              onClick={this.handleReset}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface-alt px-4 py-2 text-xs font-semibold text-muted hover:text-fg hover:bg-surface transition-colors"
            >
              Projects Landing
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
