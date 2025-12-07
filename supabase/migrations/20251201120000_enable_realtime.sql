-- Enable realtime for critical tables
alter publication supabase_realtime add table transactions;
alter publication supabase_realtime add table accounts;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table fixed_transactions;
