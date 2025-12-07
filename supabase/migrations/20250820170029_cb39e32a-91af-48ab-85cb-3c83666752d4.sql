-- Remove duplicate transfer transactions created with old logic
-- Delete expense transactions that are transfers (have description starting with "Transferência para:")
DELETE FROM transactions 
WHERE type = 'expense' 
AND description LIKE 'Transferência para:%';

-- Delete income transactions that are transfers (have description starting with "Transferência de:")
DELETE FROM transactions 
WHERE type = 'income' 
AND description LIKE 'Transferência de:%';