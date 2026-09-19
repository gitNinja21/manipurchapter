import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { effectiveSchedule } from "./performanceServer";
import { attendanceReminder } from "./attendanceReminders";
import { workDateFor } from "./time";
import { sendAttendancePush } from "./push";

export async function reminderForUser(user: User, now = new Date()) {
  if (!user.active || !user.approved || user.mustChangePassword || user.role !== "EMPLOYEE") return null;
  const date = workDateFor(now);
  if (workDateFor(user.createdAt) > date) return null;
  const [open, record, schedule, leave, arrival, override] = await Promise.all([
    prisma.attendanceRecord.findFirst({where:{userId:user.id,clockInAt:{not:null},clockOutAt:null},orderBy:{workDate:"desc"}}),
    prisma.attendanceRecord.findUnique({where:{userId_workDate:{userId:user.id,workDate:date}}}),
    effectiveSchedule(prisma,user,date),
    prisma.staffRequest.findFirst({where:{userId:user.id,kind:"LEAVE",status:"APPROVED",fromDate:{lte:date},toDate:{gte:date}}}),
    prisma.arrivalAttempt.findUnique({where:{userId_workDate:{userId:user.id,workDate:date}}}),
    prisma.scheduledShift.findUnique({where:{userId_workDate:{userId:user.id,workDate:date}}}),
  ]);
  const monday = new Date(`${date}T12:00:00+05:30`).getUTCDay() === 1;
  // Legacy accounts without policy still use their configured arrival deadline.
  const off = !override && (monday || (!!user.weeklyScheduleJson && !schedule));
  const midnight = +new Date(`${date}T00:00:00+05:30`);
  const start = off ? null : schedule?.start ?? new Date(midnight + user.attendanceLatestMinute * 60000);
  const end = off ? null : schedule?.end ?? new Date(midnight + user.attendanceEndMinute * 60000);
  const repeatRaw = Number(process.env.ATTENDANCE_REMINDER_REPEAT_MINUTES ?? "5");
  const repeatMinutes = Number.isFinite(repeatRaw) && repeatRaw >= 0 ? Math.max(1,repeatRaw) : 5;
  return attendanceReminder({now, scheduledStart:start,scheduledEnd:end,onLeave:!!leave,
    arrived:!!arrival,recordedToday:!!record?.clockInAt,
    open:open?.clockInAt ? {id:open.id,clockInAt:open.clockInAt,scheduledEndAt:open.scheduledEndAt} : null,
    repeatMinutes:repeatRaw === 0 ? 0 : repeatMinutes});
}

export async function dispatchAttendanceReminders(now = new Date()) {
  const users = await prisma.user.findMany({where:{role:"EMPLOYEE",active:true,approved:true,mustChangePassword:false}});
  for (const user of users) {
    const reminder = await reminderForUser(user, now);
    if (!reminder) continue;
    // Unique constraint claims a slot across processes; it is never sent twice.
    try {
      await prisma.notification.create({data:{userId:user.id,kind:reminder.kind,entityKey:reminder.key,
        title:reminder.message,href:reminder.href}});
    } catch (error) {
      if ((error as {code?:string}).code === "P2002") continue;
      throw error;
    }
    // Recheck after claiming to avoid notifying somebody who has just clocked in/out.
    const latest = await reminderForUser(user, now);
    if (latest?.kind === reminder.kind && latest.key === reminder.key) await sendAttendancePush(user.id, reminder);
  }
}

const worker = globalThis as typeof globalThis & { attendanceReminderTimer?: ReturnType<typeof setInterval> };
export function startAttendanceReminderWorker() {
  if (worker.attendanceReminderTimer) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await dispatchAttendanceReminders(); }
    catch { console.warn("Attendance reminder check failed; will retry on the next minute."); }
    finally { running = false; }
  };
  worker.attendanceReminderTimer = setInterval(() => void tick(), 60000);
  worker.attendanceReminderTimer.unref();
  void tick();
}
