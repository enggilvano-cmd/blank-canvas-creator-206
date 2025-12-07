-- Remove RLS (Row Level Security) da tabela de transações temporariamente para aplicar as novas regras
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;

-- Remove políticas antigas (se existirem) para evitar conflitos
DROP POLICY IF EXISTS "Enable all actions for user" ON public.transactions;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.transactions;
DROP POLICY IF EXISTS "Enable read access for user" ON public.transactions;
DROP POLICY IF EXISTS "Enable update for user" ON public.transactions;
DROP POLICY IF EXISTS "Enable delete for user" ON public.transactions;

-- 1. Política de INSERÇÃO (INSERT)
-- Permite que um usuário autenticado insira uma transação SE o user_id da transação for o seu próprio.
CREATE POLICY "Enable insert for authenticated users"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 2. Política de SELEÇÃO (SELECT)
-- Permite que um usuário autenticado leia (veja) apenas as suas próprias transações.
CREATE POLICY "Enable read access for user"
ON public.transactions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3. Política de ATUALIZAÇÃO (UPDATE)
-- Permite que um usuário autenticado atualize apenas as suas próprias transações.
CREATE POLICY "Enable update for user"
ON public.transactions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Política de EXCLUSÃO (DELETE)
-- Permite que um usuário autenticado exclua apenas as suas próprias transações.
CREATE POLICY "Enable delete for user"
ON public.transactions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Re-habilita o RLS na tabela de transações
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;