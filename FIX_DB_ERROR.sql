-- Execute este comando no SQL Editor do seu Dashboard Supabase
-- Isso vai permitir que o banco de dados aceite o novo tipo de conta "meal_voucher"

ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'meal_voucher';

-- Execute este comando para adicionar a coluna de saldo inicial
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS initial_balance BIGINT DEFAULT 0;
