# Automatic clock-out

From 27 September 2026, open shifts are closed at 22:45 IST. The production worker checks every minute and on server startup, using the exact 22:45 timestamp even if it runs late. It is independent of reminder notifications. Existing completed attendance and dates before rollout are unchanged. Arrivals at or after the cutoff are not assigned a departure before arrival; those require correction.

Automatic departures are visibly labelled, have no face/location verification, and create an audit and employee notification. Existing payroll rules and rejected attendance decisions remain intact. An approved attendance correction replaces the automatic departure and clears the label. Staff who actually work beyond 22:45 must request a correction for the actual departure.

The normal production start applies the migration. Set AUTO_CLOCK_OUT_ENABLED=false only to disable the worker (e.g. in isolated tests); development requires explicit true. If the server is unavailable at 22:45, it catches up on startup.

Each automatic clock-out deducts 0.5 performance points. The monthly Performance view shows missed clock-out counts and deducted points per employee; Points history shows each date. The incident comes from the immutable audit, so later time corrections do not erase it. Deduplication by employee and work date prevents repeated deductions. Manual clock-outs do not create an incident. Salary calculation is unchanged.
