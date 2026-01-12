import { DMScraperService } from '../../src/services/dm-scraper.service';

describe('DMScraperService', () => {
  describe('parseRelativeDate', () => {
    // Helper to get a fixed reference point for tests
    const fixedNow = new Date('2026-01-11T14:00:00Z');

    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should parse full date format "January 4, 2026"', () => {
      const result = DMScraperService.parseRelativeDate('January 4, 2026');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2026);
      expect(result?.getMonth()).toBe(0); // January is 0
      expect(result?.getDate()).toBe(4);
    });

    it('should parse full date format "Jan 4, 2026"', () => {
      const result = DMScraperService.parseRelativeDate('Jan 4, 2026');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2026);
      expect(result?.getMonth()).toBe(0);
      expect(result?.getDate()).toBe(4);
    });

    it('should parse "Today 3:15pm"', () => {
      const result = DMScraperService.parseRelativeDate('Today 3:15pm');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2026);
      expect(result?.getMonth()).toBe(0);
      expect(result?.getDate()).toBe(11);
      expect(result?.getHours()).toBe(15);
      expect(result?.getMinutes()).toBe(15);
    });

    it('should parse "Yesterday 8:00am"', () => {
      const result = DMScraperService.parseRelativeDate('Yesterday 8:00am');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2026);
      expect(result?.getMonth()).toBe(0);
      expect(result?.getDate()).toBe(10);
      expect(result?.getHours()).toBe(8);
      expect(result?.getMinutes()).toBe(0);
    });

    it('should parse "Thu 7:30pm" with reference date', () => {
      const referenceDate = new Date('2026-01-09T12:00:00Z'); // Thursday
      const result = DMScraperService.parseRelativeDate('Thu 7:30pm', referenceDate);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getHours()).toBe(19);
      expect(result?.getMinutes()).toBe(30);
    });

    it('should parse "7:30pm" with reference date', () => {
      const referenceDate = new Date('2026-01-09T12:00:00Z');
      const result = DMScraperService.parseRelativeDate('7:30pm', referenceDate);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getHours()).toBe(19);
      expect(result?.getMinutes()).toBe(30);
    });

    it('should handle different month names', () => {
      const months = [
        { input: 'February 15, 2026', expectedMonth: 1 },
        { input: 'Mar 15, 2026', expectedMonth: 2 },
        { input: 'April 15, 2026', expectedMonth: 3 },
        { input: 'May 15, 2026', expectedMonth: 4 },
        { input: 'June 15, 2026', expectedMonth: 5 },
        { input: 'July 15, 2026', expectedMonth: 6 },
        { input: 'Aug 15, 2026', expectedMonth: 7 },
        { input: 'September 15, 2026', expectedMonth: 8 },
        { input: 'Oct 15, 2026', expectedMonth: 9 },
        { input: 'November 15, 2026', expectedMonth: 10 },
        { input: 'Dec 15, 2026', expectedMonth: 11 },
      ];

      for (const { input, expectedMonth } of months) {
        const result = DMScraperService.parseRelativeDate(input);
        expect(result?.getMonth()).toBe(expectedMonth);
      }
    });

    it('should return null for invalid input', () => {
      expect(DMScraperService.parseRelativeDate('')).toBeNull();
      expect(DMScraperService.parseRelativeDate('invalid')).toBeNull();
    });
  });

  describe('parseTipFromMessage', () => {
    it('should detect "You tipped X tokens" (tip I gave)', () => {
      const result = DMScraperService.parseTipFromMessage('You tipped 25 tokens', true);
      expect(result.isTip).toBe(true);
      expect(result.amount).toBe(-25); // Negative = I gave
    });

    it('should detect "username tipped X tokens" (tip to me)', () => {
      const result = DMScraperService.parseTipFromMessage('john123 tipped 50 tokens', false);
      expect(result.isTip).toBe(true);
      expect(result.amount).toBe(50); // Positive = received
    });

    it('should detect tip with single token', () => {
      const result = DMScraperService.parseTipFromMessage('You tipped 1 token', true);
      expect(result.isTip).toBe(true);
      expect(result.amount).toBe(-1);
    });

    it('should return isTip=false for regular messages', () => {
      const result = DMScraperService.parseTipFromMessage('Hello, how are you?', false);
      expect(result.isTip).toBe(false);
      expect(result.amount).toBeNull();
    });

    it('should return isTip=false for messages mentioning tokens without tipping', () => {
      const result = DMScraperService.parseTipFromMessage('I have 100 tokens', false);
      expect(result.isTip).toBe(false);
      expect(result.amount).toBeNull();
    });
  });

  describe('generateMessageHash', () => {
    it('should generate consistent hash for same input', () => {
      // Access the private method through any cast
      const service = DMScraperService as any;

      const hash1 = service.generateMessageHash('user1', 'Hello', '7:30pm', true);
      const hash2 = service.generateMessageHash('user1', 'Hello', '7:30pm', true);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different input', () => {
      const service = DMScraperService as any;

      const hash1 = service.generateMessageHash('user1', 'Hello', '7:30pm', true);
      const hash2 = service.generateMessageHash('user1', 'Hello', '7:30pm', false);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle null raw date text', () => {
      const service = DMScraperService as any;

      const hash = service.generateMessageHash('user1', 'Hello', null, true);

      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });
  });
});
