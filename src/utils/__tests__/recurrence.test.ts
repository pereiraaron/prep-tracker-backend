import { isTaskOnDate, getDayRange } from "../recurrence";
import { RecurrenceFrequency } from "../../types/task";
import { PrepCategory } from "../../types/category";

// Helper to build a minimal ITask-like object for testing
const makeTask = (overrides: Record<string, any> = {}) =>
  ({
    name: "Test",
    userId: "u1",
    category: PrepCategory.DSA,
    targetQuestionCount: 3,
    isRecurring: true,
    recurrence: { frequency: RecurrenceFrequency.Daily, startDate: new Date("2025-01-06") },
    status: "active",
    ...overrides,
  }) as any;

describe("getDayRange", () => {
  it("returns start at 00:00:00.000 and end at 23:59:59.999 for the same date", () => {
    const date = new Date("2025-03-15T14:30:00Z");
    const { start, end } = getDayRange(date);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("preserves the date portion", () => {
    const date = new Date("2025-06-20T08:00:00");
    const { start, end } = getDayRange(date);

    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(5); // June = 5
    expect(start.getDate()).toBe(20);

    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(20);
  });

  it("does not mutate the original date object", () => {
    const date = new Date("2025-03-15T14:30:00");
    const originalTime = date.getTime();
    getDayRange(date);
    expect(date.getTime()).toBe(originalTime);
  });
});

describe("isTaskOnDate", () => {
  describe("boundary checks", () => {
    it("returns false if the target date is before the startDate", () => {
      const task = makeTask({ recurrence: { frequency: RecurrenceFrequency.Daily, startDate: new Date("2025-01-10") } });
      expect(isTaskOnDate(task, new Date("2025-01-09"))).toBe(false);
    });

    it("returns true for the startDate itself (daily)", () => {
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Daily, startDate: new Date("2025-01-10") },
      });
      expect(isTaskOnDate(task, new Date("2025-01-10"))).toBe(true);
    });

    it("returns false if the target date is after endDate", () => {
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Daily, startDate: new Date("2025-01-01") },
        endDate: new Date("2025-01-15"),
      });
      expect(isTaskOnDate(task, new Date("2025-01-16"))).toBe(false);
    });

    it("returns true on the endDate itself", () => {
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Daily, startDate: new Date("2025-01-01") },
        endDate: new Date("2025-01-15"),
      });
      expect(isTaskOnDate(task, new Date("2025-01-15"))).toBe(true);
    });

    it("returns false if recurrence is undefined", () => {
      const task = makeTask({ recurrence: undefined });
      expect(isTaskOnDate(task, new Date("2025-01-10"))).toBe(false);
    });
  });

  describe("daily recurrence", () => {
    it("returns true for any date on or after startDate", () => {
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Daily, startDate: new Date("2025-01-01") },
      });
      expect(isTaskOnDate(task, new Date("2025-01-01"))).toBe(true);
      expect(isTaskOnDate(task, new Date("2025-02-15"))).toBe(true);
      expect(isTaskOnDate(task, new Date("2025-06-30"))).toBe(true);
    });
  });

  describe("weekly recurrence", () => {
    it("returns true only on the same day of the week as the startDate when no daysOfWeek specified", () => {
      // 2025-01-06 is a Monday
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Weekly, startDate: new Date("2025-01-06") },
      });

      // Next Monday
      expect(isTaskOnDate(task, new Date("2025-01-13"))).toBe(true);
      // Two weeks later Monday
      expect(isTaskOnDate(task, new Date("2025-01-20"))).toBe(true);
      // Tuesday
      expect(isTaskOnDate(task, new Date("2025-01-07"))).toBe(false);
      // Sunday
      expect(isTaskOnDate(task, new Date("2025-01-12"))).toBe(false);
    });

    it("returns true on the startDate itself", () => {
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Weekly, startDate: new Date("2025-01-06") },
      });
      expect(isTaskOnDate(task, new Date("2025-01-06"))).toBe(true);
    });

    it("uses daysOfWeek when specified", () => {
      const task = makeTask({
        recurrence: {
          frequency: RecurrenceFrequency.Weekly,
          startDate: new Date("2025-01-06"),
          daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
        },
      });
      // Monday
      expect(isTaskOnDate(task, new Date("2025-01-13"))).toBe(true);
      // Wednesday
      expect(isTaskOnDate(task, new Date("2025-01-08"))).toBe(true);
      // Friday
      expect(isTaskOnDate(task, new Date("2025-01-10"))).toBe(true);
      // Tuesday
      expect(isTaskOnDate(task, new Date("2025-01-07"))).toBe(false);
    });
  });

  describe("biweekly recurrence", () => {
    it("returns true every 2 weeks on the same day as startDate", () => {
      // 2025-01-06 is a Monday
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Biweekly, startDate: new Date("2025-01-06") },
      });

      // Week 0 (startDate) - Monday
      expect(isTaskOnDate(task, new Date("2025-01-06"))).toBe(true);
      // Week 1 - Monday (odd week, should be false)
      expect(isTaskOnDate(task, new Date("2025-01-13"))).toBe(false);
      // Week 2 - Monday (even week, should be true)
      expect(isTaskOnDate(task, new Date("2025-01-20"))).toBe(true);
      // Week 3 - Monday (odd week, should be false)
      expect(isTaskOnDate(task, new Date("2025-01-27"))).toBe(false);
    });
  });

  describe("monthly recurrence", () => {
    it("returns true on the same day of month as startDate", () => {
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Monthly, startDate: new Date("2025-01-15") },
      });

      expect(isTaskOnDate(task, new Date("2025-01-15"))).toBe(true);
      expect(isTaskOnDate(task, new Date("2025-02-15"))).toBe(true);
      expect(isTaskOnDate(task, new Date("2025-03-15"))).toBe(true);
      expect(isTaskOnDate(task, new Date("2025-01-16"))).toBe(false);
      expect(isTaskOnDate(task, new Date("2025-02-14"))).toBe(false);
    });
  });

  describe("custom recurrence", () => {
    it("returns true on specified days of the week when no interval", () => {
      // Mon=1, Wed=3, Fri=5
      const task = makeTask({
        recurrence: {
          frequency: RecurrenceFrequency.Custom,
          startDate: new Date("2025-01-06"),
          daysOfWeek: [1, 3, 5],
        },
      });

      expect(isTaskOnDate(task, new Date("2025-01-13"))).toBe(true); // Mon
      expect(isTaskOnDate(task, new Date("2025-01-08"))).toBe(true); // Wed
      expect(isTaskOnDate(task, new Date("2025-01-10"))).toBe(true); // Fri
      expect(isTaskOnDate(task, new Date("2025-01-07"))).toBe(false); // Tue
      expect(isTaskOnDate(task, new Date("2025-01-11"))).toBe(false); // Sat
    });

    it("returns true every N days when interval is specified", () => {
      const task = makeTask({
        recurrence: {
          frequency: RecurrenceFrequency.Custom,
          startDate: new Date("2025-01-01"),
          interval: 3, // every 3 days
        },
      });

      expect(isTaskOnDate(task, new Date("2025-01-01"))).toBe(true); // day 0
      expect(isTaskOnDate(task, new Date("2025-01-02"))).toBe(false); // day 1
      expect(isTaskOnDate(task, new Date("2025-01-03"))).toBe(false); // day 2
      expect(isTaskOnDate(task, new Date("2025-01-04"))).toBe(true); // day 3
      expect(isTaskOnDate(task, new Date("2025-01-07"))).toBe(true); // day 6
    });

    it("handles empty daysOfWeek array", () => {
      const task = makeTask({
        recurrence: {
          frequency: RecurrenceFrequency.Custom,
          startDate: new Date("2025-01-06"),
          daysOfWeek: [],
        },
      });
      expect(isTaskOnDate(task, new Date("2025-01-13"))).toBe(false);
    });
  });

  describe("no endDate", () => {
    it("works indefinitely when endDate is not set", () => {
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Daily, startDate: new Date("2025-01-01") },
        endDate: undefined,
      });
      expect(isTaskOnDate(task, new Date("2026-12-31"))).toBe(true);
    });

    it("works when endDate is null", () => {
      const task = makeTask({
        recurrence: { frequency: RecurrenceFrequency.Daily, startDate: new Date("2025-01-01") },
        endDate: null,
      });
      expect(isTaskOnDate(task, new Date("2026-12-31"))).toBe(true);
    });
  });
});
