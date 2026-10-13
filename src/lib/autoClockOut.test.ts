import test from "node:test";
import assert from "node:assert/strict";
import { closeForgottenShifts, startAutoClockOutWorker } from "./autoClockOut";
import { prisma } from "./prisma";

test("retired automatic clock-out never accesses attendance or starts a timer, even with old deployment flag", async t => {
  const flag=process.env.AUTO_CLOCK_OUT_ENABLED, original=prisma.attendanceRecord.findMany;
  t.after(()=>{prisma.attendanceRecord.findMany=original;if(flag===undefined)delete process.env.AUTO_CLOCK_OUT_ENABLED;else process.env.AUTO_CLOCK_OUT_ENABLED=flag;});
  prisma.attendanceRecord.findMany=(()=>{throw new Error("Automatic clock-out must not access attendance");}) as typeof original;
  process.env.AUTO_CLOCK_OUT_ENABLED="true";
  assert.equal(await closeForgottenShifts(),0);
  const worker=globalThis as typeof globalThis & {autoClockOutTimer?:ReturnType<typeof setInterval>};
  worker.autoClockOutTimer=setInterval(()=>{},60000);
  startAutoClockOutWorker();
  assert.equal(worker.autoClockOutTimer,undefined);
  startAutoClockOutWorker();
  assert.equal(worker.autoClockOutTimer,undefined);
});
