import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BackupSchedule {
  id: string;
  user_id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  is_active: boolean;
  last_backup_at: string | null;
  next_backup_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BackupHistory {
  id: string;
  user_id: string;
  file_path: string;
  file_size: number;
  backup_type: 'manual' | 'scheduled';
  created_at: string;
}

export const useBackupSchedule = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Buscar configuração de agendamento
  const { data: schedule, isLoading: scheduleLoading } = useQuery({
    queryKey: ['backup-schedule'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await supabase
        .from('backup_schedules')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as BackupSchedule | null;
    },
  });

  // Buscar histórico de backups
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['backup-history'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await supabase
        .from('backup_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as BackupHistory[];
    },
  });

  // Criar/atualizar agendamento
  const saveScheduleMutation = useMutation({
    mutationFn: async ({ frequency, is_active }: { frequency: 'daily' | 'weekly' | 'monthly'; is_active: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      // Calcular próximo backup
      const next = new Date();
      switch (frequency) {
        case 'daily': next.setDate(next.getDate() + 1); break;
        case 'weekly': next.setDate(next.getDate() + 7); break;
        case 'monthly': next.setMonth(next.getMonth() + 1); break;
      }
      next.setHours(3, 0, 0, 0);

      const scheduleData = {
        user_id: user.id,
        frequency,
        is_active,
        next_backup_at: next.toISOString(),
      };

      if (schedule) {
        const { error } = await supabase
          .from('backup_schedules')
          .update(scheduleData)
          .eq('id', schedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('backup_schedules')
          .insert(scheduleData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-schedule'] });
      toast({
        title: "Agendamento salvo",
        description: "Backup automático configurado com sucesso",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  // Deletar agendamento
  const deleteScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!schedule) return;

      const { error } = await supabase
        .from('backup_schedules')
        .delete()
        .eq('id', schedule.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-schedule'] });
      toast({
        title: "Agendamento removido",
        description: "Backup automático desativado",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  // Baixar backup
  const downloadBackup = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('backups')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop() || 'backup.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download iniciado",
        description: "Seu backup está sendo baixado",
      });
    } catch (error) {
      toast({
        title: "Erro no download",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  return {
    schedule,
    scheduleLoading,
    history,
    historyLoading,
    saveSchedule: saveScheduleMutation.mutate,
    isSaving: saveScheduleMutation.isPending,
    deleteSchedule: deleteScheduleMutation.mutate,
    isDeleting: deleteScheduleMutation.isPending,
    downloadBackup,
  };
};
