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

## Feature-aware model selection

The graph and date-range workflow are unchanged. Guest and sales forecasts independently select between the original recency baseline, calendar similarity, and calendar plus weather similarity. Similarity weights retain a 25% floor to avoid relying on a lone matching weekday. These are regularized analogue models, not fitted causal coefficients.

Calendar features: weekday, weekend, holiday/festival tags from the existing admin calendar, month phase (1–10, 11–20, 21–end), and days until month-end. Month features become eligible only with three distinct months and at least five days in each phase. Calendar overrides describe context, not restaurant closures.

Weather features: hourly temperature, precipitation (log-scaled), and humidity. Daytime (06–17), evening (18–23), and overnight periods are kept separate for lagged readings. Missing observations remain unknown. Duplicate provider readings within a visit hour are counted once. An hour's retrospective prediction uses readings from earlier hours only, at most three hours old. Today's remaining hours can use WeatherAPI hourly forecasts from the existing WEATHERAPI_KEY; requests are cached for 30 minutes and failures for five minutes. No credentials are sent to clients. Provider errors fall back to available lagged observations and calendar features.

Selection uses expanding-window validation on up to 14 preceding days, each trained on its own earlier days. At least three validation days and a 5% MAE improvement are required to replace the simpler model. Selection is independent for guests and sales. Validation never uses the selected target day's results. New forecast weather cannot change completed-hour scores. Month-feature eligibility is recomputed inside each validation fold.

Past days containing running bills are excluded from training. A day of completed bills is not proof that the whole trading day was recorded. Missing days are still excluded rather than treated as closures. Historical weather snapshots only exist at visits; they cannot establish conditions during all empty hours. Historical weather replay uses lagged observed conditions, not archived weather forecasts, so it does not measure historical forecast-provider accuracy.

`node --import tsx scripts/evaluate-forecast-features.ts /path/to/hourly-days.json` compares candidates and the automatically selected model chronologically. Input contains one anonymous HourDay per date, with 24 guest and sales values plus optional weather/calendar fields. Do not commit customer exports or API keys.
