# Cloudflare Pages → Workers Migration Guide

## ✅ Migration Status

- [x] Code migrated to `adapter-cloudflare`
- [x] Wrangler configuration created
- [x] Build scripts updated
- [x] Local build tested successfully
- [ ] Deploy to Cloudflare Workers (requires permissions)
- [ ] Configure custom domains
- [ ] Update DNS records

## 📁 What Changed

### 1. SvelteKit Adapter
**File: `svelte.config.js`**
```diff
- import adapter from '@sveltejs/adapter-static';
+ import adapter from '@sveltejs/adapter-cloudflare';

- adapter: adapter({
-   fallback: 'index.html',
-   pages: 'build',
-   assets: 'build',
-   precompress: process.env.PRECOMPRESS === '1',
-   strict: true
- })
+ adapter: adapter({
+   routes: {
+     include: ['/*'],
+     exclude: ['/robots.txt', '/sitemap.xml', ...]
+   },
+   platformProxy: { ... }
+ })
```

### 2. Wrangler Configuration
**File: `wrangler.toml` (NEW)**
```toml
name = "bittasker-app"
main = "./.svelte-kit/cloudflare/_worker.js"
compatibility_date = "2024-12-01"

[assets]
directory = "./.svelte-kit/cloudflare/static"
binding = "ASSETS"

[env.development]
name = "bittasker-app-dev"
vars = { VITE_CLIENT_URL = "https://dev.bittasker.com" }

[env.production]  
name = "bittasker-app-prod"
vars = { VITE_CLIENT_URL = "https://bittasker.com" }
```

### 3. Updated Scripts
**File: `package.json`**
```json
{
  "scripts": {
    "wrangler:dev": "wrangler dev",
    "wrangler:deploy": "npm run build && wrangler deploy",
    "wrangler:deploy:dev": "npm run build && wrangler deploy --env development",
    "wrangler:deploy:prod": "npm run build && wrangler deploy --env production"
  }
}
```

## 🚀 Deployment Commands

### Local Development with Workers
```bash
# Build and test with Wrangler locally
npm run wrangler:build

# Run in development mode
npm run wrangler:dev
```

### Deploy to Cloudflare Workers
```bash
# Deploy to development environment
npm run wrangler:deploy:dev

# Deploy to production environment  
npm run wrangler:deploy:prod
```

## ⚠️ Requirements for Deployment

### 1. Cloudflare Account Permissions
You need admin access to:
- **Workers & Pages** section
- **DNS** management
- **Custom domains** configuration

### 2. Plan Limitations
- **Free Plan**: Workers work but **NO custom domains**
  - You'll get URLs like: `bittasker-app-dev.your-subdomain.workers.dev`
- **Paid Plan ($5/month)**: Required for custom domains
  - Enables: `dev.bittasker.com` and `master.bittasker.com`

### 3. Domain Configuration
Once you have permissions:

1. **Create Workers**:
   ```bash
   wrangler deploy --env development  # Creates dev worker
   wrangler deploy --env production   # Creates prod worker
   ```

2. **Add Custom Domains**:
   - Go to Workers → Triggers → Custom Domains
   - Add `dev.bittasker.com` → point to dev worker
   - Add `master.bittasker.com` → point to prod worker

3. **Update DNS**:
   - DNS → Records → Update CNAME/A records
   - Point domains to Workers instead of Pages

## 🔧 Build Output Structure

After `npm run build`, the following structure is generated:

```
.svelte-kit/cloudflare/
├── _worker.js              # Main Cloudflare Worker
└── static/                 # Static assets
    ├── _app/immutable/     # JS/CSS bundles
    │   └── assets/
    │       └── breez_sdk_liquid_wasm_bg.wasm  # 11MB WASM file
    ├── index.html          # Main app entry
    ├── robots.txt
    ├── sitemap.xml
    └── ...                 # All static assets
```

## 🎯 Key Benefits of Workers

1. **Better Performance**: Edge computing globally
2. **SSR Support**: Server-side rendering at the edge
3. **Future-proof**: Workers is Cloudflare's focus
4. **WASM Support**: Better handling of large assets
5. **Environment Variables**: Per-environment configuration

## 🐛 Troubleshooting

### Build Issues
If build fails:
```bash
# Clean and rebuild
rm -rf .svelte-kit/ node_modules/.vite/
npm run build
```

### WASM Loading Issues
The 11MB Breez SDK WASM file should work fine with Workers, but if you encounter size limits:
- Workers Free: 1MB script limit (may need paid plan)
- Workers Paid: 10MB script limit + larger static assets

### Environment Variables
Make sure all required env vars are in `wrangler.toml`:
```toml
[vars]
VITE_API_URL = "https://api.bittasker.com"
VITE_CLIENT_URL = "https://bittasker.com"
# Add any other required variables
```

## 📞 Next Steps

1. **Get Cloudflare permissions** from administrator
2. **Upgrade to paid plan** if you need custom domains
3. **Deploy to Workers**:
   ```bash
   npm run wrangler:deploy:dev
   npm run wrangler:deploy:prod
   ```
4. **Configure custom domains** in Cloudflare dashboard
5. **Test both environments** before switching DNS

---

**Ready to deploy!** 🚀 All code changes are complete and tested. You just need Cloudflare access to push live.