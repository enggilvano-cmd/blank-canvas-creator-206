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
import { offlineSync } from "@/lib/offlineSync";

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

      // Export ALL user data - COMPLETO COM TODAS AS TABELAS
      logger.info('Iniciando exportação completa de backup...');
      
      const [
        accounts, 
        transactions, 
        categories, 
        settings,
        profile,
        notificationSettings,
        pushSubscriptions,
        backupSchedules,
        periodClosures
      ] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, name, type, balance, limit_amount, due_date, closing_date, color, user_id, created_at, updated_at')
          .eq('user_id', user.id),
        supabase
          .from('transactions')
          .select(`
            id, description, amount, date, type, status, category_id, account_id, to_account_id,
            installments, current_installment, parent_transaction_id, linked_transaction_id,
            is_recurring, is_fixed, is_provision, recurrence_type, recurrence_end_date, invoice_month,
            invoice_month_overridden, user_id, created_at, updated_at
          `)
          .eq('user_id', user.id),
        supabase
          .from('categories')
          .select('id, name, type, color, user_id, created_at, updated_at')
          .eq('user_id', user.id),
        supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single(),
        supabase
          .from('notification_settings')
          .select('*')
          .eq('user_id', user.id),
        supabase
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', user.id),
        supabase
          .from('backup_schedules')
          .select('*')
          .eq('user_id', user.id),
        supabase
          .from('period_closures')
          .select('*')
          .eq('user_id', user.id)
      ]);

      // Check for errors in queries
      if (accounts.error) throw accounts.error;
      if (transactions.error) throw transactions.error;
      if (categories.error) throw categories.error;
      if (settings.error && settings.error.code !== 'PGRST116') throw settings.error;
      if (profile.error && profile.error.code !== 'PGRST116') throw profile.error;
      // notification_settings, push_subscriptions, backup_schedules e period_closures podem não existir (são opcionais)

      const data = {
        // Dados principais
        accounts: accounts.data || [],
        transactions: transactions.data || [],
        categories: categories.data || [],
        settings: settings.data || {},
        
        // Dados do perfil e configurações
        profile: profile.data || null,
        notification_settings: notificationSettings.data || [],
        push_subscriptions: pushSubscriptions.data || [],
        
        // Dados de agendamento e períodos
        backup_schedules: backupSchedules.data || [],
        period_closures: periodClosures.data || [],
        
        // Metadados
        exportDate: new Date().toISOString(),
        backupVersion: '2.0' // Para rastrear versão do formato do backup
      };
      
      // Validate data before export - check if at least one type has data
      const hasData = (
        data.accounts.length > 0 || 
        data.transactions.length > 0 || 
        data.categories.length > 0 || 
        Object.keys(data.settings).length > 0 ||
        data.profile !== null ||
        data.notification_settings.length > 0 ||
        data.push_subscriptions.length > 0 ||
        data.backup_schedules.length > 0 ||
        data.period_closures.length > 0
      );
      
      if (!hasData) {
        toast({
          title: 'Nenhum dado para exportar',
          description: 'Não há dados disponíveis para exportação',
          variant: "destructive"
        });
        return;
      }
      
      logger.info('Exportando dados completos:', {  
        accounts: data.accounts.length, 
        transactions: data.transactions.length, 
        categories: data.categories.length,
        hasProfile: data.profile !== null,
        notificationSettings: data.notification_settings.length,
        pushSubscriptions: data.push_subscriptions.length,
        backupSchedules: data.backup_schedules.length,
        periodClosures: data.period_closures.length,
        backupVersion: data.backupVersion,
        totalSize: `${(JSON.stringify(data).length / 1024).toFixed(2)}KB`
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
      const dateStr = timestamp[0];
      const timeStr = timestamp[1].split('.')[0];
      
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { 
        type: 'application/json;charset=utf-8' 
      });
      
      logger.debug('Arquivo de exportação:', {
        size: `${(blob.size / 1024).toFixed(2)}KB`,
        jsonLength: jsonString.length,
        blobSize: blob.size
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
        console.log('🔥🔥🔥 IMPORTAÇÃO INICIADA - CÓDIGO ATUALIZADO v2 🔥🔥🔥');
        const jsonString = e.target?.result as string;
        if (!jsonString || jsonString.trim() === '') {
          throw new Error('Arquivo vazio');
        }

        let data;
        try {
          data = JSON.parse(jsonString);
        } catch (parseError) {
          logger.error('Erro ao fazer parse do JSON:', parseError);
          throw new Error(`Arquivo JSON inválido: ${parseError instanceof Error ? parseError.message : 'formato inválido'}`);
        }
        
        // Validate data structure
        if (!data || typeof data !== 'object') {
          throw new Error('Estrutura de dados inválida');
        }
        
        logger.debug('Estrutura do arquivo carregado:', {
          hasAccounts: 'accounts' in data,
          hasTransactions: 'transactions' in data,
          hasCategories: 'categories' in data,
          hasSettings: 'settings' in data,
          hasProfile: 'profile' in data,
          backupVersion: data.backupVersion || 'Sem versão'
        });
        
        // Validar versão do backup
        if (data.backupVersion && data.backupVersion !== '2.0') {
          logger.warn(`Versão de backup diferente detectada: ${data.backupVersion}. Esperado: 2.0`);
        }

        // Validações de tipo - apenas se o campo existir
        if (data.accounts !== undefined && !Array.isArray(data.accounts)) {
          throw new Error('Formato de contas inválido - deve ser um array');
        }
        if (data.transactions !== undefined && !Array.isArray(data.transactions)) {
          throw new Error('Formato de transações inválido - deve ser um array');
        }
        if (data.categories !== undefined && !Array.isArray(data.categories)) {
          throw new Error('Formato de categorias inválido - deve ser um array');
        }
        if (data.notification_settings !== undefined && !Array.isArray(data.notification_settings)) {
          throw new Error('Formato de notificações inválido - deve ser um array');
        }
        if (data.push_subscriptions !== undefined && !Array.isArray(data.push_subscriptions)) {
          throw new Error('Formato de subscrições push inválido - deve ser um array');
        }
        if (data.backup_schedules !== undefined && !Array.isArray(data.backup_schedules)) {
          throw new Error('Formato de agendamentos inválido - deve ser um array');
        }
        if (data.period_closures !== undefined && !Array.isArray(data.period_closures)) {
          throw new Error('Formato de períodos de encerramento inválido - deve ser um array');
        }

        // Normalizar dados para versões antigas de backup (v1.0 ou sem versão)
        logger.debug('Normalizando dados do backup:', {
          hasAccounts: 'accounts' in data,
          accountsIsArray: Array.isArray(data.accounts),
          accountsLength: Array.isArray(data.accounts) ? data.accounts.length : 0,
          hasCategories: 'categories' in data,
          categoriesIsArray: Array.isArray(data.categories),
          categoriesLength: Array.isArray(data.categories) ? data.categories.length : 0,
          hasTransactions: 'transactions' in data,
          transactionsIsArray: Array.isArray(data.transactions),
          transactionsLength: Array.isArray(data.transactions) ? data.transactions.length : 0
        });

        const normalizedData = {
          accounts: Array.isArray(data.accounts) ? data.accounts : [],
          transactions: Array.isArray(data.transactions) ? data.transactions : [],
          categories: Array.isArray(data.categories) ? data.categories : [],
          settings: data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : {},
          profile: data.profile && typeof data.profile === 'object' ? data.profile : null,
          notification_settings: Array.isArray(data.notification_settings) ? data.notification_settings : [],
          push_subscriptions: Array.isArray(data.push_subscriptions) ? data.push_subscriptions : [],
          backup_schedules: Array.isArray(data.backup_schedules) ? data.backup_schedules : [],
          period_closures: Array.isArray(data.period_closures) ? data.period_closures : []
        };

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // Log detalhado dos dados normalizados para debug
        logger.debug('Dados normalizados detalhados:', {
          accounts: normalizedData.accounts.length,
          categories: normalizedData.categories.length,
          transactions: normalizedData.transactions.length,
          settings: Object.keys(normalizedData.settings || {}).length,
          hasProfile: normalizedData.profile !== null,
          notification_settings: normalizedData.notification_settings.length,
          push_subscriptions: normalizedData.push_subscriptions.length,
          backup_schedules: normalizedData.backup_schedules.length,
          period_closures: normalizedData.period_closures.length
        });

        // Validar se há QUALQUER dado para importar (não apenas accounts/categories/transactions)
        const hasDataToImport = (
          normalizedData.accounts.length > 0 || 
          normalizedData.categories.length > 0 || 
          normalizedData.transactions.length > 0 ||
          Object.keys(normalizedData.settings || {}).length > 0 ||
          normalizedData.profile !== null ||
          normalizedData.notification_settings.length > 0 ||
          normalizedData.push_subscriptions.length > 0 ||
          normalizedData.backup_schedules.length > 0 ||
          normalizedData.period_closures.length > 0
        );
        
        if (!hasDataToImport) {
          logger.error('Arquivo de backup vazio - nenhum dado encontrado para importar');
          throw new Error('O arquivo de backup não contém nenhum dado para importar');
        }

        logger.info('Iniciando importação com dados normalizados:', { 
          accounts: normalizedData.accounts.length || 0, 
          categories: normalizedData.categories.length || 0, 
          transactions: normalizedData.transactions.length || 0,
          totalItems: normalizedData.accounts.length + normalizedData.categories.length + normalizedData.transactions.length
        });

        // 🗑️ LIMPAR TODOS OS DADOS DO USUÁRIO ANTES DE IMPORTAR
        console.log('🔥 INICIANDO LIMPEZA DE DADOS DO USUÁRIO');
        logger.info('Limpando dados existentes do usuário...');
        
        // CRÍTICO: Primeiro obter TODOS os account IDs do usuário para deletar account_locks
        const { data: userAccounts } = await supabase
          .from('accounts')
          .select('id')
          .eq('user_id', user.id);
        
        const accountIds = userAccounts?.map(a => a.id) || [];
        console.log(`🔥 ENCONTRADAS ${accountIds.length} CONTAS DO USUÁRIO:`, accountIds);
        logger.debug(`Encontradas ${accountIds.length} contas do usuário para limpar`);
        
        // PASSO 1: Deletar TODOS os account_locks das contas do usuário
        // account_locks NÃO tem user_id, então precisamos deletar por account_id
        if (accountIds.length > 0) {
          console.log(`🔥 DELETANDO ACCOUNT_LOCKS PARA ${accountIds.length} CONTAS...`);
          logger.debug(`Deletando account_locks para ${accountIds.length} contas...`);
          
          const { error: lockError, count: lockCount } = await supabase
            .from('account_locks')
            .delete()
            .in('account_id', accountIds);
          
          if (lockError) {
            if (lockError.code === 'PGRST116') {
              console.log('✓ NENHUM ACCOUNT_LOCK ENCONTRADO');
              logger.debug('✓ Nenhum account_lock encontrado para deletar');
            } else {
              console.error('❌ ERRO AO LIMPAR ACCOUNT_LOCKS:', lockError);
              logger.error('❌ Erro ao limpar account_locks:', lockError);
              throw new Error(`Falha ao limpar account_locks: ${lockError.message}`);
            }
          } else {
            console.log(`✓ DELETADOS ${lockCount || 0} ACCOUNT_LOCKS`);
            logger.debug(`✓ Deletados ${lockCount || 0} account_locks`);
          }
        } else {
          console.log('⚠️ NENHUMA CONTA ENCONTRADA - PULANDO LIMPEZA DE ACCOUNT_LOCKS');
        }
        
        // PASSO 2: Deletar dados em ordem respeitando foreign keys
        const tablesToClear = [
          'journal_entries',      // depende de chart_of_accounts
          'financial_audit',      // auditoria
          'audit_logs',           // logs de auditoria
          'transactions',         // depende de accounts e categories
          'period_closures',      // depende de accounts
          'backup_schedules',     // agendamentos
          'push_subscriptions',   // subscrições push
          'notification_settings',// configurações de notificações
          'accounts',             // contas
          'categories'            // categorias
        ];

        for (const table of tablesToClear) {
          try {
            const { error, count } = await supabase
              .from(table)
              .delete()
              .eq('user_id', user.id);
            
            if (error) {
              if (error.code === 'PGRST116') {
                logger.debug(`✓ ${table}: nenhum registro para deletar`);
              } else {
                logger.warn(`⚠️ Aviso ao limpar ${table}:`, error);
              }
            } else {
              logger.debug(`✓ ${table}: ${count || 0} registros deletados`);
            }
          } catch (err) {
            logger.warn(`⚠️ Erro ao limpar ${table}:`, err);
          }
        }
        
        // PASSO 3: Verificação final - garantir que não sobrou nenhum account_lock
        console.log('🔥 VERIFICAÇÃO FINAL DE ACCOUNT_LOCKS...');
        if (accountIds.length > 0) {
          const { data: remainingLocks } = await supabase
            .from('account_locks')
            .select('account_id')
            .in('account_id', accountIds);
          
          console.log(`🔥 ACCOUNT_LOCKS REMANESCENTES:`, remainingLocks?.length || 0, remainingLocks);
          
          if (remainingLocks && remainingLocks.length > 0) {
            console.error(`❌ ERRO: AINDA EXISTEM ${remainingLocks.length} ACCOUNT_LOCKS!`);
            logger.error(`❌ ERRO: Ainda existem ${remainingLocks.length} account_locks após limpeza!`);
            // Tentar deletar novamente com força bruta
            console.log('🔥 TENTANDO LIMPEZA FORÇADA...');
            for (const lock of remainingLocks) {
              const { error } = await supabase
                .from('account_locks')
                .delete()
                .eq('account_id', lock.account_id);
              console.log(`  - Deletando lock ${lock.account_id}:`, error ? 'ERRO' : 'OK');
            }
            console.log('✓ LIMPEZA FORÇADA CONCLUÍDA');
            logger.debug('✓ Limpeza forçada de account_locks restantes concluída');
          } else {
            console.log('✓ VERIFICAÇÃO OK: NENHUM ACCOUNT_LOCK REMANESCENTE');
            logger.debug('✓ Verificação: nenhum account_lock remanescente');
          }
        }
        
        console.log('✅ LIMPEZA DE DADOS CONCLUÍDA');
        logger.info('✅ Limpeza de dados concluída')

        // IMPORTAÇÃO NA ORDEM CORRETA DE DEPENDÊNCIAS
        logger.info('Iniciando importação em sequência respeitando dependências...');

        // Função auxiliar para inserir dados com tratamento de erro
        const insertData = async (table: string, records: any[], isOptional: boolean = false) => {
          if (!records || records.length === 0) {
            logger.debug(`Nenhum dado para ${table}`);
            return { success: true, count: 0 };
          }
          
          try {
            logger.debug(`Importando ${records.length} registros de ${table}...`);
            const query = supabase.from(table).insert(records);
            const result = await query;
            
            if (result.error) {
              const errorMsg = `Erro ao importar ${table}: ${result.error.message}`;
              logger.error(errorMsg, result.error);
              
              if (isOptional) {
                logger.warn(`⚠️ Tabela opcional ${table} falhou, continuando...`);
                return { success: false, count: 0, error: result.error.message };
              }
              throw result.error;
            }
            
            logger.info(`✅ Importado ${records.length} registros de ${table}`);
            return { success: true, count: records.length };
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`❌ Erro ao importar ${table}:`, error);
            
            if (isOptional) {
              logger.warn(`⚠️ Tabela opcional ${table} falhou, continuando...`);
              return { success: false, count: 0, error: errorMsg };
            }
            throw error;
          }
        };

        // IMPORTAÇÃO SEQUENCIAL (respeitando dependências)
        const importResults = {
          accounts: { success: false, count: 0 },
          categories: { success: false, count: 0 },
          transactions: { success: false, count: 0 },
          settings: { success: false, count: 0 },
          profile: { success: false, count: 0 },
          notification_settings: { success: false, count: 0 },
          push_subscriptions: { success: false, count: 0 },
          backup_schedules: { success: false, count: 0 },
          period_closures: { success: false, count: 0 }
        };

        // 1️⃣ PROFILE (Independente - Opcional)
        if (normalizedData.profile && typeof normalizedData.profile === 'object') {
          const profileToInsert = { ...normalizedData.profile, id: user.id };
          importResults.profile = await insertData('profiles', [profileToInsert], true);
        }

        // 2️⃣ ACCOUNTS (Independente - Crítico)
        // SOLUÇÃO DEFINITIVA: Gerar novos IDs para evitar colisão com account_locks órfãos
        const accountIdMap = new Map<string, string>();
        
        if (normalizedData.accounts?.length > 0) {
          console.log(`🔥 IMPORTANDO ${normalizedData.accounts.length} CONTAS COM NOVOS IDs...`);
          let successCount = 0;
          let errorCount = 0;
          
          for (const acc of normalizedData.accounts) {
            try {
              const oldId = acc.id;
              // Gerar novo ID se não for fornecido (mas aqui sempre geramos para evitar colisão)
              const newId = crypto.randomUUID();
              accountIdMap.set(oldId, newId);
              
              console.log(`  - Processando: ${acc.name} (ID: ${oldId} -> ${newId})...`);
              
              // Inserir a conta com o NOVO ID
              // Removemos o ID original e deixamos o Supabase usar o novo
              const accountToInsert = { 
                ...acc, 
                id: newId,
                user_id: user.id 
              };
              
              // Usamos insert simples pois estamos criando novos IDs garantidamente únicos
              const { error: insertError } = await supabase
                .from('accounts')
                .insert(accountToInsert);
              
              if (insertError) {
                console.error(`    ❌ Erro: ${insertError.message}`);
                errorCount++;
              } else {
                console.log(`    ✓ OK`);
                successCount++;
              }
            } catch (err) {
              console.error(`    ❌ Exceção:`, err);
              errorCount++;
            }
          }
          
          console.log(`✓ CONTAS: ${successCount} sucesso, ${errorCount} erros`);
          logger.info(`✅ Importado ${successCount} de ${normalizedData.accounts.length} contas`);
          importResults.accounts = { success: errorCount === 0, count: successCount };
          
          // Não falhar se conseguiu importar PELO MENOS uma conta
          if (successCount === 0) {
            throw new Error(`Falha ao importar todas as ${normalizedData.accounts.length} contas`);
          }
        }

        // 3️⃣ CATEGORIES (Independente - Crítico)
        if (normalizedData.categories?.length > 0) {
          const categoriesToInsert = normalizedData.categories.map((cat: any) => ({
            ...cat,
            user_id: user.id
          }));
          importResults.categories = await insertData('categories', categoriesToInsert, false);
        }

        // 4️⃣ TRANSACTIONS (Depende de: accounts, categories - Crítico)
        if (normalizedData.transactions?.length > 0) {
          const transactionsToInsert = normalizedData.transactions.map((tx: any) => {
            // Mapear IDs de conta antigos para novos
            const newAccountId = accountIdMap.get(tx.account_id) || tx.account_id;
            const newToAccountId = tx.to_account_id ? (accountIdMap.get(tx.to_account_id) || tx.to_account_id) : tx.to_account_id;
            
            return {
              ...tx,
              account_id: newAccountId,
              to_account_id: newToAccountId,
              user_id: user.id
            };
          });
          importResults.transactions = await insertData('transactions', transactionsToInsert, false);
        }

        // 5️⃣ SETTINGS (Independente - Opcional)
        if (normalizedData.settings && Object.keys(normalizedData.settings).length > 0) {
          const settingsToInsert = { ...normalizedData.settings, user_id: user.id };
          importResults.settings = await insertData('user_settings', [settingsToInsert], true);
        }

        // 6️⃣ NOTIFICATION SETTINGS (Independente - Opcional)
        if (normalizedData.notification_settings?.length > 0) {
          const notifToInsert = normalizedData.notification_settings.map((notif: any) => ({
            ...notif,
            user_id: user.id
          }));
          importResults.notification_settings = await insertData('notification_settings', notifToInsert, true);
        }

        // 7️⃣ PUSH SUBSCRIPTIONS (Depende de: user - Opcional)
        if (normalizedData.push_subscriptions?.length > 0) {
          const pushToInsert = normalizedData.push_subscriptions.map((push: any) => ({
            ...push,
            user_id: user.id
          }));
          importResults.push_subscriptions = await insertData('push_subscriptions', pushToInsert, true);
        }

        // 8️⃣ BACKUP SCHEDULES (Independente - Opcional)
        if (normalizedData.backup_schedules?.length > 0) {
          const schedulesToInsert = normalizedData.backup_schedules.map((sched: any) => ({
            ...sched,
            user_id: user.id
          }));
          importResults.backup_schedules = await insertData('backup_schedules', schedulesToInsert, true);
        }

        // 9️⃣ PERIOD CLOSURES (Independente - Opcional)
        if (normalizedData.period_closures?.length > 0) {
          const periodsToInsert = normalizedData.period_closures.map((period: any) => {
            const newAccountId = period.account_id ? (accountIdMap.get(period.account_id) || period.account_id) : period.account_id;
            return {
              ...period,
              account_id: newAccountId,
              user_id: user.id
            };
          });
          importResults.period_closures = await insertData('period_closures', periodsToInsert, true);
        }

        // Contar sucessos e falhas
        const totalImported = Object.values(importResults).reduce((sum, r) => sum + (r.success ? r.count : 0), 0);
        const criticalTables = ['accounts', 'categories', 'transactions'];
        const failedCriticalTables = Object.entries(importResults)
          .filter(([table, r]) => criticalTables.includes(table) && !r.success)
          .map(([t]) => t);
        const failedOptionalTables = Object.entries(importResults)
          .filter(([table, r]) => !criticalTables.includes(table) && !r.success)
          .map(([t]) => t);
        
        logger.info('Resultado final da importação:', { 
          totalImported, 
          criticalTablesFailed: failedCriticalTables,
          optionalTablesFailed: failedOptionalTables,
          details: importResults 
        });
        
        // Se tabelas críticas falharam, abortar
        if (failedCriticalTables.length > 0) {
          const errorMsg = `Falha ao importar tabelas críticas: ${failedCriticalTables.join(', ')}`;
          logger.error(errorMsg);
          throw new Error(errorMsg);
        }
        
        if (totalImported > 0) {
          const warningMsg = failedOptionalTables.length > 0 
            ? `\n⚠️ Algumas tabelas opcionais falharam: ${failedOptionalTables.join(', ')}`
            : '';
            
          toast({
            title: '✅ Importação concluída com sucesso!',
            description: `
${importResults.accounts.count} contas | 
${importResults.categories.count} categorias | 
${importResults.transactions.count} transações |
${importResults.notification_settings.count} notificações |
${importResults.backup_schedules.count} agendamentos${warningMsg}`,
          });
          setTimeout(() => window.location.reload(), 1500);
        } else {
          throw new Error('Nenhum dado foi importado do arquivo');
        }
      } catch (error) {
        logger.error('Import error:', error);
        const errorMsg = error instanceof Error ? error.message : 'Arquivo inválido ou corrompido';
        
        toast({
          title: 'Erro na importação',
          description: errorMsg,
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
    // A confirmação já é feita pelo input "APAGAR TUDO" e pelo confirm em Index.tsx
    onClearAllData();
    
    // Toast será mostrado pelo Index.tsx após limpeza bem-sucedida
  };

  const handleClearFailedSync = async () => {
    try {
      const count = await offlineSync.clearFailedOperations();
      if (count > 0) {
        logger.info(`Cleared ${count} failed sync operations`);
      }
    } catch (error) {
      logger.error('Failed to clear sync errors:', error);
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
              <div className="space-y-3">
                <div>
                  <h4 className="text-body font-medium mb-2">Limpar Erros de Sincronização</h4>
                  <p className="text-body text-muted-foreground mb-3">
                    Remove operações com falha permanente que estão bloqueando a sincronização.
                  </p>
                  <Button 
                    onClick={handleClearFailedSync} 
                    variant="outline" 
                    className="gap-2 w-full border-warning text-warning hover:bg-warning hover:text-warning-foreground"
                  >
                    <Shield className="h-4 w-4" />
                    Limpar Erros de Sincronização
                  </Button>
                </div>

                <Separator className="my-4" />

                <div>
                  <h4 className="text-body font-medium mb-2">Apagar Todos os Dados</h4>
                  <p className="text-body text-muted-foreground mb-3">
                    Para apagar todos os dados, digite "APAGAR TUDO" no campo abaixo.
                  </p>
                  <Input
                    type="text"
                    value={clearDataConfirmation}
                    onChange={(e) => setClearDataConfirmation(e.target.value)}
                    placeholder='Digite "APAGAR TUDO"'
                    className="border-destructive mb-3"
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
                  <p className="text-body text-muted-foreground mt-2">
                    Esta ação irá remover permanentemente todas as suas contas, transações e configurações.
                  </p>
                </div>
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