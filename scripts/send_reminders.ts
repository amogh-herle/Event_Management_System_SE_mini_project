/**
 * Scheduled Event Reminders CLI Runner (FR-009b / ST_02)
 *
 * Usage:
 *   npx tsx scripts/send_reminders.ts [windowHours] [referenceDateIso]
 *
 * Example:
 *   npx tsx scripts/send_reminders.ts 24
 */

import { sendEventReminders } from "../lib/registration";

async function main() {
  const windowHours = process.argv[2] ? Number(process.argv[2]) : 24;
  const refDateStr = process.argv[3];
  const referenceDate = refDateStr ? new Date(refDateStr) : new Date();

  console.log(`[reminders] Processing event reminders for window: ${windowHours} hours...`);
  console.log(`[reminders] Reference date: ${referenceDate.toISOString()}`);

  const result = await sendEventReminders({ windowHours, referenceDate });

  console.log(`[reminders] Completed!`);
  console.log(`  Events in window: ${result.eventsProcessed}`);
  console.log(`  Reminders sent:   ${result.remindersSent}`);

  if (result.notifications.length > 0) {
    console.log(`[reminders] Dispatched reminders:`);
    for (const n of result.notifications) {
      console.log(`  - Sent to ${n.email} for event "${n.eventName}" (${n.eventDate})`);
    }
  }
}

main().catch((err) => {
  console.error("[reminders] Fatal error processing reminders:", err);
  process.exit(1);
});
