import type { MemberInfo, ModelInfo } from './types.js';

/**
 * Normalize Statbate member info response to standard metrics
 */
export function normalizeMemberInfo(data: MemberInfo): Record<string, unknown> {
  return {
    did: data.did,
    all_time_tokens: data.all_time_tokens,
    first_message_date: data.first_message_date,
    first_tip_date: data.first_tip_date,
    last_tip_date: data.last_tip_date,
    last_tip_amount: data.last_tip_amount,
    models_messaged_2weeks: data.models_messaged_2weeks,
    models_messaged_2weeks_list: data.models_messaged_2weeks_list,
    models_tipped_2weeks: data.models_tipped_2weeks,
    models_tipped_2weeks_list: data.models_tipped_2weeks_list,
    per_day_tokens: data.per_day_tokens,
  };
}

/**
 * Normalize Statbate model info response to standard metrics
 */
export function normalizeModelInfo(data: ModelInfo): Record<string, unknown> {
  return {
    rid: data.rid,
    gender: data.gender,
    rank: data.rank,
    session_count: data.sessions.count,
    total_duration_minutes: data.sessions.total_duration,
    average_duration_minutes: data.sessions.average_duration,
    income_tokens: data.income.tokens,
    income_usd: data.income.usd,
    tags: data.tags,
  };
}
