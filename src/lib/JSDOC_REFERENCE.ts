// 📚 JSDOC REFERENCE - FUNÇÕES COMPLEXAS DO PLANIFLOW
// Este arquivo documenta as funções principais com JSDoc detalhado

/**
 * Hook para gerenciar transações com paginação, filtros e mutations
 * @param {Object} params - Parâmetros de configuração
 * @param {number} [params.page=0] - Número da página (0-indexed)
 * @param {number | null} [params.pageSize=50] - Itens por página. null = sem paginação
 * @param {string} [params.search] - Termo de busca (descrição)
 * @param {string} [params.type='all'] - Filtro de tipo (all|income|expense|transfer)
 * @param {string} [params.accountId='all'] - Filtro de conta
 * @param {string} [params.categoryId='all'] - Filtro de categoria
 * @param {string} [params.status='all'] - Filtro de status (all|pending|completed)
 * @param {boolean} [params.enabled=true] - Habilita ou desabilita a query
 * @returns {Object} Estado das transações e funções para mutations
 * @returns {Transaction[]} [returns.transactions] - Array de transações
 * @returns {boolean} [returns.isLoading] - Se está carregando
 * @returns {Error|null} [returns.error] - Erro de carregamento
 * @returns {number} [returns.totalCount] - Total de transações (considerando filtros)
 * @returns {number} [returns.pageCount] - Total de páginas
 * @returns {Function} [returns.addTransaction] - Função para adicionar transação
 * @returns {Function} [returns.editTransaction] - Função para editar transação
 * @returns {Function} [returns.deleteTransaction] - Função para deletar transação
 * 
 * @example
 * const { transactions, addTransaction, isLoading } = useTransactions({
 *   page: 0,
 *   pageSize: 50,
 *   type: 'expense',
 *   search: 'mercado'
 * });
 */
export function useTransactions(params) {
  // Veja src/hooks/queries/useTransactions.tsx
}

/**
 * Hook para gerenciar state de filtros com persistência em localStorage
 * Salva automaticamente mudanças em localStorage com debounce
 * @template T - Tipo do estado de filtros
 * @param {string} key - Chave no localStorage para persistência
 * @param {T} defaultValue - Valor padrão se localStorage estiver vazio
 * @returns {[T, Function]} - Tupla com estado atual e função para atualizar
 * @returns {T} [0] - Estado atual do filtro
 * @returns {Function} [1] - Setter que salva em localStorage
 * 
 * @example
 * const [filters, setFilters] = usePersistedFilters(
 *   'transaction-filters',
 *   { search: '', type: 'all' }
 * );
 */
export function usePersistedFilters(key, defaultValue) {
  // Veja src/hooks/usePersistedFilters.ts
}

/**
 * Hook para gerenciar autenticação com Supabase
 * Gerencia login/logout, persistência de sessão e sincronização realtime
 * @returns {Object} Estado e funções de autenticação
 * @returns {User|null} [returns.user] - Usuário autenticado ou null
 * @returns {boolean} [returns.isLoading] - Se está carregando estado de auth
 * @returns {Error|null} [returns.error] - Erro de autenticação
 * @returns {Function} [returns.signIn] - Função de login (email/password)
 * @returns {Function} [returns.signOut] - Função de logout
 * @returns {Function} [returns.signUp] - Função de registro
 * @returns {boolean} [returns.isSubscriptionActive] - Se subscrição está ativa
 * 
 * @example
 * const { user, signOut, isSubscriptionActive } = useAuth();
 * if (!isSubscriptionActive()) {
 *   return <ExpiredSubscriptionComponent />;
 * }
 */
export function useAuth() {
  // Veja src/hooks/useAuth.tsx
}

/**
 * Hook para gerenciar accounts (contas) com mutations otimizadas
 * Usa React Query com optimistic updates
 * @returns {Object} Estado e funções para contas
 * @returns {Account[]} [returns.accounts] - Lista de contas do usuário
 * @returns {boolean} [returns.isLoading] - Se está carregando
 * @returns {Function} [returns.addAccount] - Adicionar nova conta
 * @returns {Function} [returns.editAccount] - Editar conta existente
 * @returns {Function} [returns.deleteAccount] - Deletar conta
 * 
 * @example
 * const { accounts, addAccount } = useAccounts();
 * await addAccount({
 *   name: 'Conta Corrente',
 *   type: 'checking',
 *   balance: 1000
 * });
 */
