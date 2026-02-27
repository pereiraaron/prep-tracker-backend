const TIMEZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

export const toISTDateString = (date: Date): string => date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

export const toISTMidnight = (date: Date): Date => {
  const dateStr = toISTDateString(date);
  return new Date(`${dateStr}T00:00:00.000${IST_OFFSET}`);
};
