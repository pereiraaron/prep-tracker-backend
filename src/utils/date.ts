export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export const toDateString = (date: Date, timezone = DEFAULT_TIMEZONE): string =>
  date.toLocaleDateString("en-CA", { timeZone: timezone });

const getUtcOffset = (date: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const offset = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+05:30";
  return offset.replace("GMT", "") || "+00:00";
};

export const toMidnight = (date: Date, timezone = DEFAULT_TIMEZONE): Date => {
  const dateStr = toDateString(date, timezone);
  const offset = getUtcOffset(date, timezone);
  return new Date(`${dateStr}T00:00:00.000${offset}`);
};
