import {
  createTestUser,
  createTestAccount,
  cleanupTestUser,
  getAccountBalance,
  invokeEdgeFunction,
  assertEquals,
  assertTrue,
} from './setup.ts';

Deno.test('atomic-transfer: should transfer between checking accounts', async () => {
  const user = await createTestUser();
  const fromAccount = await createTestAccount(user.id, { name: 'From Account', balance: 10000 });
  const toAccount = await createTestAccount(user.id, { name: 'To Account', balance: 5000 });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transfer', {
      transfer: {
        from_account_id: fromAccount.id,
        to_account_id: toAccount.id,
        amount: 3000,
        date: new Date().toISOString().split('T')[0],
        description: 'Test Transfer',
      },
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const fromBalance = await getAccountBalance(fromAccount.id);
    const toBalance = await getAccountBalance(toAccount.id);

    assertEquals(fromBalance, 7000, 'From account should decrease by 3000');
    assertEquals(toBalance, 8000, 'To account should increase by 3000');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transfer: should fail if insufficient balance', async () => {
  const user = await createTestUser();
  const fromAccount = await createTestAccount(user.id, { balance: 1000 });
  const toAccount = await createTestAccount(user.id, { balance: 0 });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transfer', {
      transfer: {
        from_account_id: fromAccount.id,
        to_account_id: toAccount.id,
        amount: 5000,
        date: new Date().toISOString().split('T')[0],
        description: 'Overdraft Transfer',
      },
    }, user.id);

    assertTrue(!!error, 'Should have insufficient balance error');
    assertTrue(!data, 'Should not return data');

    // Balances should remain unchanged
    const fromBalance = await getAccountBalance(fromAccount.id);
    const toBalance = await getAccountBalance(toAccount.id);

    assertEquals(fromBalance, 1000, 'From balance should not change');
    assertEquals(toBalance, 0, 'To balance should not change');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transfer: should handle transfer to credit card', async () => {
  const user = await createTestUser();
  const checkingAccount = await createTestAccount(user.id, { type: 'checking', balance: 10000 });
  const creditAccount = await createTestAccount(user.id, {
    type: 'credit',
    balance: -5000,
    limit_amount: 10000,
  });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transfer', {
      transfer: {
        from_account_id: checkingAccount.id,
        to_account_id: creditAccount.id,
        amount: 2000,
        date: new Date().toISOString().split('T')[0],
        description: 'Credit Card Payment',
      },
    }, user.id);

    assertTrue(!error, 'Should not have error');
    assertTrue(!!data, 'Should return data');

    const checkingBalance = await getAccountBalance(checkingAccount.id);
    const creditBalance = await getAccountBalance(creditAccount.id);

    assertEquals(checkingBalance, 8000, 'Checking should decrease by 2000');
    assertEquals(creditBalance, -3000, 'Credit debt should decrease by 2000');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transfer: should fail with same from and to account', async () => {
  const user = await createTestUser();
  const account = await createTestAccount(user.id, { balance: 10000 });

  try {
    const { data, error } = await invokeEdgeFunction('atomic-transfer', {
      transfer: {
        from_account_id: account.id,
        to_account_id: account.id,
        amount: 1000,
        date: new Date().toISOString().split('T')[0],
        description: 'Self Transfer',
      },
    }, user.id);

    assertTrue(!!error, 'Should have error for same account transfer');
    assertTrue(!data, 'Should not return data');

    const balance = await getAccountBalance(account.id);
    assertEquals(balance, 10000, 'Balance should not change');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transfer: race condition - concurrent transfers from same account', async () => {
  const user = await createTestUser();
  const fromAccount = await createTestAccount(user.id, { balance: 10000 });
  const toAccount1 = await createTestAccount(user.id, { name: 'To 1', balance: 0 });
  const toAccount2 = await createTestAccount(user.id, { name: 'To 2', balance: 0 });
  const toAccount3 = await createTestAccount(user.id, { name: 'To 3', balance: 0 });

  try {
    // Create 3 concurrent transfers, total 9000 (should succeed as source has 10000)
    const promises = [
      invokeEdgeFunction('atomic-transfer', {
        transfer: {
          from_account_id: fromAccount.id,
          to_account_id: toAccount1.id,
          amount: 3000,
          date: new Date().toISOString().split('T')[0],
          description: 'Transfer 1',
        },
      }, user.id),
      invokeEdgeFunction('atomic-transfer', {
        transfer: {
          from_account_id: fromAccount.id,
          to_account_id: toAccount2.id,
          amount: 3000,
          date: new Date().toISOString().split('T')[0],
          description: 'Transfer 2',
        },
      }, user.id),
      invokeEdgeFunction('atomic-transfer', {
        transfer: {
          from_account_id: fromAccount.id,
          to_account_id: toAccount3.id,
          amount: 3000,
          date: new Date().toISOString().split('T')[0],
          description: 'Transfer 3',
        },
      }, user.id),
    ];

    const results = await Promise.all(promises);

    // All should succeed
    results.forEach((result, i) => {
      assertTrue(!result.error, `Transfer ${i + 1} should not have error`);
      assertTrue(!!result.data, `Transfer ${i + 1} should return data`);
    });

    const fromBalance = await getAccountBalance(fromAccount.id);
    const to1Balance = await getAccountBalance(toAccount1.id);
    const to2Balance = await getAccountBalance(toAccount2.id);
    const to3Balance = await getAccountBalance(toAccount3.id);

    assertEquals(fromBalance, 1000, 'From account should have 1000 left');
    assertEquals(to1Balance, 3000, 'To account 1 should have 3000');
    assertEquals(to2Balance, 3000, 'To account 2 should have 3000');
    assertEquals(to3Balance, 3000, 'To account 3 should have 3000');
  } finally {
    await cleanupTestUser(user.id);
  }
});

Deno.test('atomic-transfer: should rollback on database error', async () => {
  const user = await createTestUser();
  const fromAccount = await createTestAccount(user.id, { balance: 10000 });

  try {
    // Try to transfer to non-existent account
    const { data, error } = await invokeEdgeFunction('atomic-transfer', {
      transfer: {
        from_account_id: fromAccount.id,
        to_account_id: 'non-existent-id',
        amount: 5000,
        date: new Date().toISOString().split('T')[0],
        description: 'Invalid Transfer',
      },
    }, user.id);

    assertTrue(!!error, 'Should have error');
    assertTrue(!data, 'Should not return data');

    // From account balance should remain unchanged
    const fromBalance = await getAccountBalance(fromAccount.id);
    assertEquals(fromBalance, 10000, 'From balance should not change on rollback');
  } finally {
    await cleanupTestUser(user.id);
  }
});
