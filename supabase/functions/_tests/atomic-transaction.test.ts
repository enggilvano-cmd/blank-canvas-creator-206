import {
  createTestUser,
  createTestAccount,
  createTestCategory,
  cleanupTestUser,
  getAccountBalance,
  invokeEdgeFunction,
  assertEquals,
  assertTrue,
} from './setup.ts';

Deno.test('atomic-transaction: should create income transaction and update balance', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id, { type: 'income' });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transaction', {
      transaction: {
        description: 'Test Income',
        amount: 5000,
        date: new Date().toISOString().split('T')[0],
        type: 'income',
        category_id: category.id,
        account_id: account.id,
        status: 'completed',
      },
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const newBalance = await getAccountBalance(account.id);
    assertEquals(newBalance, 15000, 'Balance should increase by 5000');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transaction: should create expense transaction and update balance', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id, { type: 'expense' });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transaction', {
      transaction: {
        description: 'Test Expense',
        amount: 3000,
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        category_id: category.id,
        account_id: account.id,
        status: 'completed',
      },
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const newBalance = await getAccountBalance(account.id);
    assertEquals(newBalance, 7000, 'Balance should decrease by 3000');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transaction: should handle credit card transaction correctly', async () => {
  const user = await createTestUser();
  const creditAccount = await createTestAccount(user.id, {
    type: 'credit',
    balance: -5000,
    limit_amount: 10000,
  });
  const category = await createTestCategory(user.id, { type: 'expense' });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transaction', {
      transaction: {
        description: 'Credit Card Purchase',
        amount: 2000,
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        category_id: category.id,
        account_id: creditAccount.id,
        status: 'completed',
      },
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const newBalance = await getAccountBalance(creditAccount.id);
    assertEquals(newBalance, -7000, 'Credit balance should increase debt by 2000');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transaction: should fail with invalid account', async () => {
  const user = await createTestUser();
  const category = await createTestCategory(user.id);

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transaction', {
      transaction: {
        description: 'Invalid Account',
        amount: 1000,
        date: new Date().toISOString().split('T')[0],
        type: 'income',
        category_id: category.id,
        account_id: 'invalid-account-id',
        status: 'completed',
      },
    }, user.id);

    assertTrue(!!error, 'Should have error for invalid account');
    assertTrue(!data, 'Should not return data');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transaction: should handle negative amounts as expenses', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id, { type: 'expense' });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transaction', {
      transaction: {
        description: 'Negative Amount Test',
        amount: -2000,
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        category_id: category.id,
        account_id: account.id,
        status: 'completed',
      },
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const newBalance = await getAccountBalance(account.id);
    assertEquals(newBalance, 8000, 'Balance should decrease by 2000');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transaction: should fail without authentication', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id);
  const category = await createTestCategory(user.id);

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transaction', {
      transaction: {
        description: 'Unauthenticated',
        amount: 1000,
        date: new Date().toISOString().split('T')[0],
        type: 'income',
        category_id: category.id,
        account_id: account.id,
        status: 'completed',
      },
    }); // No userId

    assertTrue(!!error, 'Should have authentication error');
    assertTrue(!data, 'Should not return data');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transaction: race condition - concurrent transactions on same account', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });
  const category = await createTestCategory(user.id);

  try {
    // Create 5 concurrent transactions
    const promises = Array.from({ length: 5 }, (_, i) =>
      invokeEdgeFunction('atomic-transaction', {
        transaction: {
          description: `Concurrent Transaction ${i + 1}`,
          amount: 1000,
          date: new Date().toISOString().split('T')[0],
          type: 'income',
          category_id: category.id,
          account_id: account.id,
          status: 'completed',
        },
      }, user.id)
    );

    const results = await Promise.all(promises);

    // All should succeed
    results.forEach((result, i) => {
      assertTrue(!result.error, `Transaction ${i + 1} should not have error`);
      assertTrue(!!result.data, `Transaction ${i + 1} should return data`);
    });

    const finalBalance = await getAccountBalance(account.id);
    assertEquals(finalBalance, 15000, 'Balance should be exactly 15000 (10000 + 5*1000)');
  } finally {
    await cleanupTestUser(user.id);
  }
});
