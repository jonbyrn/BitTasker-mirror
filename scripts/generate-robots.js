import { writeFileSync } from 'fs';
import { join } from 'path';

// Detectar entorno usando la misma lógica que el archivo dinámico
const devDomain = 'https://dev.bittasker.com';
const domain = 'https://bittasker.com';

const isDev = devDomain.includes('dev.');
console.log('🤖 Generating robots.txt...', isDev);

let robotsContent;

if (isDev) {
	// Desarrollo - bloquear todo
	robotsContent = `User-agent: *
Disallow: /

# Development environment - block all crawlers
# This prevents search engines from indexing dev/staging sites
# Generated at: ${new Date().toISOString()}`;
} else {
	// Producción - permitir contenido público
	robotsContent = `User-agent: *
Allow: /

# Disallow private/protected routes
Disallow: /dashboard/
Disallow: /auth/
Disallow: /verify-email
Disallow: /api/
Disallow: /_app/
Disallow: /admin/

# Block sensitive files
Disallow: /*.json$
Disallow: /*.js$
Disallow: /*.css$
Disallow: /manifest.json
Disallow: /firebase-messaging-sw.js

# Sitemap
Sitemap: ${domain}/sitemap.xml

# Generated at: ${new Date().toISOString()}`;
}

// Escribir el archivo
const robotsPath = join(process.cwd(), 'static', 'robots.txt');
writeFileSync(robotsPath, robotsContent, 'utf8');
