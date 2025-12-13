import {
  createTestUser,
  createTestAccount,
  createTestCategory,
  cleanupTestUser,
  invokeEdgeFunction,
  getAccountBalance,
  assertEquals,
  assertTrue,
  getSupabaseClient,
} from './setup.ts';

Deno.test('atomic-create-fixed: should create parent and 11 child fixed transactions', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const account = await createTestAccount(userId, {
      name: 'Checking Account',
      type: 'checking',
      balance: 0,
    });

    const category = await createTestCategory(userId, {
      name: 'Salary',
      type: 'income',
    });

    const response = await invokeEdgeFunction('atomic-create-fixed', {
      accountId: account.id,
      amount: 500000, // R$ 5,000.00
      categoryId: category.id,
      date: '2025-01-15',
      description: 'Monthly Salary',
      status: 'pending',
      type: 'income',
    }, userId);

    assertTrue(response.error === null, 'Should not have error');
    assertTrue(response.data?.success === true, 'Operation should succeed');
    assertTrue(response.data?.created_count === 12, 'Should create 12 transactions (parent + 11 children)');
    
    const parentId = response.data?.parent_id;
    assertTrue(!!parentId, 'Should return parent transaction ID');

    // Verify transactions were created
    const supabase = getSupabaseClient();
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    assertEquals(transactions?.length, 12, 'Should have 12 transactions in database');
    
    // Verify parent transaction
    const parent = transactions?.find(t => t.id === parentId);
    assertTrue(!!parent, 'Parent transaction should exist');
    assertEquals(parent?.is_fixed, true, 'Parent should be marked as fixed');
    assertEquals(parent?.parent_transaction_id, null, 'Parent should not have parent_transaction_id');
    
    // Verify child transactions
    const children = transactions?.filter(t => t.parent_transaction_id === parentId);
    assertEquals(children?.length, 11, 'Should have 11 child transactions');
    
    // Verify first child is for next month
    const firstChild = children?.[0];
    assertEquals(firstChild?.date, '2025-02-15', 'First child should be for February');
    
    // Account balance should remain 0 (all pending)
    const finalBalance = await getAccountBalance(account.id);
    assertEquals(finalBalance, 0, 'Balance should remain 0 for pending transactions');

    console.log('[TEST PASSED] ✓ atomic-create-fixed test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});

Deno.test('atomic-create-fixed: should validate period locking', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const account = await createTestAccount(userId);
    const category = await createTestCategory(userId);

    // Create a period closure for January 2025
    const supabase = getSupabaseClient();
    await supabase.from('period_closures').insert({
      user_id: userId,
      period_start: '2025-01-01',
      period_end: '2025-01-31',
      closure_type: 'monthly',
      closed_by: userId,
      is_locked: true,
    });

    // Try to create fixed transaction starting in locked period
    const response = await invokeEdgeFunction('atomic-create-fixed', {
      accountId: account.id,
      amount: 100000,
      categoryId: category.id,
      date: '2025-01-15', // Locked period
      description: 'Test Fixed',
      status: 'completed',
      type: 'expense',
    }, userId);

    assertTrue(response.data?.success === false, 'Should fail for locked period');
    assertTrue(
      response.data?.error_message?.includes('locked') || 
      response.data?.error_message?.includes('período fechado'),
      'Error should mention locked period'
    );

    console.log('[TEST PASSED] ✓ atomic-create-fixed period locking test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});

Deno.test('atomic-create-fixed: should update account balance for completed transactions', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const account = await createTestAccount(userId, {
      balance: 100000, // R$ 1,000.00
    });

    const category = await createTestCategory(userId);

    const response = await invokeEdgeFunction('atomic-create-fixed', {
      accountId: account.id,
      amount: 50000, // R$ 500.00
      categoryId: category.id,
      date: '2025-01-15',
      description: 'Fixed Expense',
      status: 'completed',
      type: 'expense',
    }, userId);

    assertTrue(response.error === null, 'Should not have error');
    assertTrue(response.data?.success === true, 'Operation should succeed');

    // Only first transaction should affect balance (status: completed)
    const finalBalance = await getAccountBalance(account.id);
    assertEquals(finalBalance, 50000, 'Balance should be reduced by first transaction amount');

    console.log('[TEST PASSED] ✓ atomic-create-fixed balance update test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});
