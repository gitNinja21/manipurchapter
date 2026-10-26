CREATE TABLE "AnalyticsDayReview" (
 "date" TEXT NOT NULL PRIMARY KEY, "status" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "reviewedBy" TEXT NOT NULL,
 "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AnalyticsForecast" (
 "date" TEXT NOT NULL PRIMARY KEY, "modelVersion" TEXT NOT NULL,
 "forecastJson" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AnalyticsHourlyForecast" (
 "id" TEXT NOT NULL PRIMARY KEY, "date" TEXT NOT NULL,
 "asOfHour" TEXT NOT NULL, "forecastJson" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AnalyticsHourlyForecast_date_asOfHour_key" ON "AnalyticsHourlyForecast"("date","asOfHour");
CREATE INDEX "AnalyticsHourlyForecast_date_createdAt_idx" ON "AnalyticsHourlyForecast"("date","createdAt");
