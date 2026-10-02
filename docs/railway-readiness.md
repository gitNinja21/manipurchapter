# Railway deployment readiness

The repository's `railway.json` sets `/api/health` as the deployment healthcheck, with a 120-second startup allowance. It uses the existing `npm start` command. The endpoint is public, dynamically checks the application's User table, returns HTTP 200 when accessible and HTTP 503 otherwise, and disables caching. No database details are returned.

After deploying, inspect Railway's deployment details to confirm it loaded this configuration. If the service uses a different config-file path, configure `/api/health` and a 120-second healthcheck timeout in the dashboard. This timeout is a maximum startup allowance, not a delay once the app is ready. A 5–10 second timeout is too tight for migrations and cold startup.

Keep `prisma migrate deploy` and the seed in the start command. SQLite lives on the attached persistent volume, which Railway does not mount in pre-deploy containers. Do not move these operations into pre-deploy. Leave the dashboard Pre-deploy Command empty for this setup.

A readiness check prevents a deployment being marked ready before Next.js and its database are accessible. It does not eliminate the interruption while Railway transfers an attached volume from the old container to the new one. Railway cannot keep both deployments attached to the same volume simultaneously. Deploy outside shift-change times to reduce disruption. Removing this volume dependency requires separately planned database and uploaded-file storage changes.

Railway deployment healthchecks are not ongoing uptime monitoring. Keep Serverless disabled so attendance workers can run when nobody is browsing.

References:
- https://docs.railway.com/deployments/healthchecks
- https://docs.railway.com/deployments/pre-deploy-command
