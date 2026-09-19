export async function register() {
  // Railway's persistent Next server runs this without requiring an open browser.
  // Never start dispatch during builds, tests or development unless explicitly enabled.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build" &&
      process.env.ATTENDANCE_REMINDERS_ENABLED !== "false" &&
      (process.env.NODE_ENV === "production" || process.env.ATTENDANCE_REMINDERS_ENABLED === "true")) {
    const { startAttendanceReminderWorker } = await import("./lib/attendanceReminderServer");
    startAttendanceReminderWorker();
  }
}
