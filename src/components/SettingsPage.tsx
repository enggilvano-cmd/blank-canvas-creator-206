import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Settings, 
  Download, 
  Upload,
  Trash2,
  Bell,
  Database,
  FileText,
  Shield,
  Clock,
  Calendar
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import type { AppSettings } from "@/context/SettingsContext";
import { useBackupSchedule } from "@/hooks/useBackupSchedule";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onClearAllData: () => void;
}

export function SettingsPage({ settings, onUpdateSettings, onClearAllData }: SettingsPageProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [isImporting, setIsImporting] = useState(false);
  const [clearDataConfirmation, setClearDataConfirmation] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const { toast } = useToast();
  
  const {
    schedule,
    history,
    historyLoading,
    saveSchedule,
    isSaving,
    deleteSchedule,
    isDeleting,
    downloadBackup,
  } = useBackupSchedule();

  // Sync local settings when props change
  useEffect(() => {
    logger.debug('Settings props updated:', settings);
    setLocalSettings(settings);
  }, [settings]);

  const handleSaveSettings = () => {
    try {
      // Validate settings before saving
      if (!localSettings.theme) {
        toast({
          title: 'Configurações inválidas',
          description: 'Por favor, preencha todos os campos obrigatórios',
          variant: "destructive"
        });
        return;
      }

      onUpdateSettings(localSettings);
      toast({
        title: 'Configurações salvas',
        description: 'Suas configurações foram atualizadas com sucesso',
      });
    } catch (error) {
      logger.error('Settings save error:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configurações',
        variant: "destructive"
      });
    }
  };

  const handleExportData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Export all user data with specific columns
      const [accounts, transactions, categories, settings] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, name, type, balance, limit_amount, due_date, closing_date, color, created_at, updated_at')
          .eq('user_id', user.id),
        supabase
          .from('transactions')
          .select(`
            id, description, amount, date, type, status, category_id, account_id, to_account_id,
            installments, current_installment, parent_transaction_id, linked_transaction_id,
            is_recurring, is_fixed, recurrence_type, recurrence_end_date, invoice_month,
            invoice_month_overridden, created_at, updated_at
          `)
          .eq('user_id', user.id),
        supabase
          .from('categories')
          .select('id, name, type, color, created_at, updated_at')
          .eq('user_id', user.id),
        supabase
          .from('user_settings')
          .select('currency, theme, notifications, auto_backup, language')
          .eq('user_id', user.id)
          .single()
      ]);

      const data = {
        accounts: accounts.data || [],
        transactions: transactions.data || [],
        categories: categories.data || [],
        settings: settings.data || {},
        exportDate: new Date().toISOString()
      };
      
      // Validate data before export
      if (Object.keys(data).length === 0) {
        toast({
          title: 'Nenhum dado para exportar',
          description: 'Não há dados disponíveis para exportação',
          variant: "destructive"
        });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
      const dateStr = timestamp[0];
      const timeStr = timestamp[1].split('.')[0];
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { 
        type: 'application/json;charset=utf-8' 
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `planiflow-backup-${dateStr}-${timeStr}.json`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(url), 100);
      
      toast({
        title: 'Backup criado',
        description: `Backup salvo como planiflow-backup-${dateStr}-${timeStr}.json`,
      });
    } catch (error) {
      logger.error('Export error:', error);
      toast({
        title: 'Erro no backup',
        description: 'Erro ao criar backup dos dados',
        variant: "destructive"
      });
    }
  };


  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.json')) {
      toast({
        title: 'Arquivo inválido',
        description: 'Por favor, selecione um arquivo JSON válido',
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O arquivo deve ter no máximo 10MB',
        variant: "destructive"
      });
      return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const jsonString = e.target?.result as string;
        if (!jsonString || jsonString.trim() === '') {
          throw new Error('Arquivo vazio');
        }

        const data = JSON.parse(jsonString);
        
        // Validate data structure
        if (!data || typeof data !== 'object') {
          throw new Error('Estrutura de dados inválida');
        }

        if (data.accounts && !Array.isArray(data.accounts)) {
          throw new Error('Formato de contas inválido');
        }
        if (data.transactions && !Array.isArray(data.transactions)) {
          throw new Error('Formato de transações inválido');
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // Import data to Supabase
        const results = await Promise.allSettled([
          data.accounts?.length > 0 ? supabase.from('accounts').upsert(
            data.accounts.map((acc: Record<string, unknown>) => ({ ...acc, user_id: user.id }))
          ) : Promise.resolve(),
          data.categories?.length > 0 ? supabase.from('categories').upsert(
            data.categories.map((cat: Record<string, unknown>) => ({ ...cat, user_id: user.id }))
          ) : Promise.resolve(),
          data.transactions?.length > 0 ? supabase.from('transactions').upsert(
            data.transactions.map((tx: Record<string, unknown>) => ({ ...tx, user_id: user.id }))
          ) : Promise.resolve()
        ]);

        const failed = results.filter(r => r.status === 'rejected');
        
        if (failed.length === 0) {
          toast({
            title: 'Dados importados',
            description: 'Seus dados foram importados com sucesso',
          });
          setTimeout(() => window.location.reload(), 1500);
        } else {
          toast({
            title: 'Erro na importação',
            description: 'Alguns dados não puderam ser importados',
            variant: "destructive"
          });
        }
      } catch (error) {
        logger.error('Import error:', error);
        toast({
          title: 'Erro na importação',
          description: error instanceof Error ? error.message : 'Arquivo inválido ou corrompido',
          variant: "destructive"
        });
      } finally {
        setIsImporting(false);
        if (event.target) {
          event.target.value = '';
        }
      }
    };

    reader.onerror = () => {
      setIsImporting(false);
      toast({
        title: 'Erro de leitura',
        description: 'Erro ao ler o arquivo',
        variant: "destructive"
      });
    };
    
    reader.readAsText(file);
  };


  const handleClearData = () => {
    if (window.confirm(
      'Tem certeza que deseja apagar todos os dados? Esta ação não pode ser desfeita.'
    )) {
      onClearAllData();
      toast({
        title: 'Dados apagados',
        description: 'Todos os dados foram removidos com sucesso',
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6 fade-in pb-6 sm:pb-8 max-w-[1400px] mx-auto spacing-responsive-md -mt-12 lg:mt-0">
      {/* Seção: Preferências */}
      <div>
        <h2 className="text-headline font-semibold mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Preferências
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* General Settings */}
          <Card className="financial-card">
            <CardHeader>
              <CardTitle className="text-body-large">Aparência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme">Tema</Label>
                <p className="text-caption text-muted-foreground mb-2">
                  Escolha a aparência do aplicativo
                </p>
                <Select 
                  value={localSettings.theme} 
                  onValueChange={(value) => setLocalSettings(prev => ({ ...prev, theme: value as typeof prev.theme }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Sistema</SelectItem>
                    <SelectItem value="light">Claro</SelectItem>
                    <SelectItem value="dark">Escuro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSaveSettings} className="w-full">
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="financial-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-body-large">
                <Bell className="h-5 w-5" />
                Notificações e Automação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                <div className="space-y-1 flex-1">
                  <Label className="text-body-large">Notificações do Sistema</Label>
                  <p className="text-body text-muted-foreground">
                    Receber lembretes e alertas importantes
                  </p>
                </div>
                <Switch
                  checked={localSettings.notifications}
                  onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, notifications: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                <div className="space-y-1 flex-1">
                  <Label className="text-body-large">Backup Automático</Label>
                  <p className="text-body text-muted-foreground">
                    Backup automático dos dados localmente
                  </p>
                </div>
                <Switch
                  checked={localSettings.autoBackup}
                  onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, autoBackup: checked }))}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Seção: Gerenciamento de Dados */}
      <div>
        <h2 className="text-headline font-semibold mb-4 flex items-center gap-2">
          <Database className="h-5 w-5" />
          Gerenciamento de Dados
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Backup Manual */}
          <Card className="financial-card">
            <CardHeader>
              <CardTitle className="text-body-large">Backup Manual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-body text-muted-foreground">
                  Faça backup dos seus dados manualmente a qualquer momento
                </p>
                <div className="grid grid-cols-1 gap-3">
                  <Button onClick={handleExportData} variant="outline" className="gap-2 justify-start">
                    <Download className="h-4 w-4" />
                    Exportar Backup JSON
                  </Button>
                  
                  <div className="relative">
                    <Button 
                      variant="outline" 
                      className="gap-2 w-full justify-start" 
                      disabled={isImporting}
                      asChild
                    >
                      <label className={`cursor-pointer ${isImporting ? 'opacity-50' : ''}`}>
                        <Upload className="h-4 w-4" />
                        {isImporting ? "Importando..." : "Importar Dados"}
                        <input
                          type="file"
                          accept=".json,application/json"
                          onChange={handleImportData}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={isImporting}
                          aria-label="Selecionar arquivo de backup para importar"
                        />
                      </label>
                    </Button>
                  </div>
                  
                  <p className="text-caption text-muted-foreground mt-2">
                    Formato JSON completo para backup e restauração de todos os seus dados.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Zona de Perigo */}
          <Card className="financial-card border-destructive/50">
            <CardHeader>
              <CardTitle className="text-body-large text-destructive flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Zona de Perigo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-body text-muted-foreground">
                Para apagar todos os dados, digite "APAGAR TUDO" no campo abaixo e clique no botão.
              </p>
              <div className="space-y-3">
                <Input
                  type="text"
                  value={clearDataConfirmation}
                  onChange={(e) => setClearDataConfirmation(e.target.value)}
                  placeholder='Digite "APAGAR TUDO"'
                  className="border-destructive"
                />
                <Button 
                  onClick={handleClearData} 
                  variant="destructive" 
                  className="gap-2 w-full"
                  disabled={clearDataConfirmation !== "APAGAR TUDO"}
                >
                  <Trash2 className="h-4 w-4" />
                  Apagar Todos os Dados Permanentemente
                </Button>
                <p className="text-body text-muted-foreground">
                  Esta ação irá remover permanentemente todas as suas contas, transações e configurações.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Backups Agendados */}
      <div>
        <h2 className="text-headline font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Backups Agendados
        </h2>
        <Card className="financial-card">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Configuração de Agendamento */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-body-large font-medium mb-2">Configurar Backup Automático</h4>
                  <p className="text-body text-muted-foreground mb-4">
                    Os backups são salvos na nuvem e podem ser baixados a qualquer momento
                  </p>
                </div>

                {!schedule ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Frequência</Label>
                      <Select 
                        value={scheduleFrequency}
                        onValueChange={(value) => setScheduleFrequency(value as typeof scheduleFrequency)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Diário (todo dia às 3h)</SelectItem>
                          <SelectItem value="weekly">Semanal (toda segunda às 3h)</SelectItem>
                          <SelectItem value="monthly">Mensal (dia 1 às 3h)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button 
                      onClick={() => saveSchedule({ frequency: scheduleFrequency, is_active: true })}
                      disabled={isSaving}
                      className="w-full"
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      {isSaving ? "Salvando..." : "Ativar Backup Automático"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status</span>
                        <span className={`text-sm font-medium ${schedule.is_active ? 'text-success' : 'text-muted-foreground'}`}>
                          {schedule.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Frequência</span>
                        <span className="text-sm">
                          {schedule.frequency === 'daily' && 'Diário'}
                          {schedule.frequency === 'weekly' && 'Semanal'}
                          {schedule.frequency === 'monthly' && 'Mensal'}
                        </span>
                      </div>
                      {schedule.last_backup_at && (
                        <>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Último backup</span>
                            <span className="text-sm">
                              {format(new Date(schedule.last_backup_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </>
                      )}
                      {schedule.next_backup_at && (
                        <>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Próximo backup</span>
                            <span className="text-sm">
                              {format(new Date(schedule.next_backup_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button 
                        onClick={() => saveSchedule({ 
                          frequency: schedule.frequency, 
                          is_active: !schedule.is_active 
                        })}
                        disabled={isSaving}
                        variant="outline"
                      >
                        {schedule.is_active ? 'Pausar' : 'Reativar'}
                      </Button>
                      <Button 
                        onClick={() => deleteSchedule()}
                        disabled={isDeleting}
                        variant="destructive"
                      >
                        {isDeleting ? "Removendo..." : "Remover"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Histórico de Backups */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Histórico de Backups</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Últimos 10 backups (backups com +30 dias são deletados automaticamente)
                  </p>
                </div>

                {historyLoading ? (
                  <div className="text-sm text-muted-foreground p-4 text-center">Carregando...</div>
                ) : !history || history.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 text-center bg-muted rounded-lg">
                    Nenhum backup gerado ainda
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {history.map((backup) => (
                      <div 
                        key={backup.id}
                        className="p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors border"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            {format(new Date(backup.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            backup.backup_type === 'scheduled' 
                              ? 'bg-primary/10 text-primary' 
                              : 'bg-muted-foreground/10'
                          }`}>
                            {backup.backup_type === 'scheduled' ? 'Automático' : 'Manual'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {(backup.file_size / 1024).toFixed(2)} KB
                          </span>
                          <Button 
                            size="sm"
                            variant="ghost"
                            onClick={() => downloadBackup(backup.file_path)}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Baixar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* About */}
      <div>
        <h2 className="text-headline font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Sobre o Aplicativo
        </h2>
        <Card className="financial-card">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <h4 className="text-xl font-bold">PlaniFlow</h4>
                  <p className="text-sm text-muted-foreground">Versão 1.0.0</p>
                </div>
                
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Aplicativo completo para gestão financeira pessoal, desenvolvido para 
                  ajudar você a controlar suas finanças de forma simples e eficiente.
                </p>

                <div className="pt-4 mt-2 border-t border-border/40">
                  <p className="text-sm font-medium text-foreground mb-1">Desenvolvido por:</p>
                  <p className="text-sm text-muted-foreground">Gilvano de Almeida Pinheiro, Eng., MSc</p>
                  <p className="text-sm text-muted-foreground">CREASP - 5.062.231.028</p>
                  <a href="mailto:contato@planiflow.com.br" className="text-sm text-primary hover:underline">
                    contato@planiflow.com.br
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold mb-3">Funcionalidades:</p>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Gestão de contas bancárias e cartões
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Controle de receitas e despesas
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Transferências entre contas
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Relatórios e análises detalhadas
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Backup e restauração de dados
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Interface responsiva para todos os dispositivos
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-success" />
                    <span className="text-sm font-semibold">Privacidade e Segurança</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Todos os seus dados são armazenados no Supabase com segurança e criptografia. 
                    Você pode acessar seus dados de qualquer dispositivo com sua conta.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}