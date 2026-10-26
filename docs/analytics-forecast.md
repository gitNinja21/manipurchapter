# Analytics forecast

Analytics → Forecast is available to captain and admin accounts. No third-party AI service or new API key is required. Deploy migration `20261026000000_analytics_forecasts` before serving the new build (the Railway start command already runs migrations).

## First use

Confirm at least three prior trading dates after checking all visits and completed bills. Explicitly mark genuinely closed dates as closed; a complete, open date with no customers is a genuine zero. Existing records are not automatically certified. Unfinished bills block confirmation. Visit changes invalidate the stored fingerprint until re-confirmed. These controls do not modify payroll.

## Hourly updates

The production server checks every minute and saves the first forecast in each IST hour for today and tomorrow. It also runs on startup. The dashboard polls every minute and offers Update this hour. Repeated calls preserve the same hour's snapshot; missed hours during downtime are not backfilled. `ANALYTICS_FORECAST_ENABLED=false` disables the automatic worker (manual updates remain available). No customer messages or calls are sent.

Today’s forecast = observed arrivals + revised remaining arrivals. Observations count each live visit once, including running visits. Recorded sales include current running bill values and exclude bill-level discounts/taxes not stored in the app. These are provisional, not final revenue. An arrival profile from historical data estimates the share of the day elapsed. The model compares actual vs expected guest pace, shrinks the correction using expected guests / (expected guests + 15), and bounds the multiplier to 0.5–2. Sales use the same elapsed share with their own observed-value correction. Missing entries and late order entry can bias the result; this version does not know true occupancy, stockouts or inventory.

Tomorrow uses confirmed data plus a damped provisional signal from today (25% of the reliability-weighted pace adjustment). If today is already confirmed complete it enters history directly and receives no additional provisional multiplier. Closed days contribute no pace signal. Forecasts assume the target date is open; restaurant closure settings in employee attendance are not used for customer demand.

## Learning and validation

Use up to 90 days of confirmed data. Recent demand uses exponential recency weights with a 21-day half-life. A candidate triples same-weekday weights. Walk-forward validation begins after three historical days and uses only preceding days at each trial. Select the candidate only after at least five validation days and a greater than 10% reduction in guest MAE; otherwise retain the simpler baseline. Sales, item mix and hourly profile use the selected weights. This is adaptive forecasting, not reinforcement learning, and it does not yet fit weather, festival or month-end effects.

Broad initial planning ranges use 50% of the point estimate with minimum widths. After sufficient validation, use the 80th percentile of absolute historical errors with a minimum proportional width. Intraday widths narrow with elapsed share but retain floors. These are not calibrated confidence intervals. Half portions count as 0.5; water is separate and packing excluded from item rankings but included in sales.

## Honest history

Hourly snapshots are unique by target date and IST hour and never overwritten. A separate original daily forecast is saved for tomorrow from 23:30 IST, or earlier using Save original daily forecast. Each snapshot stores model version, source dates, estimates and validation scores. Historical actuals are displayed only for currently confirmed complete days; changed or closed dates are not scored. Actual minus prediction is the displayed error. Historical validation and live forecast accuracy are different: live errors begin only after deployment and saving predictions.

Tests: `npm test`, `npm run build`, `node --import tsx scripts/test-analytics-forecast.ts`. The integration script uses disposable SQLite and mocked/local service state, never production. `--preview` keeps its isolated local server available for UI checks.
