-- Corrigir dados antigos de transações fixas pendentes para que o escopo funcione corretamente

-- 1) Garantir que transações "pai" de séries fixas estejam marcadas como is_fixed = true
UPDATE public.transactions p
SET is_fixed = true
WHERE COALESCE(p.is_fixed, false) = false
  AND p.is_recurring IS NOT TRUE
  AND EXISTS (
    SELECT 1 FROM public.transactions c
    WHERE c.parent_transaction_id = p.id
  );

-- 2) Garantir que todas as transações filhas de séries fixas também tenham is_fixed = true
UPDATE public.transactions t
SET is_fixed = true
FROM public.transactions parent
WHERE t.parent_transaction_id = parent.id
  AND parent.is_fixed = true
  AND parent.is_recurring IS NOT TRUE
  AND COALESCE(t.is_fixed, false) = false;