export function useAccounts() {
  // Veja src/hooks/queries/useAccounts.tsx
}

/**
 * Hook para gerenciar transações offline com sincronização automática
 * Usa IndexedDB para persistência local e sincroniza com Supabase quando online
 * @returns {Object} Funções de transação com offline support
 * @returns {Function} [returns.handleAddTransaction] - Adicionar transaction (offline-safe)
 * @returns {Function} [returns.handleEditTransaction] - Editar transaction (offline-safe)
 * @returns {Function} [returns.handleDeleteTransaction] - Deletar transaction (offline-safe)
 * @returns {Promise<Array>} [returns.syncPendingOperations] - Sincronizar operações pendentes
 * 
 * @example
 * const { handleAddTransaction, syncPendingOperations } = useOfflineTransactionMutations();
 * 
 * // Em modo offline, salva localmente
 * await handleAddTransaction(transactionData);
 * 
 * // Quando voltar online
 * await syncPendingOperations();
 */
export function useOfflineTransactionMutations() {
  // Veja src/hooks/useTransactionHandlers.ts
}

/**
 * Calcula saldo total de todas as contas considerando limite de crédito
 * @param {Account[]} accounts - Lista de contas
 * @param {Object} [options] - Opções
 * @param {boolean} [options.includeLimit=true] - Incluir limite de crédito no cálculo
 * @param {boolean} [options.onlyActive=true] - Incluir apenas contas ativas
 * @returns {number} Saldo total em centavos
 * 
 * Fórmula:
 * - Checking: balance
 * - Savings: balance
 * - Credit: -(balance) ou -(balance - limit) se incluirLimit
 * 
 * @example
 * const totalBalance = calculateTotalBalance(accounts);
 * // Retorna saldo total positivo (ativo) ou negativo (devedor)
 */
export function calculateTotalBalance(accounts, options) {
  // Veja src/lib/balanceCalculations.ts
}

/**
 * Converte string de moeda para centavos de forma segura
 * Suporta formatos brasileiros (1.234,56) e internacionais (1,234.56)
 * @param {string} value - String de valor monetário
 * @returns {number} Valor em centavos como inteiro
 * 
 * @example
 * currencyStringToCents('1.234,56') // → 123456
 * currencyStringToCents('1,234.56') // → 123456
 * currencyStringToCents('invalid')  // → NaN
 */
export function currencyStringToCents(value) {
  // Veja src/lib/utils.ts
}

/**
 * Calcula mês da fatura baseado em data da compra e dia de fechamento
 * Regra: Mês da fatura = mês de FECHAMENTO (não de vencimento)
 * @param {Date} transactionDate - Data da transação
 * @param {number} closingDate - Dia de fechamento da fatura (1-31)
 * @param {number} [dueDate=10] - Dia de vencimento (para referência apenas)
 * @returns {string} Mês da fatura no formato "YYYY-MM"
 * 
 * @example
 * // Fechamento dia 30, compra em 12/11
 * const month = calculateInvoiceMonthByDue(
 *   new Date(2025, 10, 12),
 *   30
 * );
 * // Retorna "2025-11"
 */
export function calculateInvoiceMonthByDue(transactionDate, closingDate, dueDate) {
  // Veja src/lib/dateUtils.ts
}

/**
 * Hook para gerenciar subscriptions (Lemon Squeezy)
 * Valida se usuário tem acesso ativo à aplicação
 * @returns {Object} Estado de subscription
 * @returns {boolean} [returns.isActive] - Se subscrição está ativa
 * @returns {Date|null} [returns.expiresAt] - Data de expiração
 * @returns {string|null} [returns.plan] - Nome do plano (lite|pro|premium)
 * @returns {Function} [returns.checkSubscription] - Verificar status manualmente
 * 
 * @example
 * const { isActive, plan, expiresAt } = useSubscription();
 * if (!isActive) {
 *   return <UpgradePrompt expiresAt={expiresAt} />;
 * }
 */
