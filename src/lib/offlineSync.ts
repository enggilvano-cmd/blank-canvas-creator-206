import { offlineQueue, QueuedOperation } from './offlineQueue';
import { offlineDatabase } from './offlineDatabase';
import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';
import { getErrorMessage, handleError } from './errorUtils';
import { withTimeout, TimeoutError } from './timeout'; // ✅ BUG FIX #3: Timeout import
import type { Transaction, Account, Category } from '@/types';
import { toast } from 'sonner';
import { queryClient, queryKeys } from './queryClient';
import { getMonthsAgoUTC } from './timezone';
import { offlineSyncRateLimiter } from './rateLimiter';

const MAX_RETRIES = 5;
const SYNC_MONTHS = 12; // Aligned with useTransactions.tsx (1 year history)
const TEMP_ID_PREFIX = 'temp-'; // Normalization of temporary ID prefix
const SYNC_TIMEOUT = 300000; // 5 minutes timeout per sync operation
const OPERATION_LOCK_TIMEOUT = 60000; // 1 minute timeout per individual operation
const CIRCUIT_BREAKER_THRESHOLD = 5; // Failures before opening circuit
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute before retry

class OfflineSyncManager {
  // ✅ BUG FIX #2: Race condition prevention - Promise-based atomic lock
  private lockPromise: Promise<void> | null = null;
  private lockResolver: (() => void) | null = null;
  
  private operationLocks = new Map<string, { timestamp: number; promise: Promise<void> }>();
  private abortController: AbortController | null = null;
  private circuitBreakerFailures = 0;
  private circuitBreakerOpenUntil = 0;
  private syncLockName = 'offline-sync-lock';

  // ✅ BUG FIX #2: Acquire atomic lock (works across tabs + threads)
  private async acquireSyncLock(): Promise<() => void> {
    // Se houver lock anterior, aguardar
    if (this.lockPromise) {
      logger.debug('Waiting for previous sync lock...');
      await this.lockPromise;
    }

    // Criar novo lock
    let resolver: (() => void) | undefined;
    this.lockPromise = new Promise(resolve => {
      resolver = resolve;
    });

    if (!resolver) {
      throw new Error('Lock resolver not initialized');
    }

    logger.debug('Acquired sync lock');
    
    // Retornar função para liberar lock
    return () => {
      resolver?.();
      this.lockPromise = null;
      this.lockResolver = null;
      logger.debug('Released sync lock');
    };
  }

  async syncAll(): Promise<void> {
    if (!navigator.onLine) {
      logger.debug('Offline - skipping sync');
      return;
    }
    
    // ✅ BUG FIX #5: Circuit Breaker Pattern
    if (this.isCircuitOpen()) {
      logger.warn('Circuit breaker is open, skipping sync');
      return;
    }
    
    // ✅ BUG FIX #2: Race Condition - Use Web Locks API quando disponível
    if ('locks' in navigator) {
      try {
        await navigator.locks.request(
          this.syncLockName,
          { mode: 'exclusive', ifAvailable: true },
          async (lock) => {
            if (!lock) {
              logger.info('Another sync is already in progress (Web Lock held)');
              return;
            }
            logger.info('✅ Acquired Web Lock, starting sync...');
            await this.performSyncWithCircuitBreaker();
          }
        );
      } catch (error) {
        logger.error('Error with Web Locks API, falling back to Promise lock:', error);
        // Fallback para Promise lock se Web Locks falhar
        const releaseLock = await this.acquireSyncLock();
        try {
          await this.performSyncWithCircuitBreaker();
        } finally {
          releaseLock();
        }
      }
    } else {
      // Fallback para Promise-based lock (browsers sem Web Locks API)
      logger.debug('Web Locks API not available, using Promise-based lock');
      const releaseLock = await this.acquireSyncLock();
      try {
        await this.performSyncWithCircuitBreaker();
      } finally {
        releaseLock();
      }
    }
  }

