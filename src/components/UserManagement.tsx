import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Users, Shield, Activity, Trash2, Clock, Calendar, Check } from 'lucide-react';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: 'admin' | 'user' | 'subscriber' | 'trial';
  is_active: boolean;
  trial_expires_at?: string;
  subscription_expires_at?: string;
  created_at: string;
  updated_at: string;
}

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  created_at: string;
  profiles?: {
    email: string;
    full_name?: string;
  };
}

export function UserManagement() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'users' | 'audit'>('users');

  useEffect(() => {
    if (isAdmin()) {
      fetchUsers();
      fetchAuditLogs();
    }
  }, []);

  const fetchUsers = async () => {
    try {
      // Fetch profiles with roles from user_roles table (security best practice)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, email, full_name, avatar_url, is_active, trial_expires_at, subscription_expires_at, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // For each profile, fetch the role from user_roles table
      const usersWithRoles = await Promise.all(
        (profilesData || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .order('role', { ascending: true })
            .limit(1)
            .maybeSingle();

          return {
            ...profile,
            role: roleData?.role || 'user',
            full_name: profile.full_name ?? undefined,
            avatar_url: profile.avatar_url ?? undefined,
            trial_expires_at: profile.trial_expires_at ?? undefined,
            subscription_expires_at: profile.subscription_expires_at ?? undefined,
          };
        })
      );

      setUsers(usersWithRoles);
      logger.info('Users loaded:', usersWithRoles.map(u => ({ 
        email: u.email, 
        role: u.role, 
        trial_expires_at: u.trial_expires_at,
        subscription_expires_at: u.subscription_expires_at 
      })));
    } catch (error) {
      logger.error('Error fetching users:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os usuários.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        logger.error('Error fetching audit logs:', error);
        return;
      }
      setAuditLogs((data || []).map(log => ({
        ...log,
        user_id: log.user_id || '',
        resource_id: log.resource_id ?? undefined,
        profiles: undefined,
      })));
    } catch (error) {
      logger.error('Error fetching audit logs:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os logs de auditoria.',
        variant: 'destructive',
      });
    }
  };

  const updateUserRole = async (userId: string, newRole: 'admin' | 'user' | 'subscriber' | 'trial') => {
    try {
      logger.debug('Updating user role:', { userId, newRole });
      
      // Update role in user_roles table (security best practice)
      // First, delete existing role(s)
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        logger.error('Error deleting old role:', deleteError);
        throw deleteError;
      }

      // Then, insert new role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });

      if (insertError) {
        logger.error('Error inserting new role:', insertError);
        throw insertError;
      }

      logger.success('User role updated successfully in user_roles table');

      // Log the activity
      try {
        await supabase.rpc('log_user_activity', {
          p_user_id: profile?.user_id || '',
          p_action: 'user_role_updated',
          p_resource_type: 'user_roles',
          p_resource_id: userId,
          p_new_values: { role: newRole }
        });
        logger.success('Activity logged successfully');
      } catch (logError) {
        logger.error('Error logging activity:', logError);
      }

      setUsers(prev => prev.map(user => 
        user.user_id === userId ? { ...user, role: newRole } : user
      ));

      toast({
        title: 'Sucesso',
        description: 'Função do usuário atualizada com sucesso.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      logger.error('Error updating user role:', error);
      toast({
        title: 'Erro',
        description: `Não foi possível atualizar a função do usuário: ${errorMessage}`,
        variant: 'destructive',
      });
    }
  };

  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('user_id', userId);

      if (error) throw error;

      // Log the activity
      await supabase.rpc('log_user_activity', {
        p_user_id: profile?.user_id || '',
        p_action: isActive ? 'user_activated' : 'user_deactivated',
        p_resource_type: 'profile',
        p_resource_id: userId
      });

      setUsers(prev => prev.map(user => 
        user.user_id === userId ? { ...user, is_active: isActive } : user
      ));

      toast({
        title: 'Sucesso',
        description: isActive ? 'Usuário ativado com sucesso.' : 'Usuário desativado com sucesso.',
      });
    } catch (error) {
      logger.error('Error updating user status:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status do usuário.',
        variant: 'destructive',
      });
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      logger.info('Deleting user:', userId);
      
      // Call edge function to delete user (will also delete from auth.users)
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `https://sdberrkfwoozezletfuq.supabase.co/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        logger.error('Error from edge function:', result);
        throw new Error(result.error || 'Failed to delete user');
      }

      logger.success('User deleted successfully:', result);

      setUsers(prev => prev.filter(user => user.user_id !== userId));

      toast({
        title: 'Sucesso',
        description: 'Usuário removido com sucesso do sistema e autenticação.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Não foi possível remover o usuário';
      logger.error('Error deleting user:', error);
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'user': return 'default';
      case 'subscriber': return 'secondary';
      default: return 'outline';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'user':
        return 'Vitalício';
      case 'trial':
        return 'Trial';
      case 'subscriber':
        return 'Assinante';
      default:
        return role;
    }
  };

  const getActionLabel = (action: string) => {
    return action.replace(/_/g, ' ');
  };

  const getResourceTypeLabel = (resourceType: string) => {
    return resourceType;
  };

  const setSubscriptionDays = async (userId: string, days: number) => {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);

      const { error } = await supabase
        .from('profiles')
        .update({ subscription_expires_at: expiresAt.toISOString() })
        .eq('user_id', userId);

      if (error) throw error;

      await supabase.rpc('log_user_activity', {
        p_user_id: profile?.user_id || '',
        p_action: 'subscription_updated',
        p_resource_type: 'profile',
        p_resource_id: userId,
      });

      toast({
        title: 'Sucesso',
        description: `Assinatura configurada para ${days} dias.`,
      });

      fetchUsers();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao configurar assinatura';
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  if (!isAdmin()) {
    return (
      <Card className="financial-card">
        <CardContent className="pt-6">
          <div className="text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Acesso Restrito</h3>
            <p className="text-muted-foreground">
              Você precisa de permissões de administrador para acessar esta área.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-6 px-2 sm:px-0">
      {/* Tab Buttons */}
      <div className="flex flex-col xs:flex-row justify-center gap-2 sm:gap-3 px-2 sm:px-0 max-w-md mx-auto w-full">
        <Button
          variant={selectedTab === 'users' ? 'default' : 'outline'}
          onClick={() => setSelectedTab('users')}
          className="w-full xs:flex-1 sm:min-w-[140px] items-center justify-center gap-2 text-sm sm:text-base py-3 sm:py-2"
        >
          <Users className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="font-medium">Usuários</span>
        </Button>
        <Button
          variant={selectedTab === 'audit' ? 'default' : 'outline'}
          onClick={() => setSelectedTab('audit')}
          className="w-full xs:flex-1 sm:min-w-[140px] items-center justify-center gap-2 text-sm sm:text-base py-3 sm:py-2"
        >
          <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="font-medium">Auditoria</span>
        </Button>
      </div>

      {/* Users Tab */}
      {selectedTab === 'users' && (
        <Card className="financial-card w-full overflow-hidden">
          <CardHeader className="space-y-1 px-4 sm:px-6 py-4 sm:py-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg lg:text-xl">
              <Users className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="truncate">Usuários do Sistema</span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Gerencie usuários, suas funções e permissões de acesso
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 lg:px-6 pb-4 sm:pb-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                {/* Mobile & Tablet Card View */}
                <div className="space-y-3 lg:hidden">
                  {users.map((user) => (
                    <Card key={user.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <Avatar className="h-12 w-12 shrink-0">
                            <AvatarImage src={user.avatar_url} />
                            <AvatarFallback className="text-sm">
                              {user.full_name?.charAt(0) || user.email.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {user.full_name || 'Sem nome'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </p>
                            <div className="flex gap-2 mt-2">
                              <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs">
                                {getRoleLabel(user.role)}
                              </Badge>
                              <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-xs">
                                {user.is_active ? 'Ativo' : 'Inativo'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-4 pt-4 border-t mt-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground ml-1">Função do Usuário</label>
                            <Select
                              value={user.role}
                              onValueChange={(value: 'admin' | 'user' | 'subscriber' | 'trial') => 
                                updateUserRole(user.user_id, value)
                              }
                              disabled={user.user_id === profile?.user_id}
                            >
                              <SelectTrigger className="w-full h-10">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Administrador</SelectItem>
                                <SelectItem value="trial">Trial</SelectItem>
                                <SelectItem value="user">Vitalício</SelectItem>
                                <SelectItem value="subscriber">Assinante</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {user.role === 'trial' && user.trial_expires_at && (
                            <div className="flex items-center gap-2 bg-muted/50 p-2.5 rounded-lg border">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                Expira em: <span className="font-medium text-foreground">{new Date(user.trial_expires_at).toLocaleDateString()}</span>
                              </span>
                            </div>
                          )}
                          
                          {user.role === 'subscriber' && (
                            <div className="bg-muted/30 p-3 rounded-lg space-y-3 border">
                              <label className="text-xs font-medium text-muted-foreground block">Gerenciar Assinatura</label>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <input
                                    type="number"
                                    placeholder="Adicionar dias..."
                                    className="w-full h-9 px-3 py-1 text-sm border rounded-md bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                    id={`mobile-days-${user.user_id}`}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const days = parseInt((e.target as HTMLInputElement).value);
                                        if (days > 0) {
                                          setSubscriptionDays(user.user_id, days);
                                          (e.target as HTMLInputElement).value = '';
                                        }
                                      }
                                    }}
                                  />
                                </div>
                                <Button 
                                  size="sm" 
                                  className="h-9 px-3 shrink-0"
                                  onClick={() => {
                                    const input = document.getElementById(`mobile-days-${user.user_id}`) as HTMLInputElement;
                                    const days = parseInt(input.value);
                                    if (days > 0) {
                                      setSubscriptionDays(user.user_id, days);
                                      input.value = '';
                                    }
                                  }}
                                >
                                  <Check className="h-4 w-4 mr-1" /> Add
                                </Button>
                              </div>
                              {user.subscription_expires_at && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border/50 mt-2">
                                  <Calendar className="h-3.5 w-3.5" />
                                  <span>Vence em: <span className="font-medium text-foreground">{new Date(user.subscription_expires_at).toLocaleDateString()}</span></span>
                                </div>
                              )}
                            </div>
                          )}
                          
                          <div className="flex gap-3 pt-2">
                            <Button
                              variant={user.is_active ? "outline" : "default"}
                              size="sm"
                              onClick={() => toggleUserStatus(user.user_id, !user.is_active)}
                              disabled={user.user_id === profile?.user_id}
                              className={cn(
                                "flex-1 h-10 font-medium",
                                user.is_active 
                                  ? "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50" 
                                  : "bg-primary text-primary-foreground hover:bg-primary/90"
                              )}
                            >
                              {user.is_active ? 'Desativar Acesso' : 'Ativar Acesso'}
                            </Button>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  disabled={user.user_id === profile?.user_id}
                                  className="h-10 w-10 shrink-0 rounded-lg"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="max-w-[90vw] rounded-xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Confirmar Exclusão
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja remover o usuário <span className="font-medium text-foreground">{user.email}</span>? Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
                                  <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUser(user.user_id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir Usuário
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs sm:text-sm pl-3 sm:pl-4">Usuário</TableHead>
                        <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Tipo</TableHead>
                        <TableHead className="text-xs sm:text-sm">Status</TableHead>
                        <TableHead className="text-xs sm:text-sm hidden md:table-cell">Criado</TableHead>
                        <TableHead className="text-xs sm:text-sm pr-3 sm:pr-4">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id} className="hover:bg-muted/50">
                          <TableCell className="py-3 sm:py-4 pl-3 sm:pl-4">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <Avatar className="h-8 w-8 sm:h-10 sm:w-10 shrink-0">
                                <AvatarImage src={user.avatar_url} />
                                <AvatarFallback className="text-xs sm:text-sm">
                                  {user.full_name?.charAt(0) || user.email.charAt(0)}
                                </AvatarFallback>
                              </Avatar>  
                              <div className="min-w-0 flex-1">
                                <p className="text-xs sm:text-sm font-medium truncate">
                                  {user.full_name || 'Sem nome'}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {user.email}
                                </p>
                                {/* Show role badge on mobile (hidden on desktop where it has its own column) */}
                                <div className="mt-1 sm:hidden">
                                  <Badge 
                                    variant={getRoleBadgeVariant(user.role)}
                                    className="text-xs"
                                  >
                                    {getRoleLabel(user.role)}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell py-3 sm:py-4">
                            <div className="flex flex-col gap-2">
                              <Select
                                value={user.role}
                                onValueChange={(value: 'admin' | 'user' | 'subscriber') => 
                                  updateUserRole(user.user_id, value)
                                }
                                disabled={user.user_id === profile?.user_id}
                              >
                                <SelectTrigger className="w-full sm:w-40 text-xs sm:text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Administrador</SelectItem>
                                  <SelectItem value="trial">Trial</SelectItem>
                                  <SelectItem value="user">Vitalício</SelectItem>
                                  <SelectItem value="subscriber">Assinante</SelectItem>
                                </SelectContent>
                              </Select>
                              {user.role === 'trial' && user.trial_expires_at && (
                                <div className="flex gap-2 items-center flex-wrap">
                                  <span className="text-xs text-muted-foreground">
                                    Exp: {new Date(user.trial_expires_at).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                              
                              {user.role === 'subscriber' && (
                                <div className="flex gap-2 items-center flex-wrap">
                                  <input
                                    type="number"
                                    placeholder="Dias"
                                    className="w-16 px-2 py-1 text-xs border rounded"
                                    id={`days-${user.user_id}`}
                                  />
                                  <Button
                                    size="sm"
                                    className="text-xs h-6 px-2"
                                    onClick={() => {
                                      const input = document.getElementById(`days-${user.user_id}`) as HTMLInputElement;
                                      const days = parseInt(input.value);
                                      if (days > 0) {
                                        setSubscriptionDays(user.user_id, days);
                                      }
                                    }}
                                  >
                                    OK
                                  </Button>
                                  {user.subscription_expires_at && (
                                    <span className="text-xs text-muted-foreground">
                                      Exp: {new Date(user.subscription_expires_at).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-3 sm:py-4">
                            <div className="flex items-center gap-1 sm:gap-2">
                              <Switch
                                checked={user.is_active}
                                onCheckedChange={(checked) => 
                                  toggleUserStatus(user.user_id, checked)
                                }
                                disabled={user.user_id === profile?.user_id}
                                className="scale-90 sm:scale-100"
                              />
                              <Badge 
                                variant={user.is_active ? 'default' : 'secondary'}
                                className="text-xs hidden lg:inline-flex"
                              >
                                {user.is_active ? 'Ativo' : 'Inativo'}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell py-3 sm:py-4 text-xs sm:text-sm text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="py-3 sm:py-4 pr-3 sm:pr-4">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={user.user_id === profile?.user_id}
                                  className="text-destructive hover:text-destructive h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-sm sm:text-base">
                                    Confirmar Exclusão
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-xs sm:text-sm">
                                    Tem certeza que deseja remover o usuário {user.email}? Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                                  <AlertDialogCancel className="text-xs sm:text-sm m-0">
                                    Cancelar
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUser(user.user_id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs sm:text-sm m-0"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audit Log Tab */}
      {selectedTab === 'audit' && (
        <Card className="financial-card w-full overflow-hidden">
          <CardHeader className="space-y-1 px-4 sm:px-6 py-4 sm:py-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg lg:text-xl">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="truncate">Log de Auditoria</span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Histórico completo de atividades do sistema para monitoramento de segurança
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 lg:px-6 pb-4 sm:pb-6">
            <div className="overflow-x-auto -mx-2 sm:-mx-4 lg:-mx-6">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm pl-3 sm:pl-4">Usuário</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Ação</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden md:table-cell">Recurso</TableHead>
                      <TableHead className="text-xs sm:text-sm pr-3 sm:pr-4">Data/Hora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/50">
                        <TableCell className="py-3 sm:py-4 pl-3 sm:pl-4">
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-medium truncate">
                              {log.profiles?.full_name || log.profiles?.email || 'Sistema'}
                            </p>
                            {/* Show action on mobile */}
                            <p className="text-xs text-muted-foreground sm:hidden mt-0.5">
                              {getActionLabel(log.action)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell py-3 sm:py-4">
                          <Badge variant="outline" className="text-xs">
                            {getActionLabel(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell py-3 sm:py-4 text-xs sm:text-sm text-muted-foreground">
                          {getResourceTypeLabel(log.resource_type)}
                        </TableCell>
                        <TableCell className="py-3 sm:py-4 pr-3 sm:pr-4">
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            <span className="hidden sm:inline">
                              {new Date(log.created_at).toLocaleString('pt-BR')}
                            </span>
                            <span className="sm:hidden">
                              {new Date(log.created_at).toLocaleDateString('pt-BR', { 
                                day: '2-digit',
                                month: '2-digit'
                              })}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}