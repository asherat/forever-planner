const SHORT_DATE_TIME: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };

export function shortDateTime(milliseconds: number): string {
  return new Date(milliseconds).toLocaleString(undefined, SHORT_DATE_TIME);
}
