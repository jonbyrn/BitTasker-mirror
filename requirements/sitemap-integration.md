# Sitemap Integration Documentation

## Overview

This document explains the sitemap integration for the Bittasker application, which automatically generates a sitemap.xml file for SEO purposes.

## Features

- **Automatic Generation**: Sitemap is generated automatically during the build process
- **Manual Control**: URLs are manually defined for better control over what's included
- **Filtered Content**: Protected routes and internal pages are excluded
- **Multiple Access Points**: Available via static file and dynamic server route
- **SEO Optimized**: Includes proper XML structure, change frequency, and priority settings

## File Structure

```
├── scripts/
│   └── generate-sitemap.js          # Build-time sitemap generation script
├── src/routes/
│   └── sitemap.xml/
│       └── +server.ts               # Dynamic server route for sitemap
├── static/
│   ├── sitemap.xml                  # Generated sitemap for development
│   └── robots.txt                   # References the sitemap
└── build/
    └── sitemap.xml                  # Generated sitemap for production
```

## URLs Included

The sitemap includes the following public URLs:

### Company Pages
- `/` (Home page)
- `/about`
- `/careers`
- `/tasker-fees`
- `/community-guidelines`
- `/contact`
- `/escrow`
- `/faq`
- `/how-it-works`
- `/press`
- `/privacy`
- `/security`
- `/taskee-fees`
- `/tasker-principles`
- `/terms`

### Authentication Pages
- `/auth/login`
- `/auth/signup`
- `/auth/recover`
- `/verify-email`

## URLs Excluded

The following URLs are intentionally excluded from the sitemap:

- **Protected Routes**: `/dashboard/**` (requires authentication)
- **Internal Routes**: `/firebase-config.json`
- **Onboarding**: `/auth/onboarding` (internal flow)
- **Dynamic Routes**: `/auth/recover/[npub]` (requires parameters)
- **Sensitive Routes**: `/auth/recover/send` (internal flow)

## Usage

### Automatic Generation

The sitemap is automatically generated during the build process:

```bash
npm run build
```

This runs the build command which includes sitemap generation.

### Manual Generation

You can generate the sitemap manually without building:

```bash
# Generate sitemap for development
npm run sitemap:generate

# Generate sitemap and show confirmation
npm run sitemap:dev
```

### Access URLs

The sitemap is available at multiple locations:

1. **Dynamic Route**: `https://bittasker.com/sitemap.xml`
   - Served by SvelteKit server route
   - Always up-to-date
   - Includes proper HTTP headers

2. **Static File**: `https://bittasker.com/sitemap.xml`
   - Served from build directory
   - Generated during build process
   - Cached by CDN

## Configuration

### Domain Configuration

Update the domain in two files:

1. **`scripts/generate-sitemap.js`**:
   ```javascript
   const domain = 'https://bittasker.com';
   ```

2. **`src/routes/sitemap.xml/+server.ts`**:
   ```typescript
   const domain = 'https://bittasker.com';
   ```

### Adding New URLs

To add new public URLs to the sitemap:

1. Add the URL to the `urls` array in `scripts/generate-sitemap.js`
2. Add the same URL to the `urls` array in `src/routes/sitemap.xml/+server.ts`
3. Run `npm run sitemap:generate` to regenerate

### Modifying SEO Settings

You can customize the SEO settings by modifying the XML generation:

```javascript
// Change frequency options: always, hourly, daily, weekly, monthly, yearly, never
changefreq: 'weekly'

// Priority range: 0.0 to 1.0
priority: 0.7
```

## robots.txt Integration

The sitemap is referenced in `static/robots.txt`:

```
User-agent: *
Allow: /

# Disallow private/protected routes
Disallow: /dashboard/
Disallow: /auth/onboarding

# Sitemap
Sitemap: https://bittasker.com/sitemap.xml
```

## Development vs Production

### Development
- Uses `static/sitemap.xml` for local testing
- Generated manually or during build
- Accessible at `http://localhost:3000/sitemap.xml`

### Production
- Uses `build/sitemap.xml` for static serving
- Generated during build process
- Accessible at `https://bittasker.com/sitemap.xml`

## Dependencies

- **svelte-sitemap**: Used for initial setup (can be removed if not needed)
- **Node.js fs module**: For file operations
- **SvelteKit**: For server route handling

## Maintenance

### Regular Updates

1. **New Routes**: Add new public routes to both configuration files
2. **Route Changes**: Update or remove changed routes
3. **Domain Changes**: Update domain configuration
4. **SEO Updates**: Modify change frequency and priority as needed

### Verification

1. **Test Local**: `npm run sitemap:generate` and check `static/sitemap.xml`
2. **Test Build**: `npm run build` and check `build/sitemap.xml`
3. **Test Server**: Start dev server and visit `/sitemap.xml`
4. **Validate XML**: Use online XML validators to check structure

## SEO Benefits

- **Search Engine Discovery**: Helps search engines find all public pages
- **Crawl Efficiency**: Provides structured information about site hierarchy
- **Update Frequency**: Indicates how often content changes
- **Priority Signals**: Helps search engines understand page importance
- **Robots.txt Integration**: Proper discoverability and indexing control

## Troubleshooting

### Common Issues

1. **Missing URLs**: Check that URLs are added to both configuration files
2. **Protected Routes Included**: Verify filtering logic in both files
3. **Build Errors**: Ensure build directory exists and is writable
4. **Server Route Issues**: Check TypeScript types and imports

### Debug Commands

```bash
# Check sitemap content
cat build/sitemap.xml

# Count URLs
wc -l build/sitemap.xml

# Validate XML structure
xmllint --format build/sitemap.xml

# Test server route (with dev server running)
curl http://localhost:3000/sitemap.xml
```

## Future Enhancements

- **Dynamic Content**: Add support for dynamic routes (e.g., blog posts, tasks)
- **Multilingual Support**: Add language-specific sitemaps
- **Image Sitemap**: Include image URLs for better SEO
- **News Sitemap**: Add news-specific sitemap for timely content
- **Priority Calculation**: Dynamic priority based on page importance
- **Automated Testing**: Unit tests for sitemap generation 