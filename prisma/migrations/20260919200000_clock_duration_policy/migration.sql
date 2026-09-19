ALTER TABLE "User" ADD COLUMN "weeklyScheduleJson" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN "shiftDurationMinutes" INTEGER NOT NULL DEFAULT 540;
UPDATE "User" SET "attendancePolicyFrom" = '2026-09-19', "attendanceStartMinute" = 600, "attendanceLatestMinute" = 600, "attendanceAllowEarly" = true WHERE "id" IN ('cmu5dihu2000a95shpwsbfh0j', 'cmu5dgdgf000995sh4n7sv3cz');
UPDATE "User" SET "attendancePolicyFrom" = '2026-09-19', "attendanceStartMinute" = 660, "attendanceLatestMinute" = 660, "attendanceAllowEarly" = true,
"weeklyScheduleJson" = '{"5":{"start":780,"latest":780,"duration":420,"unpaidBreak":60},"6":{"start":660,"latest":660,"duration":540,"unpaidBreak":0},"0":{"start":660,"latest":660,"duration":540,"unpaidBreak":0}}'
WHERE "id" = 'cmu5cut44000895sh1vc465mm';
