import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Lock, Unlock, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface PeriodClosure {
  id: string;
  period_start: string;
  period_end: string;
  closure_type: 'monthly' | 'annual';
  is_locked: boolean;
  closed_at: string;
  closed_by: string;
  unlocked_at?: string;
  unlocked_by?: string;
  notes?: string;
}

export function PeriodClosurePage() {
  const [periodClosures, setPeriodClosures] = useState<PeriodClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [closureType, setClosureType] = useState<'monthly' | 'annual'>('monthly');
  const [notes, setNotes] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [closureToDelete, setClosureToDelete] = useState<PeriodClosure | null>(null);

  useEffect(() => {
    loadPeriodClosures();
  }, []);

  async function loadPeriodClosures() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('period_closures')
        .select('*')
        .order('period_start', { ascending: false });

      if (error) throw error;
      setPeriodClosures((data as PeriodClosure[]) || []);
    } catch (error) {
      logger.error('Error loading period closures:', error);
      toast.error('Erro ao carregar fechamentos de período');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateClosure() {
    if (!startDate || !endDate) {
      toast.error('Selecione as datas de início e fim do período');
      return;
    }

    if (startDate > endDate) {
      toast.error('A data de início deve ser anterior à data de fim');
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // ✅ VALIDAÇÃO CRÍTICA: Verificar journal entries antes de fechar período
      const { data: validationData, error: validationError } = await supabase.rpc(
        'validate_period_entries',
        {
          p_user_id: user.id,
          p_start_date: format(startDate, 'yyyy-MM-dd'),
          p_end_date: format(endDate, 'yyyy-MM-dd'),
        }
      );

      if (validationError) {
        logger.error('Error validating period:', validationError);
        toast.error('Erro ao validar período contábil');
        return;
      }

      const validation = validationData?.[0];
      
      if (!validation) {
        toast.error('Erro ao validar período contábil');
        return;
      }

      // Verificar se período é válido
      if (!validation.is_valid) {
        const unbalanced = validation.unbalanced_count || 0;
        const missing = validation.missing_entries_count || 0;
        const total = validation.total_transactions || 0;
        
        let errorMessage = `Período contém inconsistências:\n`;
        
        if (missing > 0) {
          errorMessage += `\n• ${missing} transação(ões) sem lançamentos contábeis`;
        }
        
        if (unbalanced > 0) {
          errorMessage += `\n• ${unbalanced} lançamento(s) não balanceado(s) (débitos ≠ créditos)`;
        }
        
        errorMessage += `\n\nTotal de transações no período: ${total}`;
        errorMessage += `\n\nPor favor, corrija as inconsistências antes de fechar o período.`;
        
        toast.error('Período Inválido', {
          description: errorMessage,
          duration: 8000,
        });

        // Log detalhes para debug
        if (validation.error_details && Array.isArray(validation.error_details)) {
          logger.warn('Period validation errors:', validation.error_details);
        }

        return;
      }

      // Período válido, prosseguir com fechamento
      const { error } = await supabase
        .from('period_closures')
        .insert({
          user_id: user.id,
          period_start: format(startDate, 'yyyy-MM-dd'),
          period_end: format(endDate, 'yyyy-MM-dd'),
          closure_type: closureType,
          closed_by: user.id,
          is_locked: true,
          notes: notes || null,
        });

      if (error) throw error;

      toast.success('Período Fechado com Sucesso', {
        description: `${validation.total_transactions} transação(ões) validada(s) e período bloqueado`,
      });
      
      setStartDate(undefined);
      setEndDate(undefined);
      setNotes('');
      loadPeriodClosures();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao fechar período';
      logger.error('Error creating closure:', error);
      if (errorMessage.includes('duplicate key')) {
        toast.error('Já existe um fechamento para este período');
      } else {
        toast.error('Erro ao fechar período');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleLock(closure: PeriodClosure) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('period_closures')
        .update({
          is_locked: !closure.is_locked,
          unlocked_at: !closure.is_locked ? null : new Date().toISOString(),
          unlocked_by: !closure.is_locked ? null : user.id,
        })
        .eq('id', closure.id);

      if (error) throw error;

      toast.success(closure.is_locked ? 'Período desbloqueado' : 'Período bloqueado');
      loadPeriodClosures();
    } catch (error) {
      logger.error('Error toggling lock:', error);
      toast.error('Erro ao alterar status do período');
    }
  }

  function handleDeleteClick(closure: PeriodClosure) {
    setClosureToDelete(closure);
    setDeleteDialogOpen(true);
  }

  async function confirmDeleteClosure() {
    if (!closureToDelete) return;

    try {
      const { error } = await supabase
        .from('period_closures')
        .delete()
        .eq('id', closureToDelete.id);

      if (error) throw error;

      toast.success('Fechamento Excluído', {
        description: 'Fechamento removido com sucesso',
      });
      loadPeriodClosures();
      setDeleteDialogOpen(false);
      setClosureToDelete(null);
    } catch (error) {
      logger.error('Error deleting closure:', error);
      toast.error('Erro ao excluir fechamento');
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fechamento de Período Contábil</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie fechamentos mensais e anuais para bloquear edições retroativas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Criar Novo Fechamento</CardTitle>
          <CardDescription>
            Feche um período contábil para bloquear a edição de transações retroativas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data de Início</label>
              <DatePicker
                date={startDate}
                onDateChange={setStartDate}
                placeholder="Selecionar data"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Data de Fim</label>
              <DatePicker
                date={endDate}
                onDateChange={setEndDate}
                placeholder="Selecionar data"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Fechamento</label>
              <Select value={closureType} onValueChange={(value) => setClosureType(value as typeof closureType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Observações (opcional)</label>
            <Textarea
              placeholder="Adicione observações sobre este fechamento..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button onClick={handleCreateClosure} disabled={saving || !startDate || !endDate}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
            Fechar Período
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Períodos Fechados</CardTitle>
          <CardDescription>
            Períodos bloqueados não permitem edições de transações
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : periodClosures.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum período fechado ainda
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fechado em</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodClosures.map((closure) => (
                    <TableRow key={closure.id}>
                      <TableCell className="font-medium">
                        {format(new Date(closure.period_start), 'dd/MM/yyyy')} -{' '}
                        {format(new Date(closure.period_end), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {closure.closure_type === 'monthly' ? 'Mensal' : 'Anual'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {closure.is_locked ? (
                          <Badge variant="destructive">
                            <Lock className="mr-1 h-3 w-3" />
                            Bloqueado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Unlock className="mr-1 h-3 w-3" />
                            Desbloqueado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(closure.closed_at), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm">
                        {closure.notes || '-'}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleLock(closure)}
                        >
                          {closure.is_locked ? (
                            <>
                              <Unlock className="mr-1 h-3 w-3" />
                              Desbloquear
                            </>
                          ) : (
                            <>
                              <Lock className="mr-1 h-3 w-3" />
                              Bloquear
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(closure)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Excluir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fechamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {closureToDelete && (
                <>
                  Período: {format(new Date(closureToDelete.period_start), 'dd/MM/yyyy')} - {format(new Date(closureToDelete.period_end), 'dd/MM/yyyy')}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteClosure}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
