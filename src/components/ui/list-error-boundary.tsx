import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary específico para listas
 * Mostra mensagem compacta sem quebrar o resto da página
 */
export class ListErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ListErrorBoundary caught an error:', error, errorInfo);
    
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        errorBoundary: 'list',
      },
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="my-4">
          <CardContent className="pt-6 pb-6 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="space-y-2">
                <p className="text-body font-medium">
                  {this.props.fallbackMessage || 'Erro ao carregar lista'}
                </p>
                <p className="text-caption text-muted-foreground">
                  Ocorreu um erro ao exibir os dados. Por favor, tente novamente.
                </p>
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mt-2 text-xs text-left">
                    <summary className="cursor-pointer">Detalhes do erro</summary>
                    <pre className="mt-2 p-2 bg-muted rounded text-left whitespace-pre-wrap">
                      {this.state.error.toString()}
                    </pre>
                  </details>
                )}
              </div>
              <Button 
                onClick={this.handleReset}
                variant="outline"
                size="sm"
                className="gap-2 text-caption"
              >
                <RefreshCw className="h-3 w-3" />
                Tentar Novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
