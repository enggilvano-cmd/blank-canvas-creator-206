import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.test("atomic-create-recurring: should create recurring transactions", async () => {
  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  assertExists(user, "User should be authenticated");

  // Create test account
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .insert({
      name: 'Test Recurring Account',
      type: 'checking',
      balance: 100000,
      user_id: user.id,
    })
    .select()
    .single();

  assertExists(account, "Account should be created");
  assertEquals(accountError, null, "No error creating account");

  // Create test category
  const { data: category } = await supabase
    .from('categories')
    .insert({
      name: 'Test Recurring Category',
      type: 'expense',
      user_id: user.id,
    })
    .select()
    .single();

  assertExists(category, "Category should be created");

  // Call edge function to create recurring transaction
  const { data, error } = await supabase.functions.invoke('atomic-create-recurring', {
    body: {
      transaction: {
        description: 'Monthly Subscription',
        amount: 5000, // R$ 50.00
        date: '2025-01-15',
        type: 'expense',
        category_id: category.id,
        account_id: account.id,
        status: 'pending',
        recurrence_type: 'monthly',
        recurrence_end_date: '2025-12-15',
      },
    },
  });

  assertEquals(error, null, "No error creating recurring transaction");
  assertExists(data, "Response data should exist");
  assertEquals(data.success, true, "Operation should be successful");
  assertExists(data.parent_id, "Parent transaction ID should be returned");

  // Verify transactions were created
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('parent_transaction_id', data.parent_id)
    .order('date');

  assertExists(transactions, "Child transactions should exist");
  assertEquals(transactions.length > 0, true, "Should have created child transactions");

  // Verify recurrence metadata
  assertEquals(transactions[0].is_recurring, true, "Should be marked as recurring");
  assertEquals(transactions[0].recurrence_type, 'monthly', "Should have correct recurrence type");

  // Cleanup
  await supabase.from('transactions').delete().eq('user_id', user.id);
  await supabase.from('categories').delete().eq('id', category.id);
  await supabase.from('accounts').delete().eq('id', account.id);
});

Deno.test("atomic-create-recurring: should enforce period locking", async () => {
  const { data: { user } } = await supabase.auth.getUser();
  assertExists(user, "User should be authenticated");

  // Create locked period
  await supabase.from('period_closures').insert({
    user_id: user.id,
    period_start: '2025-01-01',
    period_end: '2025-01-31',
    closure_type: 'monthly',
    closed_by: user.id,
    is_locked: true,
  });

  const { data: account } = await supabase
    .from('accounts')
    .insert({
      name: 'Test Account',
      type: 'checking',
      balance: 100000,
      user_id: user.id,
    })
    .select()
    .single();

  const { data: category } = await supabase
    .from('categories')
    .insert({
      name: 'Test Category',
      type: 'expense',
      user_id: user.id,
    })
    .select()
    .single();

  // Try to create recurring in locked period
  const { data, error } = await supabase.functions.invoke('atomic-create-recurring', {
    body: {
      transaction: {
        description: 'Test',
        amount: 5000,
        date: '2025-01-15', // In locked period
        type: 'expense',
        category_id: category.id,
        account_id: account.id,
        status: 'completed',
        recurrence_type: 'monthly',
      },
    },
  });

  assertExists(error || (data && !data.success), "Should reject locked period");

  // Cleanup
  await supabase.from('period_closures').delete().eq('user_id', user.id);
  await supabase.from('categories').delete().eq('id', category.id);
  await supabase.from('accounts').delete().eq('id', account.id);
});

Deno.test("atomic-create-recurring: should validate input data", async () => {
  // Missing required fields
  const { error: missingFieldsError } = await supabase.functions.invoke('atomic-create-recurring', {
    body: {
      transaction: {
        description: 'Test',
        // Missing amount, date, type, etc.
      },
    },
  });

  assertExists(missingFieldsError, "Should reject missing required fields");

  // Invalid recurrence type
  const { data: { user } } = await supabase.auth.getUser();
  const { data: account } = await supabase
    .from('accounts')
    .insert({
      name: 'Test Account',
      type: 'checking',
      balance: 100000,
      user_id: user!.id,
    })
    .select()
    .single();

  const { error: invalidTypeError } = await supabase.functions.invoke('atomic-create-recurring', {
    body: {
      transaction: {
        description: 'Test',
        amount: 5000,
        date: '2025-01-15',
        type: 'expense',
        account_id: account!.id,
        status: 'completed',
        recurrence_type: 'invalid_type', // Invalid
      },
    },
  });

  assertExists(invalidTypeError, "Should reject invalid recurrence type");

  // Cleanup
  await supabase.from('accounts').delete().eq('id', account!.id);
});
