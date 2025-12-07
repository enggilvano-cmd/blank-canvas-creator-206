import {
  createTestUser,
  createTestAccount,
  createTestCategory,
  createTestTransaction,
  cleanupTestUser,
  getAccountBalance,
  invokeEdgeFunction,
  assertEquals,
  assertTrue,
  getSupabaseClient,
} from './setup.ts';

Deno.test('atomic-edit-transaction: should edit transaction amount', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id);
  
  // Manually update account balance after transaction
  const supabase = getSupabaseClient();
  await supabase
    .from('accounts')
    .update({ balance: 15000 })
    .eq('id', account.id);

  const transaction = await createTestTransaction(user.id, account.id, {
    type: 'income',
    amount: 5000,
    category_id: category.id,
  });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-edit-transaction', {
      transaction_id: transaction.id,
      updates: {
        amount: 7000,
        description: transaction.description,
        date: transaction.date,
        type: transaction.type,
        category_id: transaction.category_id,
        account_id: transaction.account_id,
        status: transaction.status,
      },
      scope: 'current',
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const newBalance = await getAccountBalance(account.id);
    assertEquals(newBalance, 17000, 'Balance should reflect new amount (10000 + 7000)');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-edit-transaction: should change transaction type', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id, { type: 'both' });
  
  const supabase = getSupabaseClient();
  await supabase
    .from('accounts')
    .update({ balance: 15000 })
    .eq('id', account.id);

  const transaction = await createTestTransaction(user.id, account.id, {
    type: 'income',
    amount: 5000,
    category_id: category.id,
  });

  try {
    // Change from income to expense
    const { data, error } = await invokeEdgeFunction('atomic-edit-transaction', {
      transaction_id: transaction.id,
      updates: {
        amount: 5000,
        description: transaction.description,
        date: transaction.date,
        type: 'expense',
        category_id: transaction.category_id,
        account_id: transaction.account_id,
        status: transaction.status,
      },
      scope: 'current',
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const newBalance = await getAccountBalance(account.id);
    assertEquals(newBalance, 5000, 'Balance should change from +5000 to -5000 (10000 - 5000)');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-edit-transaction: should move transaction between accounts', async () => {
  const user = await createTestUser();
  const account1 = await createTestAccount(user.id, { name: 'Account 1', balance: 10000 });
  const account2 = await createTestAccount(user.id, { name: 'Account 2', balance: 5000 });
  const category = await createTestCategory(user.id);
  
  const supabase = getSupabaseClient();
  await supabase
    .from('accounts')
    .update({ balance: 12000 })
    .eq('id', account1.id);

  const transaction = await createTestTransaction(user.id, account1.id, {
    type: 'income',
    amount: 2000,
    category_id: category.id,
  });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-edit-transaction', {
      transaction_id: transaction.id,
      updates: {
        amount: 2000,
        description: transaction.description,
        date: transaction.date,
        type: transaction.type,
        category_id: transaction.category_id,
        account_id: account2.id,
        status: transaction.status,
      },
      scope: 'current',
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const balance1 = await getAccountBalance(account1.id);
    const balance2 = await getAccountBalance(account2.id);

    assertEquals(balance1, 10000, 'Account 1 should revert to original balance');
    assertEquals(balance2, 7000, 'Account 2 should gain the transaction (5000 + 2000)');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-edit-transaction: should fail with invalid transaction id', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id);
  const category = await createTestCategory(user.id);

  try {
    const { data, error } = await invokeEdgeFunction('atomic-edit-transaction', {
      transaction_id: 'non-existent-id',
      updates: {
        amount: 1000,
        description: 'Test',
        date: new Date().toISOString().split('T')[0],
        type: 'income',
        category_id: category.id,
        account_id: account.id,
        status: 'completed',
      },
      scope: 'current',
    }, user.id);

    assertTrue(!!error, 'Should have error for invalid transaction');
    assertTrue(!data, 'Should not return data');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-edit-transaction: should maintain balance consistency on concurrent edits', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id);
  
  const supabase = getSupabaseClient();
  await supabase
    .from('accounts')
    .update({ balance: 15000 })
    .eq('id', account.id);

  const transaction1 = await createTestTransaction(user.id, account.id, {
    type: 'income',
    amount: 2000,
    category_id: category.id,
    description: 'Trans 1',
  });

  await supabase
    .from('accounts')
    .update({ balance: 17000 })
    .eq('id', account.id);

  const transaction2 = await createTestTransaction(user.id, account.id, {
    type: 'income',
    amount: 2000,
    category_id: category.id,
    description: 'Trans 2',
  });

  try {
    // Edit both transactions concurrently
    const promises = [
      invokeEdgeFunction('atomic-edit-transaction', {
        transaction_id: transaction1.id,
        updates: {
          amount: 3000,
          description: 'Trans 1',
          date: transaction1.date,
          type: transaction1.type,
          category_id: transaction1.category_id,
          account_id: transaction1.account_id,
          status: transaction1.status,
        },
        scope: 'current',
      }, user.id),
      invokeEdgeFunction('atomic-edit-transaction', {
        transaction_id: transaction2.id,
        updates: {
          amount: 3000,
          description: 'Trans 2',
          date: transaction2.date,
          type: transaction2.type,
          category_id: transaction2.category_id,
          account_id: transaction2.account_id,
          status: transaction2.status,
        },
        scope: 'current',
      }, user.id),
    ];

    const results = await Promise.all(promises);

    results.forEach((result, i) => {
      assertTrue(!result.error, `Edit ${i + 1} should not have error`);
      assertTrue(!!result.data, `Edit ${i + 1} should return data`);
    });

    const finalBalance = await getAccountBalance(account.id);
    assertEquals(finalBalance, 16000, 'Balance should be 10000 + 3000 + 3000');
  } finally {
    await cleanupTestUser(user.id);
  }
});
