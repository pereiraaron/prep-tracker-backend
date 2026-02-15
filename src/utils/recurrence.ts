import { ITask } from "../types/task";
import { RecurrenceFrequency } from "../types/task";

/**
 * Checks if a recurring task falls on a given date.
 */
export const isTaskOnDate = (task: ITask, date: Date): boolean => {
  if (!task.recurrence) return false;

  const startDate = new Date(task.recurrence.startDate);
  const targetDate = new Date(date);

  // Normalize to start of day for comparison
  startDate.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  // Task hasn't started yet
  if (targetDate < startDate) return false;

  // Task has ended
  if (task.endDate) {
    const endDate = new Date(task.endDate);
    endDate.setHours(0, 0, 0, 0);
    if (targetDate > endDate) return false;
  }

  switch (task.recurrence.frequency) {
    case RecurrenceFrequency.Daily:
      return true;

    case RecurrenceFrequency.Weekly: {
      const daysOfWeek = task.recurrence.daysOfWeek || [];
      if (daysOfWeek.length > 0) {
        return daysOfWeek.includes(targetDate.getDay());
      }
      // Fall back to same day of week as startDate
      return targetDate.getDay() === startDate.getDay();
    }

    case RecurrenceFrequency.Biweekly: {
      // Every 2 weeks from startDate
      const diffTime = targetDate.getTime() - startDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      // Must be on an even week boundary
      if (diffWeeks % 2 !== 0) return false;
      const daysOfWeek = task.recurrence.daysOfWeek || [];
      if (daysOfWeek.length > 0) {
        return daysOfWeek.includes(targetDate.getDay());
      }
      return targetDate.getDay() === startDate.getDay();
    }

    case RecurrenceFrequency.Monthly: {
      // Same day of month as startDate
      return targetDate.getDate() === startDate.getDate();
    }

    case RecurrenceFrequency.Custom: {
      const interval = task.recurrence.interval;
      if (interval && interval > 0) {
        // Every N days from startDate
        const diffTime = targetDate.getTime() - startDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return diffDays % interval === 0;
      }
      // Fall back to daysOfWeek
      const daysOfWeek = task.recurrence.daysOfWeek || [];
      return daysOfWeek.includes(targetDate.getDay());
    }

    default:
      return false;
  }
};

/**
 * Returns start and end of a given date (midnight to midnight).
 */
export const getDayRange = (date: Date): { start: Date; end: Date } => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};
