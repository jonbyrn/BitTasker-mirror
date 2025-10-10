# Cloudflare Workers Deployment Guide

## Overview

This project uses **Cloudflare Workers Sites** to serve a static SvelteKit application built with `@sveltejs/adapter-static`.

### Why Workers Sites?

- ✅ **Capacitor Compatibility**: Required for mobile app builds
- ✅ **Client-Side Routing**: SPA routing with fallback to `index.html`
- ✅ **Full Control**: Custom Worker logic for serving static assets
- ✅ **Dynamic Routes**: Client-side routing handles all dynamic routes

## Architecture

```
SvelteKit (adapter-static) → Build → Cloudflare Workers Sites → Edge Network
                              ↓
                          ./build/
                            ├── index.html
                            ├── _app/
                            └── ...
```

## Configuration Files

### `wrangler.toml`
Main configuration for Cloudflare Workers:
- Worker name and compatibility date
- Static files bucket location (`./build`)
- Environment variables
- Environment-specific configurations

### `workers-site/index.js`
Worker script that:
- Serves static files from KV storage
- Handles SPA routing (fallback to `index.html`)
- Adds security headers
- Implements caching strategies

### `svelte.config.js`
SvelteKit configuration:
- Uses `adapter-static` for static builds
- Sets `fallback: 'index.html'` for SPA routing
- Outputs to `./build` directory

## Deployment

### Prerequisites

1. **Cloudflare Account**: Sign up at https://dash.cloudflare.com
2. **Wrangler CLI**: Already installed in this project
3. **Authentication**: Run `wrangler login` to authenticate

### Deploy to Development

```bash
npm run deploy:workers
```

This deploys to: `worker.dev.bittasker.com`

### Deploy to Production

```bash
npm run deploy:workers:production
```

This deploys to: `bittasker.com`

## Environment Variables

### Non-Sensitive Variables

Add to `wrangler.toml` under `[vars]`:

```toml
[vars]
VITE_CLIENT_URL = "https://worker.dev.bittasker.com/"
VITE_API_URL = "https://api.dev.bittasker.com"

[env.production.vars]
VITE_CLIENT_URL = "https://bittasker.com/"
VITE_API_URL = "https://api.bittasker.com"
```

### Sensitive Variables (Secrets)

Use Wrangler CLI:

```bash
# For development
wrangler secret put VITE_BREEZ_API_KEY

# For production
wrangler secret put VITE_BREEZ_API_KEY --env production
```

### Bulk Upload Secrets

Create a script to upload multiple secrets from your `.env` file:

```bash
#!/bin/bash
# upload-secrets.sh

SECRETS=(
  "VITE_BREEZ_API_KEY"
  "VITE_BSCSCAN_API_KEY"
  "VITE_CLOUDFLARE_SECRETKEY"
  "VITE_X_CLIENT_SECRET"
  # Add more secrets here
)

set -a
source .env
set +a

for SECRET in "${SECRETS[@]}"; do
  echo "Uploading $SECRET..."
  echo "${!SECRET}" | wrangler secret put "$SECRET"
done
```

## Custom Domains

### Setup in Cloudflare Dashboard

1. Navigate to **Workers & Pages** → **bittasker-dev-worker**
2. Go to **Settings** → **Triggers**
3. Click **Add Custom Domain** or **Add Route**

### Development Domain

- **Domain**: `worker.dev.bittasker.com`
- **Route**: `worker.dev.bittasker.com/*`

### Production Domain

- **Domain**: `bittasker.com`
- **Route**: `bittasker.com/*`
- **Include**: `www.bittasker.com/*` (if needed)

## How Dynamic Routes Work

1. **User navigates to** `/dashboard/task/123`
2. **Worker checks** if `/dashboard/task/123` exists as a static file
3. **Not found** → Worker serves `index.html` with status 200
4. **SvelteKit client-side router** takes over and renders the correct page
5. **Result**: Dynamic route works seamlessly

## Monitoring & Debugging

### View Logs

```bash
# Tail logs in real-time
wrangler tail

# Tail production logs
wrangler tail --env production
```

### Check Deployment Status

```bash
# List deployments
wrangler deployments list

# View specific deployment
wrangler deployments view <deployment-id>
```

### Test Locally

```bash
# Run Worker locally
wrangler dev

# Test with production environment
wrangler dev --env production
```

## Troubleshooting

### Issue: Dynamic routes return index

**Solution**: Ensure `index.html` exists in your build output and `svelte.config.js` has `fallback: 'index.html'`.

### Issue: Environment variables not available

**Solution**: 
- Check they're defined in `wrangler.toml` under `[vars]`
- For secrets, use `wrangler secret put`
- Redeploy after adding variables

### Issue: Changes not reflecting after deployment

**Solution**:
- Wait 2-3 minutes for propagation
- Clear Cloudflare cache in dashboard
- Use `wrangler tail` to verify new deployment

### Issue: Worker name conflicts

**Solution**: 
- Check your existing worker name in Cloudflare dashboard
- Update `name` in `wrangler.toml` to match
- Or rename the worker in the dashboard

## Performance Optimization

### Caching Strategy

The Worker implements:
- **Browser Cache**: 30 days for static assets
- **Edge Cache**: 30 days at Cloudflare edge
- **Cache Headers**: Automatic for all static files

### Security Headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main
      - dev

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'dev' }}
```

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [SvelteKit Static Adapter](https://kit.svelte.dev/docs/adapter-static)
- [KV Asset Handler](https://github.com/cloudflare/kv-asset-handler)

## Support

For issues specific to:
- **Cloudflare Workers**: Check Cloudflare dashboard logs
- **SvelteKit Build**: Check build output in `./build`
- **Deployment**: Use `wrangler tail` for real-time logs