  private isCircuitOpen(): boolean {
    if (this.circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      const now = Date.now();
      if (now < this.circuitBreakerOpenUntil) {
        return true;
      } else {
        // Reset circuit breaker after timeout
        logger.info('Circuit breaker timeout expired, resetting');
        this.circuitBreakerFailures = 0;
        this.circuitBreakerOpenUntil = 0;
        return false;
      }
    }
    return false;
  }

  private recordCircuitBreakerFailure(): void {
    this.circuitBreakerFailures++;
    if (this.circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
      logger.error(`Circuit breaker opened after ${CIRCUIT_BREAKER_THRESHOLD} failures. Will retry after ${CIRCUIT_BREAKER_TIMEOUT/1000}s`);
      toast.error('Servidor temporariamente indisponível. Aguarde um momento.');
    }
  }

  private recordCircuitBreakerSuccess(): void {
    if (this.circuitBreakerFailures > 0) {
      logger.info('Circuit breaker reset after successful operation');
      this.circuitBreakerFailures = 0;
      this.circuitBreakerOpenUntil = 0;
    }
  }

  private async performSyncWithCircuitBreaker(): Promise<void> {
    this.abortController = new AbortController();
    
    // Cleanup stale locks before starting
    this.cleanupStaleLocks();
    
    try {
      // ✅ BUG FIX #3: Envolver sync com timeout
      await withTimeout(
        this.performSync(),
        SYNC_TIMEOUT,
        `Sync operation timed out after ${SYNC_TIMEOUT / 1000}s`
      );
      this.recordCircuitBreakerSuccess();
    } catch (error) {
      this.recordCircuitBreakerFailure();
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  private async performSync(): Promise<void> {
    try {
      // 1. Processar Fila de Operações Pendentes
      const operations = await offlineQueue.getAll();
      
      if (operations.length > 0) {
        logger.info(`Syncing ${operations.length} queued operations`);
        
        // Sort by timestamp to maintain ordering
        operations.sort((a, b) => a.timestamp - b.timestamp);

        let successCount = 0;
        let failCount = 0;
        const tempIdMap = new Map<string, string>(); // Map<TempID, RealID>

        for (const operation of operations) {
          // Check for abortion
          if (this.abortController?.signal.aborted) {
            logger.info('Sync aborted, stopping operation processing');
            break;
          }

          // Skip operations that have already failed permanently
          if (operation.status === 'failed') {
            logger.debug(`Skipping permanently failed operation: ${operation.type}`);
            continue;
          }

          try {
            // Apply rate limiting to prevent overwhelming the server
            await offlineSyncRateLimiter.waitForSlot();
            
            await this.syncOperationWithLock(operation, tempIdMap);
            await offlineQueue.dequeue(operation.id);
            successCount++;
          } catch (error: unknown) {
            if (this.abortController?.signal.aborted) {
              logger.info('Operation aborted during sync');
              break;
            }

            const { message } = handleError(error);
            logger.error(`Failed to sync operation ${operation.id}: ${message}`);
            failCount++;
            
            if (operation.retries >= MAX_RETRIES) {
              // Extrair descrição da operação para mensagem mais informativa
              const description = operation.data?.description || 
                                 operation.data?.name || 
                                 operation.type;
              
              logger.error(`Falha permanente ao sincronizar ${operation.type}:`, {
                operationId: operation.id,
                data: operation.data,
                lastError: message,
                retries: operation.retries
              });
              
              toast.error(
                `Falha permanente: ${description}. ` +
                `Erro: ${message.substring(0, 100)}. ` +
                `Acesse Configurações > Limpar Erros para remover.`,
                { duration: 10000 }
              );
              
              // CRITICAL FIX: Mark as failed instead of removing
              await offlineQueue.markAsFailed(operation.id, message);
            } else {
              await offlineQueue.updateRetries(operation.id, operation.retries + 1);
            }
          }
        }
        
        if (successCount > 0) toast.success(`${successCount} operações sincronizadas.`);
        if (failCount > 0) logger.warn(`${failCount} operações falharam no sync.`);
        
        // Log rate limiter statistics
        const stats = offlineSyncRateLimiter.getStats();
        logger.info('Rate limiter stats:', {
          totalRequests: stats.totalRequests,
          queuedRequests: stats.queuedRequests,
          availableTokens: stats.availableTokens
        });
      }

      // 2. Baixar Dados Atualizados do Servidor (Sync Down)
      if (!this.abortController?.signal.aborted) {
        await this.syncDataFromServer();
      }
      
    } catch (error: unknown) {
      if (this.abortController?.signal.aborted) {
        logger.info('Sync was aborted');
      } else {
        logger.error('Critical sync error:', error);
      }
    } finally {
      clearTimeout(syncTimeout);
    }
  }

  async clearFailedOperations(): Promise<number> {
    try {
      const count = await offlineQueue.clearFailed();
      if (count > 0) {
        toast.success(`${count} operações com falha foram removidas.`);
        // Invalidar queries para atualizar UI
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
          queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
          queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
        ]);
      } else {
        toast.info('Nenhuma operação com falha encontrada.');
      }
      return count;
    } catch (error) {
      logger.error('Failed to clear failed operations:', error);
      toast.error('Erro ao limpar operações com falha.');
      throw error;
    }
  }

