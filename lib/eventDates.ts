/**
 * Event.date is stored as a UTC-midnight DateTime (the form only collects a
 * calendar day), so "has this event's day already gone by" is a comparison
 * of UTC calendar days, not of instants. Kept dependency-free so client
 * pages can import it without pulling in Prisma.
 */
export function isEventDatePast(date: Date | string, now: Date = new Date()): boolean {
  const eventDay = new Date(date);
  if (isNaN(eventDay.getTime())) return false;
  return eventDay.toISOString().slice(0, 10) < now.toISOString().slice(0, 10);
}