export function useSubscription() {
  // Veja src/hooks/useSubscription.ts
}

/**
 * Hook para sincronização realtime com Supabase
 * Escuta mudanças em uma tabela e sincroniza com React Query
 * @param {Object} config - Configuração da subscription
 * @param {string} config.table - Nome da tabela (transactions|accounts|categories)
 * @param {string} [config.event='*'] - Tipo de evento (INSERT|UPDATE|DELETE|*)
 * @param {Function} [config.onData] - Callback quando dados chegam
 * @returns {void} - Hook sem retorno explícito, sincroniza automaticamente
 * 
 * @example
 * // Sincronizar todas as mudanças em transações
 * useRealtimeSubscription({
 *   table: 'transactions',
 *   event: '*',
 *   onData: () => console.log('Dados atualizados')
 * });
 */
export function useRealtimeSubscription(config) {
  // Veja src/hooks/useRealtimeSubscription.ts
}

/**
 * Cria um objeto Date a partir de qualquer input (string, nulo, etc)
 * Garante que não haja problemas de timezone e NUNCA quebre
 * @param {unknown} dateInput - Pode ser string (YYYY-MM-DD|ISO8601), Date, ou null
 * @returns {Date} Data válida ou fallback (1970-01-01)
 * 
 * @example
 * createDateFromString('2025-12-15')  // → Date(2025-12-15)
 * createDateFromString(new Date())    // → Mesma data
 * createDateFromString(null)          // → Date(1970-01-01)
 * createDateFromString('invalid')     // → Date(1970-01-01)
 */
export function createDateFromString(dateInput) {
  // Veja src/lib/dateUtils.ts
}

/**
 * Hook para gerenciar formulário de adição de transação com validação
 * Handles simples, parceladas e transações fixas
 * @param {Object} params - Parâmetros
 * @param {boolean} params.open - Se modal está aberto
 * @param {string} [params.initialType] - Tipo inicial (income|expense|transfer)
 * @param {Account[]} params.accounts - Lista de contas para selector
 * @param {Function} params.onAddTransaction - Callback para adicionar transação
 * @param {Function} [params.onAddInstallmentTransactions] - Callback para parceladas
 * @param {Function} [params.onSuccess] - Callback de sucesso
 * @param {Function} params.onClose - Callback para fechar modal
 * @returns {Object} Estado do formulário e handlers
 * @returns {Object} [returns.formData] - Dados do formulário
 * @returns {Function} [returns.setFormData] - Setter para formData
 * @returns {Function} [returns.handleSubmit] - Submeter formulário
 * @returns {string[]} [returns.filteredCategories] - Categorias filtradas por tipo
 * @returns {Object} [returns.selectedAccount] - Conta selecionada
 * 
 * @example
 * const form = useAddTransactionForm({
 *   open: true,
 *   onAddTransaction: async (data) => {
 *     await addTransaction(data);
 *   },
 *   onClose: () => setOpen(false)
 * });
 */
export function useAddTransactionForm(params) {
  // Veja src/hooks/useAddTransactionForm.ts
}

export const JSDocExamples = {
  // Exemplos de função assíncrona com tratamento de erro
  addTransactionExample: `
    try {
      const result = await addTransaction({
        description: 'Mercado',
        amount: 15000,
        date: new Date(),
        type: 'expense',
        account_id: 'acc-1',
        category_id: 'cat-1'
      });
      console.log('Transação adicionada:', result);
    } catch (error) {
      console.error('Erro ao adicionar:', error);
    }
  `,
  
  // Exemplo de validação com Zod
  validationExample: `
    const schema = z.object({
      description: z.string().min(3, 'Mínimo 3 caracteres'),
      amount: z.number().positive('Deve ser positivo'),
      date: z.date(),
      type: z.enum(['income', 'expense', 'transfer'])
    });
    
    try {
      const validated = schema.parse(formData);
      // Dados válidos
    } catch (error) {
      // Erro de validação
      console.error(error.errors);
    }
  `
};