  async getFailedOperationsCount(): Promise<number> {
    try {
      const failed = await offlineQueue.getFailedOperations();
      return failed.length;
    } catch (error) {
      logger.error('Failed to get failed operations count:', error);
      return 0;
    }
  }

  async syncDataFromServer(): Promise<void> {
    if (!navigator.onLine) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // ✅ BUG FIX #12: Use UTC for consistent server sync
      const dateFrom = getMonthsAgoUTC(SYNC_MONTHS);

      // Transactions - Fetch all with pagination to avoid data loss
      let allTransactions: Transaction[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageData, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .gte('date', dateFrom)
          .order('date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (pageData && pageData.length > 0) {
          allTransactions = [...allTransactions, ...(pageData as Transaction[])];
          if (pageData.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      if (allTransactions.length > 0) {
        await offlineDatabase.syncTransactions(allTransactions, user.id, dateFrom);
      } else if (page === 0) {
        // Only sync empty if we really got no data on the first page (and no error)
        // This handles the case where the user deleted everything on another device
        await offlineDatabase.syncTransactions([], user.id, dateFrom);
      }

      // Fixed Transactions (Sync separado para garantir que todas sejam baixadas, independente da data)
      const { data: fixedTransactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_fixed', true)
        .is('parent_transaction_id', null);

      if (fixedTransactions) {
        // Salvar transações fixas no banco local e remover as que foram excluídas
        await offlineDatabase.syncFixedTransactions(fixedTransactions as Transaction[], user.id);
      }

      // Accounts
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id);

      if (accounts) {
        // Conversão de tipos se necessário (limit_amount vs limit)
        const mappedAccounts = accounts.map(acc => ({
          ...acc,
          limit: acc.limit_amount || 0,
        })) as unknown as Account[];
        await offlineDatabase.syncAccounts(mappedAccounts, user.id);
      }

      // Categories
      const { data: categories } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id);

      if (categories) {
        await offlineDatabase.syncCategories(categories as Category[], user.id);
      }

      await offlineDatabase.setLastSync('full-sync', Date.now());

      // ✅ Invalidate queries to update UI with fresh data (from DB or Server)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionsBase }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
      ]);

    } catch (error) {
      logger.error('Failed to sync data from server:', error);
    }
  }

  /**
   * Clean up stale operation locks (older than timeout)
   */
  private cleanupStaleLocks(): void {
    const now = Date.now();
    for (const [operationId, lock] of this.operationLocks.entries()) {
      if (now - lock.timestamp > OPERATION_LOCK_TIMEOUT) {
        logger.warn(`Cleaning up stale lock for operation: ${operationId}`);
        this.operationLocks.delete(operationId);
      }
    }
  }

  /**
   * Sync operation with individual lock to prevent duplicate processing
   */
  private async syncOperationWithLock(operation: QueuedOperation, tempIdMap: Map<string, string>): Promise<void> {
    const lockKey = `${operation.type}-${operation.id}`;
    
    // Check if this operation is already being processed
    const existingLock = this.operationLocks.get(lockKey);
    if (existingLock) {
      logger.info(`Operation ${lockKey} already in progress, waiting...`);
      try {
        await existingLock.promise;
        return;
      } catch (error) {
        logger.warn(`Previous operation ${lockKey} failed, retrying`);
        this.operationLocks.delete(lockKey);
      }
    }

    // Create operation timeout
    const operationTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), OPERATION_LOCK_TIMEOUT);
    });

    // Create the sync promise
    const syncPromise = Promise.race([
      this.syncOperation(operation, tempIdMap),
      operationTimeout
    ]);

    // Register the lock
    this.operationLocks.set(lockKey, {
      timestamp: Date.now(),
      promise: syncPromise
    });

    try {
      await syncPromise;
    } finally {
      this.operationLocks.delete(lockKey);
    }
  }

  /**
   * Detect potential conflicts before syncing an operation
   */
  private async detectConflicts(operation: QueuedOperation, payload: Record<string, unknown>): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      switch (operation.type) {
        case 'edit':
        case 'delete':
          // Check if the record still exists and hasn't been modified by another client
          if (payload.id || payload.transaction_id || payload.p_transaction_id) {
            const targetId = payload.id || payload.transaction_id || payload.p_transaction_id;
            
            // Skip temp IDs
            if (typeof targetId === 'string' && targetId.startsWith(TEMP_ID_PREFIX)) {
              break;
            }

            const { data: existingRecord, error } = await supabase
              .from('transactions')
              .select('updated_at, description, amount')
              .eq('id', targetId)
              .eq('user_id', user.id)
              .single();

            if (error?.code === 'PGRST116') {
              // Record doesn't exist - convert delete to no-op, edit to warning
              if (operation.type === 'delete') {
                logger.info(`Record ${targetId} already deleted, skipping delete operation`);
                return; // No-op for deletes
              } else {
                logger.warn(`Record ${targetId} not found for edit operation`);
                throw new Error(`Record not found: ${targetId}`);
              }
            }

            if (error) throw error;

            // For edits, check if server record is significantly different
            if (operation.type === 'edit' && existingRecord && payload.original_values) {
              const conflicts = this.detectDataConflicts(existingRecord, payload.original_values);
              if (conflicts.length > 0) {
                logger.warn(`Conflicts detected for ${targetId}:`, conflicts);
                // Apply last-write-wins strategy with user notification
                toast.warning(`Conflito detectado em ${payload.updates?.description || 'transação'}. Aplicando última alteração.`);
              }
            }
          }
          break;

        case 'add_account':
          // Check for duplicate account names
          if (payload.name) {
            const { data: existingAccount } = await supabase
              .from('accounts')
              .select('id, name')
              .eq('user_id', user.id)
              .eq('name', payload.name)
              .single();

            if (existingAccount) {
              throw new Error(`Conta "${payload.name}" já existe`);
            }
          }
          break;

        case 'add_category':
          // Check for duplicate category names
          if (payload.name) {
            const { data: existingCategory } = await supabase
              .from('categories')
              .select('id, name')
              .eq('user_id', user.id)
              .eq('name', payload.name)
              .single();

            if (existingCategory) {
              throw new Error(`Categoria "${payload.name}" já existe`);
            }
          }
          break;
      }
    } catch (error: unknown) {
      // Only re-throw non-404 errors
      const message = getErrorMessage(error);
      if (!message.includes('not found') && !message.includes('PGRST116')) {
        throw error;
      }
    }
  }

  /**
   * Detect data conflicts between local and server versions
   */
  private detectDataConflicts(serverRecord: Record<string, unknown>, originalLocalValues: Record<string, unknown>): string[] {
    const conflicts: string[] = [];

    // Check key fields for modifications
    const fieldsToCheck = ['description', 'amount', 'category_id', 'account_id', 'date'];
    
    for (const field of fieldsToCheck) {
      if (serverRecord[field] !== originalLocalValues[field]) {
        conflicts.push(`${field}: server="${serverRecord[field]}" vs original="${originalLocalValues[field]}"`);
      }
    }

    return conflicts;
  }

  private async syncOperation(operation: QueuedOperation, tempIdMap: Map<string, string>): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Safety check: só logout pode ser feito sem user
    if (!user && operation.type !== 'logout') {
        throw new Error('User not authenticated for sync');
    }

    let payload = { ...operation.data };
    
    // Helper para identificar ID temporário
    const isTempId = (id: unknown): id is string => typeof id === 'string' && id.startsWith(TEMP_ID_PREFIX);

    // === CONFLICT DETECTION ===
    // Check for potential conflicts before processing
    await this.detectConflicts(operation, payload);

    // === DEPENDENCY RESOLUTION ===
    // Resolve IDs using the map (replace temp IDs with real IDs from previous operations in this batch)
    if (payload.id && tempIdMap.has(payload.id)) payload.id = tempIdMap.get(payload.id);
    if (payload.account_id && tempIdMap.has(payload.account_id)) payload.account_id = tempIdMap.get(payload.account_id);
    if (payload.category_id && tempIdMap.has(payload.category_id)) payload.category_id = tempIdMap.get(payload.category_id);
    if (payload.to_account_id && tempIdMap.has(payload.to_account_id)) payload.to_account_id = tempIdMap.get(payload.to_account_id);
    if (payload.transaction_id && tempIdMap.has(payload.transaction_id)) payload.transaction_id = tempIdMap.get(payload.transaction_id);
    if (payload.parent_transaction_id && tempIdMap.has(payload.parent_transaction_id)) payload.parent_transaction_id = tempIdMap.get(payload.parent_transaction_id);
    if (payload.p_transaction_id && tempIdMap.has(payload.p_transaction_id)) payload.p_transaction_id = tempIdMap.get(payload.p_transaction_id);
    
    // Also check inside 'updates' object for edits
    if (payload.updates) {
      if (payload.updates.account_id && tempIdMap.has(payload.updates.account_id)) payload.updates.account_id = tempIdMap.get(payload.updates.account_id);
      if (payload.updates.category_id && tempIdMap.has(payload.updates.category_id)) payload.updates.category_id = tempIdMap.get(payload.updates.category_id);
    }

    // Capture the temp ID before deleting it (for mapping later)
    const originalTempId = isTempId(payload.id) ? payload.id : null;

    // Remove ID temporário antes de enviar ao Supabase (para que ele gere um oficial)
    if (['transaction', 'add_account', 'add_category'].includes(operation.type)) {
       if (isTempId(payload.id)) {
           delete payload.id; 
       }
    }

    switch (operation.type) {
      case 'transaction': {
        const body = { transaction: payload };
        logger.info('🔄 [SYNC] Payload:', JSON.stringify(body, null, 2));
        const response = await supabase.functions.invoke('atomic-transaction', { body });
        logger.info('🔄 [SYNC] Resposta:', JSON.stringify({ data: response.data, error: response.error }, null, 2));
        
        if (response.error) {
          logger.error('🚨 [SYNC] Erro 400:', JSON.stringify({
            errorDetails: response.error,
            responseData: response.data,
            sentPayload: body
          }, null, 2));
          throw response.error;
        }
        const { data: rpcData, error } = response;
        
        // Capture new ID and update map
        const responseData = rpcData as { transaction?: { id: string } };
        if (originalTempId && responseData?.transaction?.id) {
            tempIdMap.set(originalTempId, responseData.transaction.id);
        }
        break;
      }

      case 'edit':
        if (isTempId(payload.id) || isTempId(payload.transaction_id)) {
             // Se ainda é temp ID aqui, significa que não foi resolvido (criação falhou ou não estava no batch)
             logger.warn('Skipping edit for unresolved temporary ID', payload);
             return; 
        }
        await supabase.functions.invoke('atomic-edit-transaction', { body: payload });
        break;

      case 'delete':
        if (isTempId(payload.id) || isTempId(payload.p_transaction_id)) {
            // Deletar algo que nem existe no servidor = sucesso imediato.
            return;
        }
        await supabase.rpc('atomic_delete_transaction', {
          p_user_id: user!.id,
          p_transaction_id: payload.p_transaction_id || payload.id // Handle both naming conventions
        });
        break;

      case 'transfer':
        if (payload.origin_transaction_id && isTempId(payload.origin_transaction_id)) delete payload.origin_transaction_id;
        if (payload.destination_transaction_id && isTempId(payload.destination_transaction_id)) delete payload.destination_transaction_id;
        await supabase.functions.invoke('atomic-transfer', { body: { transfer: payload } });
        break;

      case 'add_account': {
        const { data, error } = await supabase.from('accounts').insert({ ...payload, user_id: user!.id }).select().single();
        if (error) throw error;
        
        if (originalTempId && data?.id) {
            tempIdMap.set(originalTempId, data.id);
        }
        break;
      }
      
      case 'edit_account':
        if (isTempId(payload.account_id)) return;
        await supabase.from('accounts').update(payload.updates).eq('id', payload.account_id);
        break;

      case 'delete_account':
        if (isTempId(payload.account_id)) return;
        await supabase.from('accounts').delete().eq('id', payload.account_id);
        break;

      case 'add_category': {
        const { data, error } = await supabase.from('categories').insert({ ...payload, user_id: user!.id }).select().single();
        if (error) throw error;
        
        if (originalTempId && data?.id) {
            tempIdMap.set(originalTempId, data.id);
        }
        break;
      }

      case 'edit_category':
        if (isTempId(payload.category_id)) return;
        await supabase.from('categories').update(payload.updates).eq('id', payload.category_id);
        break;
      
      case 'delete_category':
        if (isTempId(payload.category_id)) return;
        await supabase.from('categories').delete().eq('id', payload.category_id);
        break;

      case 'logout':
        await supabase.auth.signOut();
        await offlineDatabase.clearAll();
        break;

      case 'credit_payment':
         await supabase.functions.invoke('atomic-pay-bill', { body: payload });
         break;
         
      case 'add_fixed_transaction':
         if (isTempId(payload.id)) delete payload.id;
         await supabase.functions.invoke('atomic-create-fixed', { body: payload });
         break;

      case 'add_installments': {
        const { transactions, total_installments } = payload;
        if (!transactions || !Array.isArray(transactions)) {
          throw new Error('Invalid payload for add_installments');
        }

        // Resume from previous attempt if available
        const createdIds: string[] = payload.created_ids || [];
        let hasUpdates = false;

        for (let i = 0; i < transactions.length; i++) {
          // Skip if already created
          if (i < createdIds.length) continue;

          const transaction = transactions[i];
          
          // ✅ Type-safe: Validar estrutura da transação
          if (!transaction || typeof transaction !== 'object') {
            logger.error('Invalid transaction in import operation');
            continue;
          }
          
          const { data: rpcData, error } = await supabase.rpc('atomic_create_transaction', {
            p_user_id: user!.id,
            p_description: transaction.description as string,
            p_amount: transaction.amount as number,
            p_date: transaction.date as string,
            p_type: transaction.type as 'income' | 'expense',
            p_category_id: transaction.category_id as string | null,
            p_account_id: transaction.account_id as string,
            p_status: transaction.status as 'pending' | 'completed',
            p_invoice_month: transaction.invoice_month ?? undefined,
            p_invoice_month_overridden: (transaction as any).invoice_month_overridden ?? false,
          });

          if (error) throw error;

          const record = rpcData && Array.isArray(rpcData) ? rpcData[0] as { transaction_id?: string; success?: boolean; error_message?: string } : null;

          if (!record || record.success === false) {
            throw new Error(record?.error_message || 'Erro ao criar transação parcelada no sync');
          }
          
          if(record.transaction_id) {
            createdIds.push(record.transaction_id);
            hasUpdates = true;
            
            // Save progress after each successful creation to ensure idempotency
            // If we crash, next time we skip this index
            await offlineQueue.updateData(operation.id, {
              ...payload,
              created_ids: createdIds
            });
          }
        }

        if (createdIds.length !== total_installments) {
          logger.error('Mismatch between offline installments created and expected', {
            expected: total_installments,
            created: createdIds.length,
          });
          throw new Error('Erro ao registrar metadados das parcelas no sync');
        }

        const parentId = createdIds[0];
        const updatePromises = createdIds.map((id, index) =>
          supabase
            .from('transactions')
            .update({
              installments: total_installments,
              current_installment: index + 1,
              parent_transaction_id: parentId,
            })
            .eq('id', id)
        );

        const updateResults = await Promise.all(updatePromises);
        const updateErrors = updateResults.filter(r => r.error);
        if (updateErrors.length > 0) {
          logger.error('Error updating installment metadata in sync:', updateErrors[0].error);
          throw updateErrors[0].error;
        }

        break;
      }

      case 'import_transactions': {
        const { transactions, replace_ids = [] } = payload;
        if (!transactions || !Array.isArray(transactions)) {
          throw new Error('Invalid payload for import_transactions');
        }

        if (replace_ids.length > 0) {
          for (const txId of replace_ids) {
            try {
              await supabase.functions.invoke('atomic-delete-transaction', {
                body: { transaction_id: txId, scope: 'current' }
              });
            } catch (e) {
              logger.warn(`Failed to delete replaced transaction ${txId} during import sync`, e);
            }
          }
        }

        const localCategories = await offlineDatabase.getCategories(user!.id);
        const categoryMap = new Map<string, string>(
          localCategories.map(cat => [cat.name, cat.id])
        );

        let successCount = 0;
        let failCount = 0;
        const errors: string[] = [];

        for (const transaction of transactions) {
          try {
            const category_id = transaction.category ? categoryMap.get(transaction.category) || null : null;
            
            if (transaction.category && !category_id) {
               logger.warn(`Category "${transaction.category}" not found locally. Skipping transaction import for "${transaction.description}".`);
               failCount++;
               continue; 
            }

            const { data: rpcData, error } = await supabase.functions.invoke('atomic-transaction', {
              body: {
                transaction: {
                  description: transaction.description,
                  amount: transaction.amount,
                  date: transaction.date,
                  type: transaction.type,
                  category_id: category_id,
                  account_id: transaction.account_id,
                  status: transaction.status || 'completed',
                }
              }
            });

            if (error) throw error;
            
            const responseData = rpcData as { transaction?: { id: string } };
            const transactionId = responseData?.transaction?.id;

            if (transactionId && (transaction.installments || transaction.current_installment || transaction.invoice_month)) {
               const updates: Record<string, unknown> = {};
               if (transaction.installments) updates.installments = transaction.installments;
               if (transaction.current_installment) updates.current_installment = transaction.current_installment;
               if (transaction.invoice_month) {
                 updates.invoice_month = transaction.invoice_month;
                 updates.invoice_month_overridden = true;
               }
               await supabase.from('transactions').update(updates).eq('id', transactionId);
            }
            successCount++;
          } catch (err: unknown) {
            const { message } = handleError(err);
            logger.error(`Failed to import transaction "${transaction.description}": ${message}`);
            failCount++;
            errors.push(message);
          }
        }

        if (successCount === 0 && failCount > 0) {
          throw new Error(`Todas as ${failCount} transações falharam na importação. Erros: ${errors.slice(0, 3).join(', ')}`);
        }

        if (failCount > 0) {
          logger.warn(`Importação parcial: ${successCount} sucessos, ${failCount} falhas.`);
          // Não lançamos erro aqui para não travar a fila, já que algumas passaram.
          // Idealmente, notificaríamos o usuário, mas no sync background isso é complexo.
        }
        break;
      }
      
      case 'import_categories': {
        const { categories } = payload;
        if (!categories || !Array.isArray(categories)) {
          throw new Error('Invalid payload for import_categories');
        }

        let successCount = 0;
        for (const category of categories) {
          try {
            const { error } = await supabase
              .from('categories')
              .insert({
                ...category,
                user_id: user!.id,
              });

            if (error) throw error;
            successCount++;
          } catch (err) {
            logger.warn(`Failed to import category "${category.name}":`, err);
            // Continue com próximas categorias em vez de falhar toda a operação
          }
        }

        if (successCount === 0) {
          throw new Error('Nenhuma categoria foi importada com sucesso');
        }

        logger.info(`Successfully imported ${successCount}/${categories.length} categories`);
        break;
      }

      case 'import_accounts': {
        const { accounts } = payload;
        if (!accounts || !Array.isArray(accounts)) {
          throw new Error('Invalid payload for import_accounts');
        }

        let successCount = 0;
        const createdAccounts: Account[] = [];

        for (const account of accounts) {
          try {
            const { data, error } = await supabase
              .from('accounts')
              .insert({
                ...account,
                user_id: user!.id,
              })
              .select()
              .single();

            if (error) throw error;
            if (data) createdAccounts.push(data as unknown as Account);
            successCount++;
          } catch (err) {
            logger.warn(`Failed to import account "${account.name}":`, err);
            // Continue com próximas contas em vez de falhar toda a operação
          }
        }

        // Create Initial Balance Transactions for imported accounts
        if (createdAccounts.length > 0) {
            const initialBalanceTransactions = createdAccounts
                .filter(acc => acc.balance !== 0)
                .map(acc => {
                    const isIncome = acc.balance > 0;
                    const amount = Math.abs(acc.balance);
                    return {
                        user_id: user!.id,
                        description: 'Saldo Inicial',
                        amount: isIncome ? amount : -amount,
                        date: new Date().toISOString().split('T')[0],
                        type: isIncome ? 'income' : 'expense',
                        account_id: acc.id,
                        status: 'completed',
                        category_id: null
                    };
                });
            
            if (initialBalanceTransactions.length > 0) {
                const { error: txError } = await supabase
                    .from('transactions')
                    .insert(initialBalanceTransactions);
                
                if (txError) {
                    logger.error('Failed to create initial balance transactions for imported accounts in sync', txError);
                }
            }
        }

        if (successCount === 0) {
          throw new Error('Nenhuma conta foi importada com sucesso');
        }

        logger.info(`Successfully imported ${successCount}/${accounts.length} accounts`);
        break;
      }

      case 'clear_all_data':
        await supabase.from("transactions").delete().eq("user_id", user!.id);
        await supabase.from("accounts").delete().eq("user_id", user!.id);
        await supabase.from("categories").delete().eq("user_id", user!.id);
        break;

      default:
        logger.warn(`Operation type ${operation.type} not fully implemented in sync.`);
    }
  }

  /**
   * Clean up all sync resources and abort any ongoing operations
   */
  public cleanup(): void {
    logger.info('Cleaning up offline sync manager resources');
    
    // Abort any ongoing sync
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Clear all operation locks
    this.operationLocks.clear();
    
    // Reset sync state
    this.isSyncing = false;
    this.syncPromise = null;

    logger.info('Offline sync manager cleanup completed');
  }

  /**
   * Get current sync status and statistics
   */
  public getStatus(): {
    isSyncing: boolean;
    activeLocks: number;
    hasAbortController: boolean;
  } {
    return {
      isSyncing: this.isSyncing,
      activeLocks: this.operationLocks.size,
      hasAbortController: this.abortController !== null,
    };
  }

  /**
   * Force abort current sync operation
   */
  public abortSync(): void {
    if (this.abortController) {
      logger.warn('Force aborting sync operation');
      this.abortController.abort();
    }
  }
}

export const offlineSync = new OfflineSyncManager();