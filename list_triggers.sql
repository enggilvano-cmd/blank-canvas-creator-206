SELECT 
    event_object_table AS table_name, 
    trigger_name, 
    event_manipulation AS event, 
    action_statement AS definition
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
ORDER BY table_name, trigger_name;
