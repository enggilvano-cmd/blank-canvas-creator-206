import {
  createTestUser,
  createTestAccount,
  createTestCategory,
  cleanupTestUser,
  invokeEdgeFunction,
  assertEquals,
  assertTrue,
  getSupabaseClient,
} from './setup.ts';

Deno.test('generate-fixed-transactions-yearly: should generate fixed transactions for new year', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const account = await createTestAccount(userId);
    const category = await createTestCategory(userId);

    const supabase = getSupabaseClient();

    // Create parent fixed transaction from last year
    const lastYear = new Date().getFullYear() - 1;
    const { data: parent } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        account_id: account.id,
        category_id: category.id,
        amount: 200000,
        date: `${lastYear}-01-10`,
        description: 'Fixed Expense',
        type: 'expense',
        status: 'completed',
        is_fixed: true,
      })
      .select()
      .single();

    assertTrue(!!parent, 'Parent transaction should be created');

    // Create 11 child transactions for last year
    const childPromises = [];
    for (let i = 1; i <= 11; i++) {
      const month = i + 1;
      childPromises.push(
        supabase.from('transactions').insert({
          user_id: userId,
          account_id: account.id,
          category_id: category.id,
          amount: 200000,
          date: `${lastYear}-${String(month).padStart(2, '0')}-10`,
          description: 'Fixed Expense',
          type: 'expense',
          status: 'pending',
          is_fixed: true,
          parent_transaction_id: parent.id,
        })
      );
    }
    await Promise.all(childPromises);

    // Invoke generate function
    const response = await invokeEdgeFunction('generate-fixed-transactions-yearly', {}, userId);

    assertTrue(response.error === null, 'Should not have error');

    // Verify new transactions were created for current year
    const currentYear = new Date().getFullYear();
    const { data: newTransactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_fixed', true)
      .gte('date', `${currentYear}-01-01`)
      .lte('date', `${currentYear}-12-31`);

    assertTrue(
      (newTransactions?.length ?? 0) >= 12,
      'Should generate 12 transactions for current year'
    );

    console.log('✓ generate-fixed-transactions-yearly test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});

Deno.test('generate-fixed-transactions-yearly: should not duplicate existing transactions', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const account = await createTestAccount(userId);
    const category = await createTestCategory(userId);

    const supabase = getSupabaseClient();

    const currentYear = new Date().getFullYear();

    // Create parent fixed transaction for current year
    const { data: parent } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        account_id: account.id,
        category_id: category.id,
        amount: 150000,
        date: `${currentYear}-01-05`,
        description: 'Fixed Income',
        type: 'income',
        status: 'completed',
        is_fixed: true,
      })
      .select()
      .single();

    assertTrue(!!parent, 'Parent should be created');

    // Invoke generate function (should not create duplicates)
    await invokeEdgeFunction('generate-fixed-transactions-yearly', {}, userId);

    // Count transactions for this year
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_fixed', true)
      .gte('date', `${currentYear}-01-01`)
      .lte('date', `${currentYear}-12-31`);

    // Should only have the parent transaction, no duplicates
    assertEquals(transactions?.length, 1, 'Should not create duplicate transactions');

    console.log('✓ generate-fixed-transactions-yearly duplicate prevention test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});

Deno.test('generate-fixed-transactions-yearly: should handle multiple parent transactions', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const account = await createTestAccount(userId);
    const category1 = await createTestCategory(userId, { name: 'Category 1' });
    const category2 = await createTestCategory(userId, { name: 'Category 2' });

    const supabase = getSupabaseClient();

    const lastYear = new Date().getFullYear() - 1;

    // Create two parent fixed transactions from last year
    await supabase.from('transactions').insert([
      {
        user_id: userId,
        account_id: account.id,
        category_id: category1.id,
        amount: 100000,
        date: `${lastYear}-01-10`,
        description: 'Fixed 1',
        type: 'expense',
        status: 'completed',
        is_fixed: true,
      },
      {
        user_id: userId,
        account_id: account.id,
        category_id: category2.id,
        amount: 200000,
        date: `${lastYear}-02-15`,
        description: 'Fixed 2',
        type: 'income',
        status: 'completed',
        is_fixed: true,
      },
    ]);

    // Invoke generate function
    await invokeEdgeFunction('generate-fixed-transactions-yearly', {}, userId);

    const currentYear = new Date().getFullYear();
    const { data: newTransactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_fixed', true)
      .gte('date', `${currentYear}-01-01`);

    // Should generate transactions for both parents
    assertTrue(
      (newTransactions?.length ?? 0) >= 2,
      'Should generate transactions for multiple parents'
    );

    console.log('✓ generate-fixed-transactions-yearly multiple parents test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});
