import { writeFileSync } from 'fs';
import { join } from 'path';

// Detectar entorno - usar argumentos de línea de comandos como fuente principal
const isDev =
	process.argv.includes('--dev') ||
	process.argv.includes('--development') ||
	process.argv.includes('--staging') ||
	(process.env.NODE_ENV && process.env.NODE_ENV === 'development') 
const domain = isDev ? 'https://dev.bittasker.com' : 'https://bittasker.com';

let robotsContent;

if (isDev) {
	// Desarrollo - bloquear todo
	robotsContent = `User-agent: *
Disallow: /

# Development environment - block all crawlers
# This prevents search engines from indexing dev/staging sites
# Generated at: ${new Date().toISOString()}`;

	console.log('🚫 Generated DEV robots.txt - blocking all crawlers');
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

	console.log('✅ Generated PROD robots.txt - allowing public content');
}

// Escribir el archivo
const robotsPath = join(process.cwd(), 'static', 'robots.txt');
writeFileSync(robotsPath, robotsContent, 'utf8');

console.log(' robots.txt written to:', robotsPath);
