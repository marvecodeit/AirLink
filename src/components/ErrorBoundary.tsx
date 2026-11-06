import { CircleAlert, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("AirLink interface error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-canvas px-8">
          <div className="w-full max-w-[440px] rounded-2xl border border-hairline bg-surface p-6 text-center shadow-float">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
              <CircleAlert className="h-5 w-5" />
            </div>
            <h1 className="mt-4 text-[17px] font-semibold tracking-[-0.02em] text-ink">
              The interface hit a problem
            </h1>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-secondary">
              Your network connection was not changed. Reload the interface to
              continue.
            </p>
            <pre className="mt-3 max-h-24 overflow-auto rounded-lg border border-hairline bg-surface-muted p-2 text-left font-mono text-[10px] text-ink-tertiary">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand px-4 text-[12.5px] font-medium text-white dark:text-[#052312]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reload interface
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
