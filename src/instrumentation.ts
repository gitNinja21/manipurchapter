export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build" &&
      process.env.NODE_ENV === "production" && process.env.ATTENDANCE_SMS_ENABLED === "true") {
    const { startAttendanceSmsWorker } = await import("./lib/attendanceSms");
    startAttendanceSmsWorker();
  }
  if(process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build" && process.env.NODE_ENV === "production" && process.env.ANNOUNCEMENT_VOICE_ENABLED === "true") {
    const {startAnnouncementVoiceWorker}=await import("./lib/announcementVoice");
    startAnnouncementVoiceWorker();
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build" &&
      process.env.AUTO_CLOCK_OUT_ENABLED !== "false" &&
      (process.env.NODE_ENV === "production" || process.env.AUTO_CLOCK_OUT_ENABLED === "true")) {
    const { startAutoClockOutWorker } = await import("./lib/autoClockOut");
    startAutoClockOutWorker();
  }
  // Railway's persistent Next server runs this without requiring an open browser.
  // Never start dispatch during builds, tests or development unless explicitly enabled.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build" &&
      process.env.ATTENDANCE_REMINDERS_ENABLED !== "false" &&
      (process.env.NODE_ENV === "production" || process.env.ATTENDANCE_REMINDERS_ENABLED === "true")) {
    const { startAttendanceReminderWorker } = await import("./lib/attendanceReminderServer");
    startAttendanceReminderWorker();
  }
}
