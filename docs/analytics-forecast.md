# Hourly forecast

The Forecast screen uses `/api/analytics/forecast/rolling`, restricted to the existing captain/admin analytics roles.

- A single selected date uses up to 90 preceding days with recorded visits.
- A date range uses only days within that range: the first recorded day trains the second, and the training history expands for each later day.
- Missing days are excluded, not assumed to be zero demand. No manual completeness confirmation is required.
- Hourly guest and sales baselines are recency-weighted means (21-day half-life). Sales use their own arrival-hour profile.
- Each hour's prediction adapts using cumulative observations strictly before that hour. For today, remaining hours use observations from completed hours only. Partial current-hour actuals are displayed but not scored.
- Error is actual minus predicted. MAE averages absolute errors across all completed calendar hours, including zero-traffic hours.
- Historical output is a retrospective replay using current saved records, not an immutable record of what was known at the time. Sales represent item values allocated to visit arrival time; bill updates and late entries can change historical results. Running bills are provisional.
- The screen refreshes every minute. Predictions change as completed-hour observations become available. Previous immutable forecast tables and APIs remain intact but are not used by this simplified screen.

No new database migration is required for this screen.
