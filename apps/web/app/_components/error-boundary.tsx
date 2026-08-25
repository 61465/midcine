'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * React error boundary — catches render/lifecycle exceptions in the tree
 * so PHI screens stay accessible (audit trail, log out) instead of white-screening.
 * Compliance: HIPAA §164.312 requires graceful degradation of PHI systems.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Non-blocking beacon to bridge — never rethrow from here.
    try {
      fetch('/api/mcp/audit/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          message: error.message,
          stack: (error.stack || '').slice(0, 2000),
          componentStack: (info.componentStack || '').slice(0, 2000),
          url: typeof window !== 'undefined' ? window.location.pathname : '',
          ts: Date.now(),
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0E14] p-6 text-slate-200">
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
          <h2 className="mb-2 text-lg font-bold text-rose-200">Something went wrong</h2>
          <p className="mb-4 text-sm text-slate-400">
            The page hit an error but your data is safe. Try reloading, or contact support with the
            request ID from the network tab.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
