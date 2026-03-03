import { SupabaseClient } from '@supabase/supabase-js';
import { ACHIEVEMENT_MAP } from './definitions';
import type { AchievementContext, UnlockedAchievement } from './types';

const CHARACTER_KEY_MAP: Record<string, string> = {
  'Sun Wukong (孙悟空)': 'wukong',
  'Tang Sanzang (三藏)': 'sanzang',
  'Sha Wujing (沙悟净)': 'wujing',
  'Zhu Bajie (猪八戒)': 'bajie',
};

/**
 * Determine which achievement keys are candidates based on the event context.
 */
function getCandidateKeys(context: AchievementContext): string[] {
  switch (context.type) {
    case 'quest_clear': {
      const keys = [
        `stage_${context.stage}_cleared`,
        'all_stages_cleared',
      ];
      if (context.damageTaken === 0) {
        keys.push(`no_hit_stage_${context.stage}`);
      }
      if (context.remainingHP === 1) {
        keys.push('clutch_clear');
      }
      return keys;
    }
    case 'quest_fail':
      return ['stage_failed'];
    case 'session_complete': {
      const charKey = CHARACTER_KEY_MAP[context.characterName];
      if (!charKey) return [];
      return [
        `sessions_5_${charKey}`,
        `sessions_10_${charKey}`,
        `sessions_20_${charKey}`,
      ];
    }
    case 'friend_added':
      return ['friend_added'];
    case 'mock_exam_complete':
      return ['mock_exam_complete'];
    case 'account_created':
      return ['account_created'];
    case 'chat_complete':
      return ['first_chat', 'chat_messages_50', 'chat_all_companions', 'chat_sessions_10'];
    case 'learning_plan_created':
      return ['learning_first_step'];
    case 'learning_checkpoint': {
      const keys = ['learning_on_track'];
      if (context.checkpointNumber >= 3) {
        keys.push('learning_adapting');
      }
      return keys;
    }
    case 'learning_complete':
      return ['learning_exam_ready'];
  }
}

/**
 * For keys that require a DB count check, verify the condition is actually met.
 * Simple event-based achievements (the event itself is proof) pass through directly.
 */
