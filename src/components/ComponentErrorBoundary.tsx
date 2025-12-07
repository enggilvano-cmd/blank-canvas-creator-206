import React, { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  componentName: string;
  fallback?: ReactNode;
  silent?: boolean; // Se true, apenas loga sem mostrar UI de erro
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ✅ BUG FIX #10: Granular error boundary for components
 * Prevents component errors from crashing entire page
 */
export class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { componentName, silent } = this.props;
    
    logger.error(`Error in component: ${componentName}`, {
      error,
      errorInfo,
      componentStack: errorInfo.componentStack,
    });

    captureException(error, {
      contexts: {
        component: {
          name: componentName,
          componentStack: errorInfo.componentStack,
        },
      },
    });

    if (silent) {
      // Em modo silencioso, apenas loga mas não mostra erro
      this.setState({ hasError: false });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, componentName, silent } = this.props;

    if (hasError && !silent) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium">
                Erro ao carregar {componentName}
              </p>
              {import.meta.env.DEV && error && (
                <p className="text-xs font-mono text-muted-foreground">
                  {error.toString()}
                </p>
              )}
              <Button
                onClick={this.handleReset}
                size="sm"
                variant="outline"
                className="mt-2"
              >
                Tentar Novamente
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}
