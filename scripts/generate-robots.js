// Detectar entorno - usar argumentos de línea de comandos como fuente principal

const isDev = 'https://dev.bittasker.com';
const isProd = 'https://bittasker.com';
let robotsContent;

if (isDev) {
	// Desarrollo - bloquear todo
	robotsContent = `User-agent: *
Disallow: /

# Development environment - block all crawlers
# This prevents search engines from indexing dev/staging sites
# Generated at: ${new Date().toISOString()}`;
} else if (isProd) {
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
}

// Ya no escribimos el archivo estático, solo mostramos el contenido
console.log(robotsContent);