async function verifyConditions(
  supabase: SupabaseClient,
  userId: string,
  context: AchievementContext,
  keys: string[],
): Promise<string[]> {
  const verified: string[] = [];
  const sessionChecks: { key: string; charName: string; threshold: number }[] = [];

  for (const key of keys) {
    // Simple event-based achievements -- the event itself is proof
    if (
      key === 'stage_failed' ||
      key === 'friend_added' ||
      key === 'mock_exam_complete' ||
      key === 'account_created' ||
      key.startsWith('stage_') && key.endsWith('_cleared') && key !== 'all_stages_cleared'
    ) {
      verified.push(key);
      continue;
    }

    // first_chat: simple event-based
    if (key === 'first_chat') {
      verified.push(key);
      continue;
    }

    // chat_messages_50: check total user messages across all chat sessions
    if (key === 'chat_messages_50') {
      const { count: msgCount } = await supabase.rpc('count_user_chat_messages', { p_user_id: userId });
      if (msgCount !== null && msgCount >= 50) {
        verified.push(key);
      }
      continue;
    }

    // chat_all_companions: check distinct character_ids in ended chat sessions
    if (key === 'chat_all_companions') {
      const { data: distinctChars } = await supabase
        .from('chat_sessions')
        .select('character_id')
        .eq('user_id', userId)
        .not('ended_at', 'is', null);

      const uniqueChars = new Set((distinctChars ?? []).map(r => r.character_id));
      if (uniqueChars.size >= 4) {
        verified.push(key);
      }
      continue;
    }

    // chat_sessions_10: check total completed chat sessions
    if (key === 'chat_sessions_10') {
      const { count } = await supabase
        .from('chat_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('ended_at', 'is', null);

      if (count !== null && count >= 10) {
        verified.push(key);
      }
      continue;
    }

    // learning_first_step: simple event-based (the plan creation event is proof)
    if (key === 'learning_first_step') {
      verified.push(key);
      continue;
    }

    // learning_on_track: simple event-based (the checkpoint event is proof)
    if (key === 'learning_on_track') {
      verified.push(key);
      continue;
    }

    // learning_exam_ready: simple event-based (the learning_complete event is proof)
    if (key === 'learning_exam_ready') {
      verified.push(key);
      continue;
    }

    // learning_adapting: need >= 3 total checkpoints across all user's learning plans
    if (key === 'learning_adapting') {
      const { data: plans } = await supabase
        .from('learning_plans')
        .select('id')
        .eq('user_id', userId);

      if (plans && plans.length > 0) {
        const planIds = plans.map((p: { id: string }) => p.id);
        const { count } = await supabase
          .from('learning_checkpoints')
          .select('*', { count: 'exact', head: true })
          .in('plan_id', planIds);

        if (count !== null && count >= 3) {
          verified.push(key);
        }
      }
      continue;
    }

    // no_hit_stage_X: verify stage is cleared AND was cleared with zero damage
    if (key.startsWith('no_hit_stage_')) {
      const stageNum = parseInt(key.replace('no_hit_stage_', ''), 10);
      if (!isNaN(stageNum)) {
        const { data: stageRow } = await supabase
          .from('quest_progress')
          .select('is_cleared, best_score, damage_taken')
          .eq('user_id', userId)
          .eq('stage', stageNum)
          .eq('is_cleared', true)
          .single();

        if (stageRow && stageRow.damage_taken === 0) {
          verified.push(key);
        }
      }
      continue;
    }

    // clutch_clear: verify user has at least one cleared stage in DB
    if (key === 'clutch_clear') {
      const { count } = await supabase
        .from('quest_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_cleared', true);

      if (count !== null && count > 0) {
        verified.push(key);
      }
      continue;
    }

    // all_stages_cleared: need >= 7 cleared stages
    if (key === 'all_stages_cleared') {
      const { count, error } = await supabase
        .from('quest_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_cleared', true);

      if (!error && count !== null && count >= 7) {
        verified.push(key);
      }
      continue;
    }

    // sessions_N_CHAR: parse threshold and character key, batch later
    const sessionMatch = key.match(/^sessions_(\d+)_(.+)$/);
    if (sessionMatch && context.type === 'session_complete') {
      const threshold = parseInt(sessionMatch[1], 10);
      sessionChecks.push({
        key,
        charName: context.characterName,
        threshold,
      });
    }
  }

  // Batch session count checks: look up character ID once, then count sessions
  if (sessionChecks.length > 0 && context.type === 'session_complete') {
    const charName = context.characterName;

    const { data: charRow, error: charError } = await supabase
      .from('characters')
      .select('id')
      .eq('name', charName)
      .single();

    if (!charError && charRow) {
      const { count, error: countError } = await supabase
        .from('practice_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('character_id', charRow.id);

      if (!countError && count !== null) {
        for (const check of sessionChecks) {
          if (count >= check.threshold) {
            verified.push(check.key);
          }
        }
      }
    }
  }

  return verified;
}

/**
 * Check and unlock achievements based on the event context.
 * Returns newly unlocked achievements for toast display.
 *
 * This function is intentionally defensive -- achievement checking should
 * never break the parent API call.
 */
export async function checkAndUnlockAchievements(
  supabase: SupabaseClient,
  userId: string,
  context: AchievementContext,
): Promise<UnlockedAchievement[]> {
  try {
    // 1. Determine candidate achievement keys
    const candidateKeys = getCandidateKeys(context);
    if (candidateKeys.length === 0) return [];

    // Filter to only keys that actually exist in ACHIEVEMENT_MAP
    const validKeys = candidateKeys.filter((k) => k in ACHIEVEMENT_MAP);
    if (validKeys.length === 0) return [];

    // 2. Find which candidates are already unlocked
    const { data: existing, error: existingError } = await supabase
      .from('user_achievements')
      .select('achievement_id, achievements!inner(key)')
      .eq('user_id', userId)
      .in('achievements.key', validKeys);

    if (existingError) {
      console.error('[achievements] Error checking existing:', existingError);
      return [];
    }

    // Extract already-unlocked keys from the joined result.
    // Supabase generic types infer the !inner join as an array, but since
    // user_achievements.achievement_id is a single FK, it's actually one object.
    const alreadyUnlocked = new Set(
      (existing ?? []).map((row) => {
        const ach = row.achievements as unknown as { key: string };
        return ach.key;
      }),
    );

    const remainingKeys = validKeys.filter((k) => !alreadyUnlocked.has(k));
    if (remainingKeys.length === 0) return [];

    // 3. Verify conditions for remaining keys
    const verifiedKeys = await verifyConditions(
      supabase,
      userId,
      context,
      remainingKeys,
    );
    if (verifiedKeys.length === 0) return [];

    // 4. Get achievement UUIDs for verified keys
    const { data: achievementRows, error: achError } = await supabase
      .from('achievements')
      .select('id, key')
      .in('key', verifiedKeys);

    if (achError || !achievementRows || achievementRows.length === 0) {
      console.error('[achievements] Error fetching achievement IDs:', achError);
      return [];
    }

    // 5. Bulk insert into user_achievements
    const insertRows = achievementRows.map(
      (row: { id: string; key: string }) => ({
        user_id: userId,
        achievement_id: row.id,
      }),
    );

    const { error: insertError } = await supabase
      .from('user_achievements')
      .insert(insertRows);

    if (insertError) {
      // UNIQUE constraint violation is acceptable (race condition between checks)
      // Log other errors but don't throw
      console.error('[achievements] Error inserting:', insertError);
      return [];
    }

    // 6. Build return array for toast display
    const unlocked: UnlockedAchievement[] = verifiedKeys
      .map((key) => {
        const def = ACHIEVEMENT_MAP[key];
        if (!def) return null;
        return {
          key: def.key,
          name: def.name,
          emoji: def.emoji,
          tier: def.tier,
        };
      })
      .filter((a): a is UnlockedAchievement => a !== null);

    return unlocked;
  } catch (err) {
    console.error('[achievements] Unexpected error in checkAndUnlockAchievements:', err);
    return [];
  }
}
