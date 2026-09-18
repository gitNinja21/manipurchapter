import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, validRange, weekStart } from "./reporting";
test("report ranges validate real calendar dates and use Monday as week start", () => {
  assert.equal(validRange("2026-09-01", "2026-09-30"), true);
  assert.equal(validRange("2026-02-30", "2026-03-01"), false);
  assert.equal(validRange("2026-09-20", "2026-09-01"), false);
  assert.equal(validRange("", "2026-09-01"), false);
  assert.equal(weekStart("2026-09-20"), "2026-09-14");
  assert.equal(weekStart("2026-09-14"), "2026-09-14");
});
test("CSV preserves names and numbers while neutralising formula cells", () => {
  assert.equal(csvCell('A, "B"'), '"A, ""B"""');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell("\t@sum(1)"), '"\'\t@sum(1)"');
  assert.equal(csvCell(900), '"900"');
  assert.equal(csvCell(null), '""');
});
