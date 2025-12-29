import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { User, Shield, Key, Activity, ShieldCheck, ShieldOff } from 'lucide-react';
import { TwoFactorSetup } from "@/components/TwoFactorSetup";
import { logger } from '@/lib/logger';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
}

export function UserProfile() {
  const { user, profile, signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [recentActivities, setRecentActivities] = useState<AuditLog[]>([]);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [showDisableMfaDialog, setShowDisableMfaDialog] = useState(false);
  const [formData, setFormData] = useState({
    fullName: profile?.full_name || '',
    email: profile?.email || '',
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        fullName: profile.full_name || '',
        email: profile.email || '',
      });
      fetchRecentActivities();
      checkMfaStatus();
    }
  }, [profile]);

  const fetchRecentActivities = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, resource_type, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentActivities(data || []);
    } catch (error) {
      logger.error('Error fetching activities:', error);
    }
  };

  const checkMfaStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      
      const hasMfa = data?.totp && data.totp.length > 0;
      setMfaEnabled(hasMfa);
    } catch (error) {
      logger.error('Error checking MFA status:', error);
    }
  };

  const handleDisableMfa = async () => {
    setLoading(true);
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;

      const totpFactor = factors?.totp?.[0];
      if (!totpFactor) {
        throw new Error('Autenticação de dois fatores não encontrada');
      }

      const { error } = await supabase.auth.mfa.unenroll({ factorId: totpFactor.id });
      if (error) throw error;

      setMfaEnabled(false);
      setShowDisableMfaDialog(false);
      
      toast({
        title: '2FA Desabilitado',
        description: 'A autenticação de dois fatores foi desabilitada',
      });
    } catch (error) {
      logger.error('Error disabling MFA:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao desabilitar 2FA',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const emailChanged = formData.email !== profile.email;

      // If email changed, request Auth email update with redirect for confirmation
      if (emailChanged) {
        const { error: authError } = await supabase.auth.updateUser(
          { email: formData.email },
          { emailRedirectTo: `${window.location.origin}/auth` }
        );
        if (authError) throw authError;

      toast({
        title: 'Verificação Necessária',
        description: 'Um email de confirmação foi enviado para o novo endereço',
      });
      }

      // Update profile data (do NOT change profiles.email until confirmation)
      const updates: {
        full_name: string;
        email?: string;
      } = {
        full_name: formData.fullName,
      };
      if (!emailChanged) {
        updates.email = formData.email;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', profile.user_id);

      if (error) throw error;

      // Log the activity
      await supabase.rpc('log_user_activity', {
        p_user_id: profile.user_id,
        p_action: 'profile_updated',
        p_resource_type: 'profile',
        p_resource_id: profile.user_id
      });

      toast({
        title: 'Sucesso',
        description: emailChanged
          ? 'Nome atualizado. Confirme o novo email para completar a alteração'
          : 'Perfil atualizado com sucesso',
      });
    } catch (error) {
      logger.error('Error updating profile:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar perfil',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (!user?.email) return;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      });

      if (error) throw error;

      toast({
        title: 'Email Enviado',
        description: 'Verifique sua caixa de entrada para redefinir sua senha',
      });
    } catch (error) {
      logger.error('Error sending reset email:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao enviar email de redefinição',
        variant: 'destructive',
      });
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'user': return 'default';
      case 'limited': return 'secondary';
      default: return 'outline';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'user': return 'Vitalício';
      case 'subscriber': return 'Assinante';
      case 'lifetime': return 'Vitalício';
      case 'trial': return 'Trial';
      case 'limited': return 'Limitado';
      default: return role;
    }
  };

  const getActivityLabel = (action: string) => {
    const formattedAction = action.replace(/_/g, ' ');
    return formattedAction.charAt(0).toUpperCase() + formattedAction.slice(1);
  };

  if (!profile) {
    return (
      <Card className="financial-card">
        <CardContent className="pt-6">
          <div className="text-center">
            <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Carregando perfil...</h3>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      {/* Responsive Grid Layout */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Main Content Area - Full width on mobile, 2/3 on desktop */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-2">
          {/* Personal Info Card */}
          <Card className="financial-card personal-info-card-compact-top">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <User className="h-4 w-4 sm:h-5 sm:w-5" />
                Informações Pessoais
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Atualize suas informações de perfil
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar and Basic Info */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
                  <AvatarImage src={profile.avatar_url} />
                  <AvatarFallback className="text-lg sm:text-xl">
                    {profile.full_name?.charAt(0) || profile.email.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold text-base sm:text-lg">{profile.full_name || 'Sem Nome'}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground break-all">{profile.email}</p>
                  <Badge 
                    variant={getRoleBadgeVariant(profile.role)}
                    className="mt-1.5 text-xs"
                  >
                    {getRoleLabel(profile.role)}
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Form Fields */}
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-sm">Nome Completo</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      fullName: e.target.value
                    }))}
                    placeholder="Digite seu nome completo"
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      email: e.target.value
                    }))}
                    placeholder="Digite seu email"
                    className="text-sm"
                  />
                </div>

                <Button 
                  onClick={updateProfile}
                  disabled={loading}
                  className="w-full sm:w-fit"
                >
                  {loading ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security Card */}
          <Card className="financial-card">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Key className="h-4 w-4 sm:h-5 sm:w-5" />
                Segurança
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Gerencie a segurança da sua conta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Password Change Section */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border rounded-lg">
              <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm sm:text-base">Alterar Senha</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Enviar email para redefinição de senha
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={changePassword}
                  className="w-full sm:w-auto text-sm shrink-0"
                >
                  Redefinir Senha
                </Button>
              </div>

              {/* 2FA Section */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-sm sm:text-base">Autenticação de Dois Fatores</h4>
                    {mfaEnabled ? (
                      <Badge variant="default" className="gap-1 text-xs">
                        <ShieldCheck className="h-3 w-3" />
                        Ativado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <ShieldOff className="h-3 w-3" />
                        Desativado
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {mfaEnabled 
                      ? 'Sua conta está protegida com autenticação de dois fatores'
                      : 'Adicione uma camada extra de segurança à sua conta'
                    }
                  </p>
                </div>
                {mfaEnabled ? (
                  <Button 
                    variant="outline" 
                    onClick={() => setShowDisableMfaDialog(true)}
                    className="w-full sm:w-auto text-sm shrink-0"
                  >
                    Desabilitar
                  </Button>
                ) : (
                  <Button 
                    variant="default" 
                    onClick={() => setShowMfaSetup(true)}
                    className="w-full sm:w-auto text-sm shrink-0"
                  >
                    Habilitar 2FA
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Full width on mobile, 1/3 on desktop */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-1">
          {/* Account Status Card */}
          <Card className="financial-card">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                Status da Conta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs sm:text-sm font-medium">Status</span>
                <Badge variant={profile.is_active ? 'default' : 'secondary'} className="text-xs">
                  {profile.is_active ? 'Ativa' : 'Inativa'}
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs sm:text-sm font-medium">Função</span>
                <Badge variant={getRoleBadgeVariant(profile.role)} className="text-xs">
                  {getRoleLabel(profile.role)}
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs sm:text-sm font-medium">Membro desde</span>
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {new Date(profile.created_at).toLocaleDateString()}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs sm:text-sm font-medium">Expiração</span>
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {(profile.role === 'admin' || profile.role === 'user') 
                    ? 'Vitalício' 
                    : (profile.role === 'trial' && profile.trial_expires_at)
                      ? new Date(profile.trial_expires_at).toLocaleDateString()
                      : (profile.role === 'subscriber' && profile.subscription_expires_at)
                        ? new Date(profile.subscription_expires_at).toLocaleDateString()
                        : '-'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity Card */}
          <Card className="financial-card">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
                Atividade Recente
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Últimas ações realizadas na sua conta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentActivities.length > 0 ? (
                  <div className="space-y-1">
                    {recentActivities.slice(0, 5).map((activity) => (
                      <div key={activity.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium truncate">
                            {getActivityLabel(activity.action)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activity.resource_type}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                          {new Date(activity.created_at).toLocaleDateString('pt-BR', { 
                            day: '2-digit',
                            month: '2-digit'
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                    Nenhuma atividade recente
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone Card */}
          <Card className="financial-card border-destructive/50">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-destructive">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                Zona de Perigo
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Ações irreversíveis da conta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                variant="destructive" 
                className="w-full text-sm"
                onClick={signOut}
              >
                Sair da Conta
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog para configurar 2FA */}
      <AlertDialog open={showMfaSetup} onOpenChange={setShowMfaSetup}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader className="sr-only">
            <AlertDialogTitle>Configuração de 2FA</AlertDialogTitle>
            <AlertDialogDescription>
              Configure a autenticação de dois fatores para sua conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <TwoFactorSetup 
            onComplete={() => {
              setShowMfaSetup(false);
              checkMfaStatus();
            }}
          />
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para desativar 2FA */}
      <AlertDialog open={showDisableMfaDialog} onOpenChange={setShowDisableMfaDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desabilitar Autenticação de Dois Fatores</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desabilitar a autenticação de dois fatores? Isso tornará sua conta menos segura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableMfa}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? 'Desabilitando...' : 'Desabilitar 2FA'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}