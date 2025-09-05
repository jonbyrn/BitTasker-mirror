import { writeFileSync } from 'fs';
import { join } from 'path';

// Detectar entorno
const isDev = process.env.NODE_ENV === 'development' || 
              process.argv.includes('--dev');

console.log('🤖 Generating robots.txt...');
console.log('Environment:', { NODE_ENV: process.env.NODE_ENV, isDev });

let robotsContent;

if (isDev) {
  // Desarrollo - bloquear todo
  robotsContent = `User-agent: *
Disallow: /

# Development environment - block all crawlers
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
Sitemap: https://bittasker.com/sitemap.xml

# Generated at: ${new Date().toISOString()}`;
  
  console.log('✅ Generated PROD robots.txt - allowing public content');
}

// Escribir el archivo
const robotsPath = join(process.cwd(), 'static', 'robots.txt');
writeFileSync(robotsPath, robotsContent, 'utf8');

console.log('�� robots.txt written to:', robotsPath);
