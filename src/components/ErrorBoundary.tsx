import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';
import { monitoring } from '@/lib/monitoring';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Track error in monitoring service
    monitoring.trackError(error, {
      component: 'ErrorBoundary',
      action: 'render',
      metadata: { componentStack: errorInfo.componentStack }
    });

    // Send error to Sentry with full context
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        errorBoundary: true,
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <div className="max-w-2xl w-full space-y-6">
            <Alert variant="destructive" className="border-2">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="text-lg font-semibold">
                Algo deu errado
              </AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                <p>
                  Desculpe, ocorreu um erro inesperado. Por favor, tente recarregar a página.
                </p>
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mt-4 p-4 bg-muted rounded-md text-xs overflow-auto">
                    <summary className="cursor-pointer font-semibold mb-2">
                      Detalhes do erro (apenas em desenvolvimento)
                    </summary>
                    <pre className="whitespace-pre-wrap break-words">
                      {this.state.error.toString()}
                      {this.state.errorInfo?.componentStack}
                    </pre>
                  </details>
                )}
              </AlertDescription>
            </Alert>

            <div className="flex gap-3 justify-center">
              <Button 
                onClick={this.handleReload}
                variant="default"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Recarregar Página
              </Button>
              <Button 
                onClick={this.handleReset}
                variant="outline"
              >
                Tentar Novamente
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
