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

Deno.test('atomic-delete-transaction: should delete transaction and update balance', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id);
  
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
    const { data, error } = await invokeEdgeFunction('atomic-delete-transaction', {
      transaction_id: transaction.id,
      scope: 'current',
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');
    assertEquals(data.deleted, 1, 'Should delete 1 transaction');

    const newBalance = await getAccountBalance(account.id);
    assertEquals(newBalance, 10000, 'Balance should revert to original (15000 - 5000)');

    // Verify transaction is deleted
    const { data: transData } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', transaction.id)
      .maybeSingle();

    assertEquals(transData, null, 'Transaction should be deleted from database');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-delete-transaction: should delete expense and restore balance', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id);
  
  const supabase = getSupabaseClient();
  await supabase
    .from('accounts')
    .update({ balance: 7000 })
    .eq('id', account.id);

  const transaction = await createTestTransaction(user.id, account.id, {
    type: 'expense',
    amount: -3000,
    category_id: category.id,
  });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-delete-transaction', {
      transaction_id: transaction.id,
      scope: 'current',
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const newBalance = await getAccountBalance(account.id);
    assertEquals(newBalance, 10000, 'Balance should restore (7000 + 3000)');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-delete-transaction: should fail with invalid transaction id', async () => {
  const user = await createTestUser();

  try {
    const { data, error } = await invokeEdgeFunction('atomic-delete-transaction', {
      transaction_id: 'non-existent-id',
      scope: 'current',
    }, user.id);

    assertTrue(!!error, 'Should have error for invalid transaction');
    assertTrue(!data, 'Should not return data');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-delete-transaction: should handle credit card transaction deletion', async () => {
  const user = await createTestUser();
  const creditAccount = await createTestAccount(user.id, {
    type: 'credit',
    balance: -5000,
    limit_amount: 10000,
  });
  const category = await createTestCategory(user.id);
  
  const supabase = getSupabaseClient();
  await supabase
    .from('accounts')
    .update({ balance: -7000 })
    .eq('id', creditAccount.id);

  const transaction = await createTestTransaction(user.id, creditAccount.id, {
    type: 'expense',
    amount: -2000,
    category_id: category.id,
  });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-delete-transaction', {
      transaction_id: transaction.id,
      scope: 'current',
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const newBalance = await getAccountBalance(creditAccount.id);
    assertEquals(newBalance, -5000, 'Credit balance should reduce debt (-7000 + 2000)');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-delete-transaction: concurrent deletions should maintain balance consistency', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id);
  
  const supabase = getSupabaseClient();
  
  // Create 3 transactions
  await supabase.from('accounts').update({ balance: 12000 }).eq('id', account.id);
  const transaction1 = await createTestTransaction(user.id, account.id, {
    type: 'income',
    amount: 2000,
    category_id: category.id,
    description: 'Trans 1',
  });

  await supabase.from('accounts').update({ balance: 14000 }).eq('id', account.id);
  const transaction2 = await createTestTransaction(user.id, account.id, {
    type: 'income',
    amount: 2000,
    category_id: category.id,
    description: 'Trans 2',
  });

  await supabase.from('accounts').update({ balance: 16000 }).eq('id', account.id);
  const transaction3 = await createTestTransaction(user.id, account.id, {
    type: 'income',
    amount: 2000,
    category_id: category.id,
    description: 'Trans 3',
  });

  try {
    // Delete all 3 concurrently
    const promises = [
      invokeEdgeFunction('atomic-delete-transaction', {
        transaction_id: transaction1.id,
        scope: 'current',
      }, user.id),
      invokeEdgeFunction('atomic-delete-transaction', {
        transaction_id: transaction2.id,
        scope: 'current',
      }, user.id),
      invokeEdgeFunction('atomic-delete-transaction', {
        transaction_id: transaction3.id,
        scope: 'current',
      }, user.id),
    ];

    const results = await Promise.all(promises);

    results.forEach((result, i) => {
      assertTrue(!result.error, `Delete ${i + 1} should not have error`);
      assertTrue(!!result.data, `Delete ${i + 1} should return data`);
    });

    const finalBalance = await getAccountBalance(account.id);
    assertEquals(finalBalance, 10000, 'Balance should revert to original (16000 - 6000)');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-delete-transaction: should prevent unauthorized deletion', async () => {
  const user1 = await createTestUser();
  const user2 = await createTestUser();
  const account = await createTestAccount(user1.id, { balance: 10000 });
  const category = await createTestCategory(user1.id);
  
  const supabase = getSupabaseClient();
  await supabase.from('accounts').update({ balance: 15000 }).eq('id', account.id);

  const transaction = await createTestTransaction(user1.id, account.id, {
    type: 'income',
    amount: 5000,
    category_id: category.id,
  });

  try {
    // Try to delete user1's transaction as user2
    const { data, error } = await invokeEdgeFunction('atomic-delete-transaction', {
      transaction_id: transaction.id,
      scope: 'current',
    }, user2.id);

    assertTrue(!!error, 'Should have authorization error');
    assertTrue(!data, 'Should not return data');

    // Verify transaction still exists and balance unchanged
    const { data: transData } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', transaction.id)
      .single();

    assertTrue(!!transData, 'Transaction should still exist');

    const balance = await getAccountBalance(account.id);
    assertEquals(balance, 15000, 'Balance should not change');
  } finally {
    await cleanupTestUser(user1.id);
    await cleanupTestUser(user2.id);
  }
});
