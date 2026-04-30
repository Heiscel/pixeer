import { Component, type ReactNode, type ErrorInfo } from 'react';
import type { TelemetryReporter } from './TelemetryReporter.js';

interface Props {
  reporter: TelemetryReporter;
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * React error boundary that reports component errors to TelemetryReporter.
 *
 * @example
 * <TelemetryErrorBoundary reporter={reporter} fallback={<ErrorPage />}>
 *   <App />
 * </TelemetryErrorBoundary>
 */
export class TelemetryErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.reporter.track('react_error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
