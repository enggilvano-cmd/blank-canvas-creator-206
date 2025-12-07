import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Error Boundary específico para cards/widgets
 * Mostra mensagem minimalista inline sem quebrar o layout
 */
export class CardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(_error: Error): State {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('CardErrorBoundary caught an error:', error, errorInfo);
    
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        errorBoundary: 'card',
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-caption font-medium text-destructive">
                {this.props.fallbackMessage || 'Erro ao carregar dados'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recarregue a página para tentar novamente
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
