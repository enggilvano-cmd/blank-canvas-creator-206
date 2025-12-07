import React, { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  routeName: string;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * ✅ BUG FIX #10: Granular error boundary per route
 * Prevents entire app crash when a single route fails
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { routeName } = this.props;
    
    logger.error(`Error in route: ${routeName}`, {
      error,
      errorInfo,
      componentStack: errorInfo.componentStack,
    });

    // Send to Sentry with route context
    captureException(error, {
      contexts: {
        route: {
          name: routeName,
          componentStack: errorInfo.componentStack,
        },
      },
    });

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    const { onReset } = this.props;
    
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    if (onReset) {
      onReset();
    }
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, routeName } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-2xl w-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Erro na Página</CardTitle>
                  <CardDescription>
                    Ocorreu um erro ao carregar {routeName}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {import.meta.env.DEV && error && (
                <div className="p-4 rounded-lg bg-muted">
                  <p className="text-sm font-mono text-muted-foreground">
                    {error.toString()}
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={this.handleReset}
                  className="flex-1"
                  variant="default"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar Novamente
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  className="flex-1"
                  variant="outline"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Voltar ao Início
                </Button>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Se o problema persistir, tente{' '}
                <button
                  onClick={() => window.location.reload()}
                  className="underline hover:text-foreground"
                >
                  recarregar a página
                </button>
                {' '}ou entre em contato com o suporte.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }
}
