import { ITask } from "../types/task";
import { RecurrenceFrequency } from "../types/task";

const TIMEZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

/**
 * Returns the YYYY-MM-DD string in IST for a given date.
 */
export const toISTDateString = (date: Date): string =>
  date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

/**
 * Returns midnight IST as a UTC Date for a given date.
 */
export const toISTMidnight = (date: Date): Date => {
  const dateStr = toISTDateString(date);
  return new Date(`${dateStr}T00:00:00.000${IST_OFFSET}`);
};

/**
 * Returns the day of week (0=Sun, 6=Sat) in IST for a given date.
 */
const getISTDay = (date: Date): number => {
  const [y, m, d] = toISTDateString(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/**
 * Returns the day of month in IST for a given date.
 */
const getISTDayOfMonth = (date: Date): number =>
  parseInt(toISTDateString(date).split("-")[2]);

/**
 * Returns the difference in days between two dates in IST.
 */
const diffISTDays = (from: Date, to: Date): number => {
  const fromMs = toISTMidnight(from).getTime();
  const toMs = toISTMidnight(to).getTime();
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
};

/**
 * Checks if a recurring task falls on a given date (IST).
 */
export const isTaskOnDate = (task: ITask, date: Date): boolean => {
  if (!task.recurrence) return false;

  const startDate = new Date(task.recurrence.startDate);

  // Task hasn't started yet
  if (diffISTDays(startDate, date) < 0) return false;

  // Task has ended
  if (task.endDate) {
    const endDate = new Date(task.endDate);
    if (diffISTDays(endDate, date) > 0) return false;
  }

  switch (task.recurrence.frequency) {
    case RecurrenceFrequency.Daily:
      return true;

    case RecurrenceFrequency.Weekly: {
      const daysOfWeek = task.recurrence.daysOfWeek || [];
      if (daysOfWeek.length > 0) {
        return daysOfWeek.includes(getISTDay(date));
      }
      // Fall back to same day of week as startDate
      return getISTDay(date) === getISTDay(startDate);
    }

    case RecurrenceFrequency.Biweekly: {
      // Every 2 weeks from startDate
      const days = diffISTDays(startDate, date);
      const weeks = Math.floor(days / 7);
      // Must be on an even week boundary
      if (weeks % 2 !== 0) return false;
      const daysOfWeek = task.recurrence.daysOfWeek || [];
      if (daysOfWeek.length > 0) {
        return daysOfWeek.includes(getISTDay(date));
      }
      return getISTDay(date) === getISTDay(startDate);
    }

    case RecurrenceFrequency.Monthly: {
      // Same day of month as startDate
      return getISTDayOfMonth(date) === getISTDayOfMonth(startDate);
    }

    case RecurrenceFrequency.Custom: {
      const interval = task.recurrence.interval;
      if (interval && interval > 0) {
        // Every N days from startDate
        const days = diffISTDays(startDate, date);
        return days % interval === 0;
      }
      // Fall back to daysOfWeek
      const daysOfWeek = task.recurrence.daysOfWeek || [];
      return daysOfWeek.includes(getISTDay(date));
    }

    default:
      return false;
  }
};

/**
 * Returns start and end of day in IST for a given date.
 */
export const getDayRange = (date: Date): { start: Date; end: Date } => {
  const dateStr = toISTDateString(date);
  const start = new Date(`${dateStr}T00:00:00.000${IST_OFFSET}`);
  const end = new Date(`${dateStr}T23:59:59.999${IST_OFFSET}`);
  return { start, end };
};
