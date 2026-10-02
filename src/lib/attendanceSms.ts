import twilio from "twilio";
import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { effectiveSchedule } from "./performanceServer";
import { workDateFor } from "./time";
import { voicePhone } from "./announcementVoice";

export function attendanceSmsConfig() {
  if (process.env.ATTENDANCE_SMS_ENABLED !== "true") return null;
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = voicePhone(process.env.TWILIO_SMS_FROM ?? null);
  try {
    const url = new URL(process.env.ATTENDANCE_SMS_BASE_URL || "");
    if (!sid || !token || url.protocol !== "https:" || url.username || url.password ||
        (messagingServiceSid ? !/^MG[0-9a-f]{32}$/i.test(messagingServiceSid) : !from)) return null;
    return { sid, token, origin: url.origin, sender: messagingServiceSid ? { messagingServiceSid } : { from: from! } };
  } catch { return null; }
}

export function attendanceSmsBody(origin: string) {
  return `Manipur Chapter: You have not clocked in. Running late? Apply: ${origin}/employee/team?view=requests&kind=LATE_ARRIVAL\nOn leave? Apply: ${origin}/employee/team?view=requests&kind=LEAVE`;
}

export function arrivalSmsDue(now: Date, start: Date | null, end: Date | null) {
  return !!start && !!end && +now >= +start + 15 * 60000 && +now < +end;
}

export async function eligibleForArrivalSms(user: User, now: Date) {
  const date = workDateFor(now);
  if (!user.active || !user.approved || user.mustChangePassword || user.role !== "EMPLOYEE" || workDateFor(user.createdAt) > date) return false;
  const [schedule, override, record, arrival, request] = await Promise.all([
    effectiveSchedule(prisma, user, date),
    prisma.scheduledShift.findUnique({ where: { userId_workDate: { userId: user.id, workDate: date } } }),
    prisma.attendanceRecord.findUnique({ where: { userId_workDate: { userId: user.id, workDate: date } } }),
    prisma.arrivalAttempt.findUnique({ where: { userId_workDate: { userId: user.id, workDate: date } } }),
    prisma.staffRequest.findFirst({ where: { userId: user.id, fromDate: { lte: date }, toDate: { gte: date },
      kind: { in: ["LEAVE", "LATE_ARRIVAL", "GPS_CLOCK_IN"] }, status: { in: ["PENDING", "APPROVED"] } } }),
  ]);
  if (record?.clockInAt || arrival || request) return false;
  const monday = new Date(`${date}T12:00:00+05:30`).getUTCDay() === 1;
  if (!override && (monday || (!!(user.weeklyScheduleJson || user.masterScheduleJson) && !schedule))) return false;
  const midnight = +new Date(`${date}T00:00:00+05:30`);
  return arrivalSmsDue(now, schedule?.arrivalStart ?? new Date(midnight + user.attendanceLatestMinute * 60000),
    schedule?.end ?? new Date(midnight + user.attendanceEndMinute * 60000));
}

type SendSms = (options: { to: string; body: string; from?: string; messagingServiceSid?: string }) => Promise<{ sid: string }>;
export async function dispatchAttendanceSms(now = new Date(), send?: SendSms) {
  const config = attendanceSmsConfig();
  if (!config) return;
  const date = workDateFor(now);
  const users = await prisma.user.findMany({ where: { role: "EMPLOYEE", active: true, approved: true, mustChangePassword: false } });
  const client = send ? null : twilio(config.sid, config.token, { autoRetry: false, timeout: 15000 });
  for (const user of users) {
    if (!await eligibleForArrivalSms(user, now)) continue;
    let job;
    try {
      // Claim before contacting Twilio. Retries/restarts cannot create another paid send.
      job = await prisma.attendanceSms.create({ data: { userId: user.id, workDate: date } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") continue;
      throw error;
    }
    const latest = await prisma.user.findUnique({ where: { id: user.id } });
    if (!latest || !await eligibleForArrivalSms(latest, now)) {
      await prisma.attendanceSms.update({ where: { id: job.id }, data: { status: "SKIPPED" } });
      continue;
    }
    const to = voicePhone(latest.phone);
    if (!to) {
      await prisma.attendanceSms.update({ where: { id: job.id }, data: { status: "INVALID_NUMBER" } });
      console.warn(`Attendance SMS ${job.id}: missing or invalid employee number.`);
      continue;
    }
    let result;
    try {
      result = await (send ?? (options => client!.messages.create(options)))({ to, body: attendanceSmsBody(config.origin), ...config.sender });
    } catch (error) {
      // A timeout may follow an accepted message. Never automatically resend it.
      const code = (error as { code?: unknown }).code;
      const errorCode = typeof code === "number" ? String(code) : "UNKNOWN";
      await prisma.attendanceSms.update({ where: { id: job.id }, data: { status: "SEND_FAILED_OR_UNKNOWN", errorCode } });
      console.warn(`Attendance SMS ${job.id}: send failed or uncertain (${errorCode}); no automatic retry.`);
      continue;
    }
    // ACCEPTED means Twilio accepted the request, not confirmed handset delivery.
    await prisma.attendanceSms.update({ where: { id: job.id }, data: { status: "ACCEPTED", messageSid: result.sid } });
  }
}

const worker = globalThis as typeof globalThis & { attendanceSmsTimer?: ReturnType<typeof setInterval> };
export function startAttendanceSmsWorker() {
  if (worker.attendanceSmsTimer) return;
  if (!attendanceSmsConfig()) {
    console.warn("Attendance SMS is enabled but missing valid Twilio SMS sender credentials or HTTPS base URL.");
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await dispatchAttendanceSms(); }
    catch { console.warn("Attendance SMS worker failed; claimed messages will not be resent."); }
    finally { running = false; }
  };
  worker.attendanceSmsTimer = setInterval(() => void tick(), 60000);
  worker.attendanceSmsTimer.unref();
  void tick();
}
