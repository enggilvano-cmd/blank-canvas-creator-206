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

Deno.test('atomic-pay-bill: should create payment transaction and update balances', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    // Create checking account with balance
    const checkingAccount = await createTestAccount(userId, {
      name: 'Checking',
      type: 'checking',
      balance: 500000, // R$ 5,000.00
    });

    // Create credit card with debt
    const creditAccount = await createTestAccount(userId, {
      name: 'Credit Card',
      type: 'credit',
      balance: -200000, // -R$ 2,000.00 debt
      limit_amount: 500000,
    });

    const category = await createTestCategory(userId, {
      name: 'Credit Payment',
      type: 'expense',
    });

    const response = await invokeEdgeFunction('atomic-pay-bill', {
      fromAccountId: checkingAccount.id,
      toAccountId: creditAccount.id,
      amount: 100000, // R$ 1,000.00 payment
      date: '2025-01-15',
      description: 'Credit Card Payment',
      categoryId: category.id,
    }, userId);

    assertTrue(response.error === null, 'Should not have error');
    assertTrue(response.data?.success === true, 'Operation should succeed');

    // Verify checking account balance decreased
    const checkingBalance = await getAccountBalance(checkingAccount.id);
    assertEquals(checkingBalance, 400000, 'Checking balance should decrease by payment amount');

    // Verify credit card balance increased (debt reduced)
    const creditBalance = await getAccountBalance(creditAccount.id);
    assertEquals(creditBalance, -100000, 'Credit debt should decrease by payment amount');

    // Verify transactions were created
    const supabase = getSupabaseClient();
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId);

    assertEquals(transactions?.length, 2, 'Should create 2 transactions (expense + income)');

    console.log('[TEST PASSED] ✓ atomic-pay-bill test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});

Deno.test('atomic-pay-bill: should validate insufficient balance', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const checkingAccount = await createTestAccount(userId, {
      balance: 50000, // R$ 500.00
    });

    const creditAccount = await createTestAccount(userId, {
      type: 'credit',
      balance: -200000,
      limit_amount: 500000,
    });

    const category = await createTestCategory(userId);

    // Try to pay more than available balance
    const response = await invokeEdgeFunction('atomic-pay-bill', {
      fromAccountId: checkingAccount.id,
      toAccountId: creditAccount.id,
      amount: 100000, // R$ 1,000.00 (more than available)
      date: '2025-01-15',
      description: 'Payment',
      categoryId: category.id,
    }, userId);

    assertTrue(response.data?.success === false, 'Should fail for insufficient balance');
    assertTrue(
      response.data?.error_message?.includes('insufficient') ||
      response.data?.error_message?.includes('insuficiente'),
      'Error should mention insufficient balance'
    );

    console.log('[TEST PASSED] ✓ atomic-pay-bill validation test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});

Deno.test('atomic-pay-bill: should validate period locking', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const checkingAccount = await createTestAccount(userId, {
      balance: 500000,
    });

    const creditAccount = await createTestAccount(userId, {
      type: 'credit',
      balance: -200000,
      limit_amount: 500000,
    });

    const category = await createTestCategory(userId);

    // Create period closure
    const supabase = getSupabaseClient();
    await supabase.from('period_closures').insert({
      user_id: userId,
      period_start: '2025-01-01',
      period_end: '2025-01-31',
      closure_type: 'monthly',
      closed_by: userId,
      is_locked: true,
    });

    // Try to pay in locked period
    const response = await invokeEdgeFunction('atomic-pay-bill', {
      fromAccountId: checkingAccount.id,
      toAccountId: creditAccount.id,
      amount: 100000,
      date: '2025-01-15', // Locked period
      description: 'Payment',
      categoryId: category.id,
    }, userId);

    assertTrue(response.data?.success === false, 'Should fail for locked period');

    console.log('[TEST PASSED] ✓ atomic-pay-bill period locking test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});
