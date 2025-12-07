import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary específico para formulários
 * Mostra mensagem compacta sem recarregar a página inteira
 */
export class FormErrorBoundary extends Component<Props, State> {
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
    logger.error('FormErrorBoundary caught an error:', error, errorInfo);
    
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        errorBoundary: 'form',
      },
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
    
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-body">Erro no formulário</AlertTitle>
            <AlertDescription className="text-caption mt-2">
              <p>
                {this.props.fallbackMessage || 'Ocorreu um erro ao processar o formulário. Por favor, tente novamente.'}
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer">Detalhes</summary>
                  <pre className="mt-1 whitespace-pre-wrap">{this.state.error.toString()}</pre>
                </details>
              )}
            </AlertDescription>
          </Alert>
          <Button 
            onClick={this.handleReset}
            variant="outline"
            size="sm"
            className="mt-3 text-caption"
          >
            Tentar Novamente
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
