import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.test("renew-fixed-transactions: should renew fixed transactions for new year", async () => {
  // Create test user (using service role)
  const { data: testUser, error: userError } = await supabase.auth.admin.createUser({
    email: `test-${Date.now()}@example.com`,
    password: 'test-password-123',
    email_confirm: true,
  });

  assertExists(testUser.user, "Test user should be created");
  assertEquals(userError, null, "No error creating user");

  const userId = testUser.user.id;

  // Create test account
  const { data: account } = await supabase
    .from('accounts')
    .insert({
      name: 'Test Fixed Account',
      type: 'checking',
      balance: 100000,
      user_id: userId,
    })
    .select()
    .single();

  assertExists(account, "Account should be created");

  // Create test category
  const { data: category } = await supabase
    .from('categories')
    .insert({
      name: 'Test Fixed Category',
      type: 'expense',
      user_id: userId,
    })
    .select()
    .single();

  // Create parent fixed transaction
  const { data: parentTx } = await supabase
    .from('transactions')
    .insert({
      description: 'Monthly Rent',
      amount: 150000,
      date: '2024-01-01',
      type: 'expense',
      category_id: category.id,
      account_id: account.id,
      status: 'completed',
      is_fixed: true,
      user_id: userId,
    })
    .select()
    .single();

  // Create child transactions for 2024
  const childTransactions = [];
  for (let month = 1; month <= 12; month++) {
    const { data: child } = await supabase
      .from('transactions')
      .insert({
        description: `Monthly Rent ${month}/12`,
        amount: 150000,
        date: `2024-${String(month).padStart(2, '0')}-01`,
        type: 'expense',
        category_id: category.id,
        account_id: account.id,
        status: month === 1 ? 'completed' : 'pending',
        is_fixed: true,
        parent_transaction_id: parentTx.id,
        user_id: userId,
      })
      .select()
      .single();
    childTransactions.push(child);
  }

  // Call renew function
  const { data, error } = await supabase.functions.invoke('renew-fixed-transactions', {
    body: {},
  });

  assertEquals(error, null, "No error renewing transactions");
  assertExists(data, "Response should exist");

  // Verify new transactions for 2025 were created
  const { data: newTransactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', '2025-01-01')
    .lt('date', '2026-01-01')
    .order('date');

  assertExists(newTransactions, "New transactions should be created");
  assertEquals(newTransactions.length, 12, "Should create 12 months of transactions");

  // Verify all are pending except first
  const completedCount = newTransactions.filter(tx => tx.status === 'completed').length;
  const pendingCount = newTransactions.filter(tx => tx.status === 'pending').length;
  
  assertEquals(completedCount, 0, "First transaction should start as pending for new year");
  assertEquals(pendingCount, 12, "All new transactions should be pending");

  // Verify parent_transaction_id is set correctly
  newTransactions.forEach(tx => {
    assertExists(tx.parent_transaction_id, "Each should have parent_transaction_id");
  });

  // Cleanup
  await supabase.from('transactions').delete().eq('user_id', userId);
  await supabase.from('categories').delete().eq('id', category.id);
  await supabase.from('accounts').delete().eq('id', account.id);
  await supabase.auth.admin.deleteUser(userId);
});

Deno.test("renew-fixed-transactions: should not duplicate renewals", async () => {
  const { data: testUser } = await supabase.auth.admin.createUser({
    email: `test-dup-${Date.now()}@example.com`,
    password: 'test-password-123',
    email_confirm: true,
  });

  const userId = testUser.user!.id;

  const { data: account } = await supabase
    .from('accounts')
    .insert({
      name: 'Test Account',
      type: 'checking',
      balance: 100000,
      user_id: userId,
    })
    .select()
    .single();

  const { data: category } = await supabase
    .from('categories')
    .insert({
      name: 'Test Category',
      type: 'expense',
      user_id: userId,
    })
    .select()
    .single();

  // Create parent and children for current year
  const { data: parentTx } = await supabase
    .from('transactions')
    .insert({
      description: 'Test Fixed',
      amount: 10000,
      date: `${new Date().getFullYear()}-01-01`,
      type: 'expense',
      category_id: category.id,
      account_id: account.id,
      status: 'completed',
      is_fixed: true,
      user_id: userId,
    })
    .select()
    .single();

  // Create some children
  await supabase.from('transactions').insert([
    {
      description: 'Test Fixed 1/12',
      amount: 10000,
      date: `${new Date().getFullYear()}-01-01`,
      type: 'expense',
      category_id: category.id,
      account_id: account.id,
      status: 'completed',
      is_fixed: true,
      parent_transaction_id: parentTx.id,
      user_id: userId,
    },
  ]);

  // Call renew twice
  await supabase.functions.invoke('renew-fixed-transactions', { body: {} });
  await supabase.functions.invoke('renew-fixed-transactions', { body: {} });

  // Count transactions for next year
  const nextYear = new Date().getFullYear() + 1;
  const { data: nextYearTxs, count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .gte('date', `${nextYear}-01-01`)
    .lt('date', `${nextYear + 1}-01-01`);

  // Should have exactly 12 transactions (no duplicates)
  assertEquals(count, 12, "Should not create duplicate renewals");

  // Cleanup
  await supabase.from('transactions').delete().eq('user_id', userId);
  await supabase.from('categories').delete().eq('id', category.id);
  await supabase.from('accounts').delete().eq('id', account.id);
  await supabase.auth.admin.deleteUser(userId);
});
