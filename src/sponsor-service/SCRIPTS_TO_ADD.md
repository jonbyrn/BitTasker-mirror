# Package.json Scripts to Add

Add these scripts to your `package.json` to make deployment easier.

## Add to Scripts Section

```json
{
	"scripts": {
		"...existing scripts...": "",

		"docker:up": "docker-compose -f src/sponsor-service/docker-compose.yml up -d",
		"docker:down": "docker-compose -f src/sponsor-service/docker-compose.yml down",
		"docker:logs": "docker-compose -f src/sponsor-service/docker-compose.yml logs -f sponsor-service",
		"docker:test": "curl http://localhost:3001/health",

		"workers:dev": "cd src/sponsor-service && wrangler dev",
		"workers:deploy": "cd src/sponsor-service && wrangler deploy --env production",
		"workers:deploy-staging": "cd src/sponsor-service && wrangler deploy --env staging",
		"workers:logs": "cd src/sponsor-service && wrangler tail --env production",
		"workers:db-init": "cd src/sponsor-service && wrangler d1 execute sponsor-prod --file=src/workers/d1-schema.sql",
		"workers:test": "curl https://sponsor-service.workers.dev/health",

		"sponsor:test": "bash src/sponsor-service/test-deployment.sh",
		"sponsor:test-docker": "bash src/sponsor-service/test-deployment.sh docker",
		"sponsor:test-workers": "bash src/sponsor-service/test-deployment.sh workers",
		"sponsor:test-both": "bash src/sponsor-service/test-deployment.sh both"
	}
}
```

## Usage

### Docker Deployment

```bash
# Start Docker environment
npm run docker:up

# View logs
npm run docker:logs

# Test Docker endpoint
npm run docker:test

# Stop Docker
npm run docker:down
```

### Workers Deployment

```bash
# Development
npm run workers:dev

# Production deployment
npm run workers:deploy

# Staging deployment
npm run workers:deploy-staging

# View production logs
npm run workers:logs

# Initialize database
npm run workers:db-init

# Test Workers endpoint
npm run workers:test
```

### Testing

```bash
# Test both deployments
npm run sponsor:test-both

# Test Docker only
npm run sponsor:test-docker

# Test Workers only
npm run sponsor:test-workers
```

## Environment-Specific Scripts

For more complex setups, create separate npm scripts:

```json
{
	"scripts": {
		"sponsor:migrate:prepare": "bash src/sponsor-service/scripts/prepare-migration.sh",
		"sponsor:migrate:execute": "bash src/sponsor-service/scripts/execute-migration.sh",
		"sponsor:migrate:verify": "bash src/sponsor-service/scripts/verify-migration.sh",
		"sponsor:backup": "bash src/sponsor-service/scripts/backup-database.sh",
		"sponsor:restore": "bash src/sponsor-service/scripts/restore-database.sh"
	}
}
```

## GitHub Actions Workflow Example

Create `.github/workflows/sponsor-service-deploy.yml`:

```yaml
name: Deploy Sponsor Service

on:
  push:
    branches:
      - main
    paths:
      - 'src/sponsor-service/**'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

jobs:
  deploy-workers:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run sponsor:test-docker || true

      - name: Deploy to Cloudflare Workers
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: npm run workers:deploy-${{ github.event.inputs.environment || 'staging' }}

      - name: Verify deployment
        run: npm run sponsor:test-workers
```

## Manual Deployment Checklist

```bash
# 1. Prepare
npm install
npm run build
npm run lint
npm test

# 2. Docker (if using)
npm run docker:up
npm run docker:test

# 3. Workers
npm run workers:dev &  # Terminal 1
# Test locally...

# 4. Deploy
npm run workers:deploy

# 5. Test
npm run sponsor:test-both

# 6. Monitor
npm run docker:logs &  # Terminal 2
npm run workers:logs &  # Terminal 3
```

## Useful Shell Aliases

Add to `.bashrc` or `.zshrc`:

```bash
# Docker management
alias sponsor-docker-up='npm run docker:up'
alias sponsor-docker-down='npm run docker:down'
alias sponsor-docker-logs='npm run docker:logs'

# Workers management
alias sponsor-workers-dev='npm run workers:dev'
alias sponsor-workers-deploy='npm run workers:deploy'
alias sponsor-workers-logs='npm run workers:logs'

# Testing
alias sponsor-test='npm run sponsor:test-both'
alias sponsor-test-docker='npm run sponsor:test-docker'
alias sponsor-test-workers='npm run sponsor:test-workers'

# Quick checks
alias sponsor-health='curl http://localhost:3001/health 2>/dev/null | jq . && echo "Docker: OK" || echo "Docker: DOWN"'
alias sponsor-health-workers='curl -s https://sponsor-service.workers.dev/health | jq . && echo "Workers: OK" || echo "Workers: DOWN"'
```

## Makefile Alternative

Create `Makefile` in project root:

```makefile
.PHONY: sponsor-docker-up sponsor-docker-down sponsor-workers-dev \
        sponsor-workers-deploy sponsor-test sponsor-test-both

sponsor-docker-up:
	docker-compose -f src/sponsor-service/docker-compose.yml up -d

sponsor-docker-down:
	docker-compose -f src/sponsor-service/docker-compose.yml down

sponsor-docker-logs:
	docker-compose -f src/sponsor-service/docker-compose.yml logs -f sponsor-service

sponsor-workers-dev:
	cd src/sponsor-service && wrangler dev

sponsor-workers-deploy:
	cd src/sponsor-service && wrangler deploy --env production

sponsor-workers-logs:
	cd src/sponsor-service && wrangler tail --env production

sponsor-test:
	bash src/sponsor-service/test-deployment.sh both

sponsor-test-docker:
	bash src/sponsor-service/test-deployment.sh docker

sponsor-test-workers:
	bash src/sponsor-service/test-deployment.sh workers

sponsor-test-all: sponsor-docker-up sponsor-test

# Development workflow
sponsor-dev: sponsor-docker-up
	cd src/sponsor-service && wrangler dev

# Production deployment
sponsor-deploy: sponsor-test
	cd src/sponsor-service && wrangler deploy --env production

# Backup database
sponsor-backup:
	docker exec sponsor-service-db pg_dump \
		-U sponsor sponsor_service > backup_$(shell date +%s).sql
```

Usage:

```bash
make sponsor-docker-up
make sponsor-workers-deploy
make sponsor-test-both
make sponsor-backup
```

## Documentation Scripts

Add documentation generation script:

````bash
#!/bin/bash
# scripts/generate-sponsor-docs.sh

echo "# Sponsor Service Deployment Guide" > SPONSOR_DEPLOYMENT_GUIDE.md
echo "" >> SPONSOR_DEPLOYMENT_GUIDE.md
echo "Generated: $(date)" >> SPONSOR_DEPLOYMENT_GUIDE.md
echo "" >> SPONSOR_DEPLOYMENT_GUIDE.md

echo "## Docker Deployment" >> SPONSOR_DEPLOYMENT_GUIDE.md
echo '```bash' >> SPONSOR_DEPLOYMENT_GUIDE.md
echo "npm run docker:up" >> SPONSOR_DEPLOYMENT_GUIDE.md
echo '```' >> SPONSOR_DEPLOYMENT_GUIDE.md

# ... add more documentation sections
````

## Continuous Integration

### Pre-commit Hook

Create `.husky/pre-commit`:

```bash
#!/bin/sh

# Sponsor service checks
if git diff --cached --name-only | grep -q "src/sponsor-service"; then
  echo "Running sponsor service checks..."
  npm run sponsor:test-docker || exit 1
fi
```

---

**Note**: After adding these scripts, run:

```bash
npm install  # Update package.json
git add package.json
git commit -m "Add sponsor service deployment scripts"
```
