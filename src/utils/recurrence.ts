import { IEntry, RecurrenceFrequency } from "../types";

/**
 * Checks if a recurring task falls on a given date.
 */
export const isTaskOnDate = (entry: IEntry, date: Date): boolean => {
  const entryDeadline = new Date(entry.deadline);
  const targetDate = new Date(date);

  // Normalize to start of day for comparison
  entryDeadline.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  // Task hasn't started yet
  if (targetDate < entryDeadline) return false;

  // Task has ended
  if (entry.recurringEndDate) {
    const endDate = new Date(entry.recurringEndDate);
    endDate.setHours(0, 0, 0, 0);
    if (targetDate > endDate) return false;
  }

  if (!entry.recurrence) return false;

  switch (entry.recurrence.frequency) {
    case RecurrenceFrequency.Daily:
      return true;

    case RecurrenceFrequency.Weekly: {
      // Same day of the week as the deadline
      return targetDate.getDay() === entryDeadline.getDay();
    }

    case RecurrenceFrequency.Custom: {
      // Check if the target day-of-week is in the allowed days
      const daysOfWeek = entry.recurrence.daysOfWeek || [];
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
