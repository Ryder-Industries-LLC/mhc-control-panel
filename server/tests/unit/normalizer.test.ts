import { normalizeMemberInfo, normalizeModelInfo } from '../../src/api/statbate/normalizer';
import { normalizeChaturbateStats } from '../../src/api/chaturbate/stats-client';
import type { MemberInfo, ModelInfo } from '../../src/api/statbate/types';
import type { ChaturbateStats } from '../../src/api/chaturbate/stats-client';

describe('Normalizers', () => {
  describe('normalizeMemberInfo', () => {
    it('should normalize member info correctly', () => {
      const memberInfo: MemberInfo = {
        name: 'testuser',
        did: 12345,
        first_message_date: '2024-01-01T00:00:00Z',
        first_tip_date: '2024-01-02T00:00:00Z',
        last_tip_date: '2024-12-01T00:00:00Z',
        last_tip_amount: 100,
        models_messaged_2weeks: 3,
        models_messaged_2weeks_list: ['model1', 'model2', 'model3'],
        models_tipped_2weeks: 2,
        models_tipped_2weeks_list: ['model1', 'model2'],
        per_day_tokens: [
          { date: '2024-12-01', tokens: 500 },
          { date: '2024-12-02', tokens: 300 },
        ],
        all_time_tokens: 50000,
      };

      const normalized = normalizeMemberInfo(memberInfo);

      expect(normalized).toEqual({
        did: 12345,
        all_time_tokens: 50000,
        first_message_date: '2024-01-01T00:00:00Z',
        first_tip_date: '2024-01-02T00:00:00Z',
        last_tip_date: '2024-12-01T00:00:00Z',
        last_tip_amount: 100,
        models_messaged_2weeks: 3,
        models_messaged_2weeks_list: ['model1', 'model2', 'model3'],
        models_tipped_2weeks: 2,
        models_tipped_2weeks_list: ['model1', 'model2'],
        per_day_tokens: [
          { date: '2024-12-01', tokens: 500 },
          { date: '2024-12-02', tokens: 300 },
        ],
      });
    });
  });

  describe('normalizeModelInfo', () => {
    it('should normalize model info correctly', () => {
      const modelInfo: ModelInfo = {
        name: 'testmodel',
        rid: 54321,
        gender: 1,
        rank: 100,
        sessions: {
          count: 50,
          total_duration: 3000,
          average_duration: 60,
        },
        income: {
          tokens: 100000,
          usd: 5000,
        },
        tags: [
          { name: 'blonde', category: 'appearance' },
          { name: 'english', category: 'language' },
        ],
      };

      const normalized = normalizeModelInfo(modelInfo);

      expect(normalized).toEqual({
        rid: 54321,
        gender: 1,
        rank: 100,
        session_count: 50,
        total_duration_minutes: 3000,
        average_duration_minutes: 60,
        income_tokens: 100000,
        income_usd: 5000,
        tags: [
          { name: 'blonde', category: 'appearance' },
          { name: 'english', category: 'language' },
        ],
      });
    });
  });

  describe('normalizeChaturbateStats', () => {
    it('should normalize Chaturbate stats correctly', () => {
      const stats: ChaturbateStats = {
        username: 'hudson_cage',
        token_balance: 1500,
        tips_in_last_hour: 10,
        votes_up: 100,
        votes_down: 5,
        satisfaction_score: 95,
        last_broadcast: '2024-12-20T10:00:00Z',
        time_online: 120,
        num_followers: 250,
        num_viewers: 50,
        num_registered_viewers: 30,
      };

      const normalized = normalizeChaturbateStats(stats);

      expect(normalized).toEqual({
        token_balance: 1500,
        tips_in_last_hour: 10,
        votes_up: 100,
        votes_down: 5,
        satisfaction_score: 95,
        last_broadcast: '2024-12-20T10:00:00Z',
        time_online_minutes: 120,
        num_followers: 250,
        num_viewers: 50,
        num_registered_viewers: 30,
      });
    });

    it('should handle -1 values for offline broadcaster', () => {
      const stats: ChaturbateStats = {
        username: 'hudson_cage',
        token_balance: 1500,
        tips_in_last_hour: 0,
        votes_up: 100,
        votes_down: 5,
        satisfaction_score: 95,
        last_broadcast: -1,
        time_online: -1,
        num_followers: 250,
        num_viewers: 0,
        num_registered_viewers: 0,
      };

      const normalized = normalizeChaturbateStats(stats);

      expect(normalized.last_broadcast).toBeNull();
      expect(normalized.time_online_minutes).toBeNull();
    });
  });
});
