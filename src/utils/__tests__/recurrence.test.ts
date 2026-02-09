import { isTaskOnDate, getDayRange } from "../recurrence";
import { RecurrenceFrequency, EntryStatus } from "../../types";
import { PrepCategory } from "../../types/category";

// Helper to build a minimal IEntry-like object for testing
const makeEntry = (overrides: Record<string, any> = {}) =>
  ({
    title: "Test",
    status: EntryStatus.Pending,
    category: PrepCategory.DSA,
    tags: [],
    userId: "u1",
    deadline: new Date("2025-01-06"), // Monday
    isRecurring: true,
    recurrence: { frequency: RecurrenceFrequency.Daily },
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
    it("returns false if the target date is before the deadline", () => {
      const entry = makeEntry({ deadline: new Date("2025-01-10") });
      expect(isTaskOnDate(entry, new Date("2025-01-09"))).toBe(false);
    });

    it("returns true for the deadline date itself (daily)", () => {
      const entry = makeEntry({
        deadline: new Date("2025-01-10"),
        recurrence: { frequency: RecurrenceFrequency.Daily },
      });
      expect(isTaskOnDate(entry, new Date("2025-01-10"))).toBe(true);
    });

    it("returns false if the target date is after recurringEndDate", () => {
      const entry = makeEntry({
        deadline: new Date("2025-01-01"),
        recurringEndDate: new Date("2025-01-15"),
        recurrence: { frequency: RecurrenceFrequency.Daily },
      });
      expect(isTaskOnDate(entry, new Date("2025-01-16"))).toBe(false);
    });

    it("returns true on the recurringEndDate itself", () => {
      const entry = makeEntry({
        deadline: new Date("2025-01-01"),
        recurringEndDate: new Date("2025-01-15"),
        recurrence: { frequency: RecurrenceFrequency.Daily },
      });
      expect(isTaskOnDate(entry, new Date("2025-01-15"))).toBe(true);
    });

    it("returns false if recurrence is undefined", () => {
      const entry = makeEntry({ recurrence: undefined });
      expect(isTaskOnDate(entry, new Date("2025-01-10"))).toBe(false);
    });
  });

  describe("daily recurrence", () => {
    it("returns true for any date on or after deadline", () => {
      const entry = makeEntry({
        deadline: new Date("2025-01-01"),
        recurrence: { frequency: RecurrenceFrequency.Daily },
      });
      expect(isTaskOnDate(entry, new Date("2025-01-01"))).toBe(true);
      expect(isTaskOnDate(entry, new Date("2025-02-15"))).toBe(true);
      expect(isTaskOnDate(entry, new Date("2025-06-30"))).toBe(true);
    });
  });

  describe("weekly recurrence", () => {
    it("returns true only on the same day of the week as the deadline", () => {
      // 2025-01-06 is a Monday
      const entry = makeEntry({
        deadline: new Date("2025-01-06"),
        recurrence: { frequency: RecurrenceFrequency.Weekly },
      });

      // Next Monday
      expect(isTaskOnDate(entry, new Date("2025-01-13"))).toBe(true);
      // Two weeks later Monday
      expect(isTaskOnDate(entry, new Date("2025-01-20"))).toBe(true);
      // Tuesday
      expect(isTaskOnDate(entry, new Date("2025-01-07"))).toBe(false);
      // Sunday
      expect(isTaskOnDate(entry, new Date("2025-01-12"))).toBe(false);
    });

    it("returns true on the deadline date itself", () => {
      const entry = makeEntry({
        deadline: new Date("2025-01-06"),
        recurrence: { frequency: RecurrenceFrequency.Weekly },
      });
      expect(isTaskOnDate(entry, new Date("2025-01-06"))).toBe(true);
    });
  });

  describe("custom recurrence", () => {
    it("returns true only on specified days of the week", () => {
      // Mon=1, Wed=3, Fri=5
      const entry = makeEntry({
        deadline: new Date("2025-01-06"), // Monday
        recurrence: {
          frequency: RecurrenceFrequency.Custom,
          daysOfWeek: [1, 3, 5],
        },
      });

      // Mon Jan 13
      expect(isTaskOnDate(entry, new Date("2025-01-13"))).toBe(true);
      // Wed Jan 8
      expect(isTaskOnDate(entry, new Date("2025-01-08"))).toBe(true);
      // Fri Jan 10
      expect(isTaskOnDate(entry, new Date("2025-01-10"))).toBe(true);
      // Tue Jan 7
      expect(isTaskOnDate(entry, new Date("2025-01-07"))).toBe(false);
      // Sat Jan 11
      expect(isTaskOnDate(entry, new Date("2025-01-11"))).toBe(false);
    });

    it("handles empty daysOfWeek array", () => {
      const entry = makeEntry({
        deadline: new Date("2025-01-06"),
        recurrence: {
          frequency: RecurrenceFrequency.Custom,
          daysOfWeek: [],
        },
      });
      expect(isTaskOnDate(entry, new Date("2025-01-13"))).toBe(false);
    });

    it("handles undefined daysOfWeek", () => {
      const entry = makeEntry({
        deadline: new Date("2025-01-06"),
        recurrence: {
          frequency: RecurrenceFrequency.Custom,
        },
      });
      expect(isTaskOnDate(entry, new Date("2025-01-13"))).toBe(false);
    });
  });

  describe("no recurringEndDate", () => {
    it("works indefinitely when recurringEndDate is not set", () => {
      const entry = makeEntry({
        deadline: new Date("2025-01-01"),
        recurringEndDate: undefined,
        recurrence: { frequency: RecurrenceFrequency.Daily },
      });
      expect(isTaskOnDate(entry, new Date("2026-12-31"))).toBe(true);
    });

    it("works when recurringEndDate is null", () => {
      const entry = makeEntry({
        deadline: new Date("2025-01-01"),
        recurringEndDate: null,
        recurrence: { frequency: RecurrenceFrequency.Daily },
      });
      expect(isTaskOnDate(entry, new Date("2026-12-31"))).toBe(true);
    });
  });
});
