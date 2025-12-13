import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export interface TestAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment';
  balance: number;
  user_id: string;
  color: string;
  limit_amount?: number;
}

export interface TestCategory {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  user_id: string;
  color: string;
}

export interface TestTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: 'income' | 'expense' | 'transfer';
  category_id: string | null;
  account_id: string;
  status: 'pending' | 'completed';
  user_id: string;
}

// Test environment setup
export const getSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

// Create test user
export const createTestUser = async (): Promise<TestUser> => {
  const supabase = getSupabaseClient();
  const email = `test-${Date.now()}@example.com`;
  // ✅ SEGURANÇA: Usar variável de ambiente ao invés de senha hardcoded
  const password = Deno.env.get('TEST_USER_PASSWORD') || `Test-${crypto.randomUUID().slice(0, 8)}!`;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    throw new Error(`Failed to create test user: ${authError?.message}`);
  }

  return {
    id: authData.user.id,
    email,
    password,
  };
};

// Create test account
export const createTestAccount = async (
  userId: string,
  overrides?: Partial<TestAccount>
): Promise<TestAccount> => {
  const supabase = getSupabaseClient();

  const accountData = {
    name: overrides?.name ?? 'Test Account',
    type: overrides?.type ?? 'checking',
    balance: overrides?.balance ?? 0,
    color: overrides?.color ?? '#3b82f6',
    user_id: userId,
    limit_amount: overrides?.limit_amount,
  };

  const { data, error } = await supabase
    .from('accounts')
    .insert(accountData)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create test account: ${error?.message}`);
  }

  return data as TestAccount;
};

// Create test category
export const createTestCategory = async (
  userId: string,
  overrides?: Partial<TestCategory>
): Promise<TestCategory> => {
  const supabase = getSupabaseClient();

  const categoryData = {
    name: overrides?.name ?? 'Test Category',
    type: overrides?.type ?? 'expense',
    color: overrides?.color ?? '#ef4444',
    user_id: userId,
  };

  const { data, error } = await supabase
    .from('categories')
    .insert(categoryData)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create test category: ${error?.message}`);
  }

  return data as TestCategory;
};

// Create test transaction (direct DB insert, not through edge function)
export const createTestTransaction = async (
  userId: string,
  accountId: string,
  overrides?: Partial<TestTransaction>
): Promise<TestTransaction> => {
  const supabase = getSupabaseClient();

  const transactionData = {
    description: overrides?.description ?? 'Test Transaction',
    amount: overrides?.amount ?? 10000,
    date: overrides?.date ?? new Date().toISOString().split('T')[0],
    type: overrides?.type ?? 'income',
    category_id: overrides?.category_id ?? null,
    account_id: accountId,
    status: overrides?.status ?? 'completed',
    user_id: userId,
  };

  const { data, error } = await supabase
    .from('transactions')
    .insert(transactionData)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create test transaction: ${error?.message}`);
  }

  return data as TestTransaction;
};

// Get account balance
export const getAccountBalance = async (accountId: string): Promise<number> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('accounts')
    .select('balance')
    .eq('id', accountId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to get account balance: ${error?.message}`);
  }

  return data.balance;
};

// Cleanup test data
export const cleanupTestUser = async (userId: string): Promise<void> => {
  const supabase = getSupabaseClient();

  // Delete in correct order due to foreign key constraints
  await supabase.from('transactions').delete().eq('user_id', userId);
  await supabase.from('categories').delete().eq('user_id', userId);
  await supabase.from('accounts').delete().eq('user_id', userId);
  await supabase.auth.admin.deleteUser(userId);
};

// Helper to invoke edge function
export const invokeEdgeFunction = async <T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  userId?: string
): Promise<{ data: T | null; error: unknown }> => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey,
  };

  // If userId provided, create auth token
  if (userId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: `test-${userId}@example.com`,
    });

    if (!error && data?.properties) {
      // Use the generated link properties to create authorization
      // Note: In a real test scenario, you would use a service role key or proper test token
      headers['Authorization'] = `Bearer ${supabaseAnonKey}`;
    }
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: data };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

// Assert helpers
export const assertEquals = (actual: unknown, expected: unknown, message?: string) => {
  if (actual !== expected) {
    throw new Error(
      message ?? `Expected ${expected} but got ${actual}`
    );
  }
};

export const assertNotEquals = (actual: unknown, expected: unknown, message?: string) => {
  if (actual === expected) {
    throw new Error(
      message ?? `Expected not to equal ${expected}`
    );
  }
};

export const assertTrue = (condition: boolean, message?: string) => {
  if (!condition) {
    throw new Error(message ?? 'Assertion failed: expected true');
  }
};

export const assertFalse = (condition: boolean, message?: string) => {
  if (condition) {
    throw new Error(message ?? 'Assertion failed: expected false');
  }
};
