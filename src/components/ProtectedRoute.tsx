import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Shield } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  allowedRoles?: ('admin' | 'user' | 'subscriber' | 'trial')[];
}

export function ProtectedRoute({ 
  children, 
  requireAdmin = false, 
  allowedRoles = ['admin', 'user', 'subscriber', 'trial'] 
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <Card className="financial-card p-4 sm:p-6">
          <CardContent className="flex flex-col items-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Verificando permissões...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Se o usuário está logado, mas o perfil ainda não carregou,
  // mostramos uma tela de carregamento específica para o perfil.
  // Isso evita a exibição da mensagem "Perfil não encontrado" durante o carregamento inicial.
  if (user && !profile) {
    return null;
  }

  // A verificação de perfil não encontrado foi movida para depois do carregamento.
  // Se após o 'loading' o perfil ainda for nulo, aí sim é um erro.
  // Check if profile exists and is active
  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <Card className="financial-card p-4 sm:p-6">
          <CardContent className="flex flex-col items-center space-y-3 text-center">
            <Shield className="h-12 w-12 text-warning" />
            <div>
              <h3 className="text-lg font-semibold">Carregando Perfil</h3>
              <p className="text-muted-foreground">
                Aguarde enquanto carregamos suas informações...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <Card className="financial-card p-4 sm:p-6">
          <CardContent className="flex flex-col items-center space-y-3 text-center">
            <Shield className="h-12 w-12 text-destructive" />
            <div>
              <h3 className="text-lg font-semibold">Conta Desativada</h3>
              <p className="text-muted-foreground">
                Sua conta foi desativada. Entre em contato com o administrador 
                para reativar o acesso.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requireAdmin && profile.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <Card className="financial-card p-4 sm:p-6">
          <CardContent className="flex flex-col items-center space-y-3 text-center">
            <Shield className="h-12 w-12 text-warning" />
            <div>
              <h3 className="text-lg font-semibold">Acesso Restrito</h3>
              <p className="text-muted-foreground">
                Você precisa de permissões de administrador para acessar esta área.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!allowedRoles.includes(profile.role)) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <Card className="financial-card p-4 sm:p-6">
          <CardContent className="flex flex-col items-center space-y-3 text-center">
            <Shield className="h-12 w-12 text-warning" />
            <div>
              <h3 className="text-lg font-semibold">Permissões Insuficientes</h3>
              <p className="text-muted-foreground">
                Seu nível de acesso não permite visualizar este conteúdo.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}