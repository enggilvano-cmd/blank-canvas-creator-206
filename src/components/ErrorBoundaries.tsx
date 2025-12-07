import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: string[];
  context?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Granular
 * Use para seções específicas da aplicação
 */
export class GranularErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, context } = this.props;
    
    logger.error(`ErrorBoundary${context ? ` - ${context}` : ''}:`, error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Callback customizado
    if (onError) {
      onError(error, errorInfo);
    }

    // Send to Sentry with context
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
        errorBoundary: {
          context: context || 'unknown',
        },
      },
      tags: {
        errorBoundary: true,
        context: context || 'unknown',
      },
    });
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys = [] } = this.props;
    const { hasError } = this.state;

    if (hasError && resetKeys.length > 0) {
      const hasResetKeyChanged = resetKeys.some(
        (key, index) => prevProps.resetKeys?.[index] !== key
      );
      
      if (hasResetKeyChanged) {
        this.handleReset();
      }
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, context } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="p-4 md:p-6 max-w-2xl mx-auto">
          <Alert variant="destructive" className="border-2">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="text-lg font-semibold">
              Erro {context ? `em ${context}` : 'inesperado'}
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p>
                Ocorreu um erro nesta seção. Você pode tentar recarregar esta parte ou voltar.
              </p>
              {process.env.NODE_ENV === 'development' && error && (
                <details className="mt-4 p-4 bg-muted rounded-md text-xs overflow-auto">
                  <summary className="cursor-pointer font-semibold mb-2">
                    Detalhes do erro (apenas em desenvolvimento)
                  </summary>
                  <pre className="whitespace-pre-wrap break-words">
                    {error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
            </AlertDescription>
          </Alert>

          <div className="flex gap-3 justify-center mt-4">
            <Button 
              onClick={this.handleReset}
              variant="default"
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar Novamente
            </Button>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Error Boundary para Transações
 */
export class TransactionErrorBoundary extends Component<Omit<Props, 'context'>, State> {
  constructor(props: Omit<Props, 'context'>) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('TransactionErrorBoundary:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        errorBoundary: true,
        section: 'transactions',
      },
    });
  }

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
        <div className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h3 className="text-lg font-semibold mb-2">
            Erro ao carregar transações
          </h3>
          <p className="text-muted-foreground mb-4">
            Ocorreu um erro ao processar as transações. Tente novamente.
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={this.handleReset} variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar Novamente
            </Button>
            <Button onClick={() => window.location.href = '/'} variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Ir para Dashboard
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Error Boundary para Dashboard
 */
export class DashboardErrorBoundary extends Component<Omit<Props, 'context'>, State> {
  constructor(props: Omit<Props, 'context'>) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('DashboardErrorBoundary:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        errorBoundary: true,
        section: 'dashboard',
      },
    });
  }

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
        <div className="p-6 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h3 className="text-lg font-semibold mb-2">
            Erro ao carregar dashboard
          </h3>
          <p className="text-muted-foreground mb-4">
            Não foi possível carregar os dados do dashboard.
          </p>
          <Button onClick={this.handleReset} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" />
            Recarregar Dashboard
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Error Boundary para Análises/Charts
 */
export class AnalyticsErrorBoundary extends Component<Omit<Props, 'context'>, State> {
  constructor(props: Omit<Props, 'context'>) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('AnalyticsErrorBoundary:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        errorBoundary: true,
        section: 'analytics',
      },
    });
  }

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
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar análises</AlertTitle>
          <AlertDescription>
            <p className="mb-2">Os gráficos não puderam ser carregados.</p>
            <Button onClick={this.handleReset} variant="outline" size="sm">
              Tentar Novamente
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}
