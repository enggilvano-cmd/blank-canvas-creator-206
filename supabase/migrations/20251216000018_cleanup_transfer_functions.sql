-- Nuclear option: Drop ALL variations of atomic_create_transfer to resolve ambiguity
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure as func_signature
             FROM pg_proc
             WHERE proname = 'atomic_create_transfer'
             AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.func_signature || ' CASCADE';
    END LOOP;
END $$;
