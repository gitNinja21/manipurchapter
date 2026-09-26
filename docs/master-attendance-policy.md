# Master attendance policy — effective 26 September 2026 (IST)

The migration maps the fourteen requested employee codes to weekday-specific fixed start and finish times. Monday is off; Toki works Friday, Saturday and Sunday. Dated approved shifts override recurring times. Pre-effective-date records retain their original rules.

One-hour breaks are paid. Pankaj, Lachit and Hingnam have a 20% unpaid deduction; Gokul has 16⅔%. Everyone else has 0%. The percentage applies proportionally to actual regular and additional time. Full long shifts pay ten hours; shorter shifts use the same percentage.

The first fifteen minutes after scheduled arrival are paid grace. Finish time does not move when someone arrives late. For example, Pankaj arriving at 10:30 and leaving at 22:30 receives (12 hours + 15 minutes) × 80% = 9.8 paid regular hours. Fifteen minutes are recorded as late. No additional late salary penalty applies.

New records do not require manager talks and do not earn negative attendance points. Three late days in a calendar month show a warning. Five late days remove Best Employee eligibility for that month only. Counts reset each month. Earned points and bonus pay remain intact. Award ranking uses customer reviews, base-hour completion, referrals and bonus working days.

Additional paid hours accrue after fixed finish. Each eight additional hours earns the existing nine-hour bonus day's pay, with remaining hours carried forward. New-policy bonus days also earn one award point each. Full base-hour completion earns 0.5 points. Clock-outs after 22:45 still require approval of the later portion. GPS fallback approvals remain separate.

Deploy with the normal migration/start process. The migration audits corrections of snapshots already created from 26 September, preserving actual clock times, photos and approval decisions. Run `npm test`, `python3 scripts/test-master-migration.py`, `npm run build`, then `node scripts/test-master-policy.mjs` against a disposable test database.
