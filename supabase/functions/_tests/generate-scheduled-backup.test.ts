import {
  createTestUser,
  cleanupTestUser,
  invokeEdgeFunction,
  assertTrue,
  getSupabaseClient,
} from './setup.ts';

Deno.test('generate-scheduled-backup: should create backup for users with active schedules', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const supabase = getSupabaseClient();

    // Create backup schedule for user
    const nextBackup = new Date();
    nextBackup.setHours(nextBackup.getHours() - 1); // Set to past to trigger backup

    await supabase.from('backup_schedules').insert({
      user_id: userId,
      frequency: 'daily',
      is_active: true,
      next_backup_at: nextBackup.toISOString(),
    });

    // Invoke backup generation
    const response = await invokeEdgeFunction('generate-scheduled-backup', {}, userId);

    assertTrue(response.error === null, 'Should not have error');

    // Verify backup history was created
    const { data: backups } = await supabase
      .from('backup_history')
      .select('*')
      .eq('user_id', userId);

    assertTrue((backups?.length ?? 0) > 0, 'Should create backup history entry');

    // Verify schedule was updated
    const { data: schedule } = await supabase
      .from('backup_schedules')
      .select('*')
      .eq('user_id', userId)
      .single();

    assertTrue(!!schedule?.last_backup_at, 'Should update last_backup_at');
    assertTrue(!!schedule?.next_backup_at, 'Should update next_backup_at');

    console.log('[TEST PASSED] ✓ generate-scheduled-backup test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});

Deno.test('generate-scheduled-backup: should skip inactive schedules', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const supabase = getSupabaseClient();

    // Create inactive backup schedule
    await supabase.from('backup_schedules').insert({
      user_id: userId,
      frequency: 'daily',
      is_active: false, // Inactive
      next_backup_at: new Date().toISOString(),
    });

    // Invoke backup generation
    await invokeEdgeFunction('generate-scheduled-backup', {}, userId);

    // Verify no backup was created
    const { data: backups } = await supabase
      .from('backup_history')
      .select('*')
      .eq('user_id', userId);

    assertTrue((backups?.length ?? 0) === 0, 'Should not create backup for inactive schedule');

    console.log('[TEST PASSED] ✓ generate-scheduled-backup inactive schedule test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});

Deno.test('generate-scheduled-backup: should respect frequency intervals', async () => {
  let userId: string | undefined;

  try {
    const user = await createTestUser();
    userId = user.id;

    const supabase = getSupabaseClient();

    // Create schedule with future next_backup_at
    const nextBackup = new Date();
    nextBackup.setDate(nextBackup.getDate() + 1); // Tomorrow

    await supabase.from('backup_schedules').insert({
      user_id: userId,
      frequency: 'daily',
      is_active: true,
      next_backup_at: nextBackup.toISOString(), // Future date
    });

    // Invoke backup generation
    await invokeEdgeFunction('generate-scheduled-backup', {}, userId);

    // Verify no backup was created (not due yet)
    const { data: backups } = await supabase
      .from('backup_history')
      .select('*')
      .eq('user_id', userId);

    assertTrue((backups?.length ?? 0) === 0, 'Should not create backup before scheduled time');

    console.log('[TEST PASSED] ✓ generate-scheduled-backup frequency test passed');
  } finally {
    if (userId) {
      await cleanupTestUser(userId);
    }
  }
});
