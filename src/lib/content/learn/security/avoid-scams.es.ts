import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Cómo Evitar Estafas en Criptomonedas: Guía Completa',
		subtitle:
			'Identifica phishing, wallets falsas, esquemas Ponzi y ataques de ingeniería social antes de que cuesten tu Bitcoin'
	},
	answerBlock:
		'Las estafas en criptomonedas cuestan miles de millones cada año a través de phishing, descargas de wallets falsas, esquemas Ponzi e ingeniería social. Los ataques más comunes incluyen sitios web falsos de wallets que roban tu seed phrase, estafas de suplantación donde atacantes se hacen pasar por personal de soporte, y esquemas de inversión "demasiado buenos para ser verdaderos" que prometen rendimientos garantizados. Protégete descargando wallets siempre desde sitios web oficiales (nunca anuncios de buscadores), verificando checksums de wallets, nunca compartiendo tu seed phrase con nadie, y tratando cada DM o correo no solicitado con extrema sospecha. Las wallets hardware y las passphrases BIP39 proporcionan la defensa más fuerte contra la mayoría de vectores de estafa.',
	sections: [
		{
			heading: '¿Cuáles son las estafas de criptomonedas más comunes?',
			body: 'Ataques de phishing: Estafadores crean sitios web idénticos a wallets o exchanges reales (ej. "ledger-wallet.com" en lugar de "ledger.com"). Te solicitan tu seed phrase para robar tus fondos. Apps de wallet falsas: Apps maliciosas en tiendas de apps imitan wallets legítimas. Verifica siempre el nombre del desarrollador y el conteo de descargas. Esquemas Ponzi y piramidales: Proyectos que prometen rendimientos diarios garantizados (ej. "gana 1% diario") casi siempre son esquemas Ponzi. Los fondos de nuevos inversores pagan a los existentes hasta que colapsa. Rug pulls: Desarrolladores crean un token o proyecto, atraen inversión, luego desaparecen con los fondos. Estafas de giveaways: Publicaciones en redes sociales que afirman "envía 1 BTC, recibe 2 BTC" siempre son estafas. Estafas románticas: Atacantes construyen confianza durante semanas o meses, luego introducen una "oportunidad de inversión increíble."'
		},
		{
			heading: 'Cómo verificar descargas de wallets y checksums',
			body: 'Descarga siempre el software de wallet directamente del sitio web oficial del fabricante — no de anuncios de buscadores, enlaces de redes sociales o sitios de descarga de terceros. Después de descargar, verifica la integridad del archivo usando checksums. La mayoría de fabricantes publican checksums SHA-256 en su sitio web o GitHub releases. En macOS/Linux, ejecuta: shasum -a 256 [archivo]. Compara el resultado contra el checksum publicado. En Windows, ejecuta: certutil -hashfile [archivo] SHA256. Si los hashes coinciden, el archivo es genuino. Si difieren, ha sido manipulado — elimínalo inmediatamente. Para wallets hardware, compra solo del fabricante (ledger.com, trezor.io, coinkite.com, foundation.xyz, bitbox.swiss). Nunca compres en Amazon, eBay o revendedores.'
		},
		{
			heading: 'Ingeniería social en criptomonedas',
			body: 'Agentes de soporte falsos: Atacantes se unen a grupos de Telegram, Discord o Twitter y se hacen pasar por soporte oficial. Te solicitan "verificar" tu wallet ingresando tu seed phrase en un sitio web, o te envían un enlace malicioso. El soporte legítimo nunca pedirá tu seed phrase. DMs de estafa: Mensajes directos no solicitados en cualquier plataforma ofreciendo ayuda, consejos de inversión u "oportunidades exclusivas" casi siempre son estafas. Bloquea y reporta. Suplantación de identidad: Atacantes clonan perfiles de figuras conocidas en crypto, cambian un carácter en el nombre de usuario y publican giveaways falsos. Verifica siempre el historial de la cuenta y su estado de verificación. Urgencia y presión: Estafadores crean urgencia artificial — "actúa ahora o pierde tus fondos," "tu cuenta será suspendida." Los servicios legítimos te dan tiempo para verificar.'
		},
		{
			heading: 'Señales de alerta que indican una estafa de criptomonedas',
			body: 'Rendimientos garantizados: Ninguna inversión legítima garantiza rendimientos. Si alguien promete ganancias garantizadas, es una estafa. Presión para actuar inmediatamente: Los estafadores usan temporizadores de cuenta regresiva, "disponibilidad limitada" y tácticas de miedo. Solicitudes de tu seed phrase: Ningún servicio, agente de soporte o aplicación legítima pedirá tu seed phrase. Contacto no solicitado: Si alguien te contacta de la nada con una oportunidad, sé extremadamente escéptico. Equipos anónimos: Proyectos legítimos tienen equipos identificables y públicos. Si el equipo es anónimo o usa fotos de stock, procede con precaución extrema. Demasiado bueno para ser verdadero: Si la oportunidad suena demasiado buena para ser verdad, lo es.'
		},
		{
			heading: 'Cómo protegerte de estafas de criptomonedas',
			body: 'Usa una wallet hardware: Las wallets hardware (Coldcard, Trezor, Ledger) mantienen tus claves offline y son resistentes a la mayoría de estafas en línea. Nunca compartas tu seed phrase: Almacénala en acero, nunca digitalmente, y nunca la ingreses en ningún sitio web o app a menos que estés absolutamente seguro de que es el proceso de recuperación oficial de tu wallet. Verifica cada URL: Antes de ingresar credenciales, verifica que la URL coincida exactamente con el sitio oficial. Haz transacciones de prueba primero: Antes de enviar grandes cantidades, envía una transacción pequeña de prueba para verificar que la dirección sea correcta. Habilita passphrase BIP39: Incluso si tu seed phrase está comprometida, la passphrase protege tus fondos principales. Almacena la passphrase por separado.'
		},
		{
			heading: 'Cómo reportar estafas de criptomonedas',
			body: 'Si fuiste víctima de una estafa, reporta inmediatamente. En Estados Unidos, presenta una queja ante el Internet Crime Complaint Center del FBI (ic3.gov) y la FTC (reportfraud.ftc.gov). En Reino Unido, reporta a Action Fraud. En la UE, contacta tu unidad de ciberdelitos nacional. Reporta cuentas falsas de redes sociales a la plataforma (Twitter, Telegram, Discord). Si perdiste fondos, reporta las direcciones receptoras a empresas de análisis blockchain como Chainalysis o Elliptic. Únete a comunidades como r/BitcoinScams para advertir a otros. La prevención es la mejor defensa.'
		},
		{
			heading: '¿Cómo te protege BitTasker de las estafas?',
			body: 'BitTasker mitiga vectores comunes de estafa a través de su arquitectura. Los pagos fluyen vía Lightning Network a tu wallet conectada — BitTasker nunca custodia tus fondos ni solicita tu seed phrase. La plataforma usa identidad Nostr, sin credenciales de email/password que phishear. El escrow de smart contracts en RGB asegura que ambas partes cumplan sus obligaciones antes de que se muevan los fondos. Sin embargo, ninguna plataforma puede eliminar todo el riesgo. Siempre verifica URLs, nunca compartas tu seed phrase y trata los DMs no solicitados con sospecha.'
		}
	],
	faq: [
		{
			question: '¿Cuál es la estafa de criptomonedas más común?',
			answer:
				'Los ataques de phishing son los más comunes, donde estafadores crean sitios web falsos de wallets o exchanges para robar tu seed phrase. La ingeniería social (soporte falso, DMs de estafa) es el segundo vector más común.'
		},
		{
			question: '¿Puedo recuperar fondos perdidos en una estafa de cripto?',
			answer:
				'Las transacciones de Bitcoin son irreversibles, por lo que la recuperación es difícil. Reporta a las autoridades (FBI IC3, Action Fraud) y contacta el exchange si los fondos fueron enviados allí. La prevención es mucho más efectiva que la recuperación.'
		},
		{
			question: '¿Cómo sé si la descarga de una wallet es legítima?',
			answer:
				'Descarga solo del sitio web oficial del fabricante. Verifica el checksum SHA-256 contra el hash publicado. Nunca descargues de anuncios de buscadores, enlaces de redes sociales o sitios de terceros.'
		},
		{
			question: '¿Es seguro hacer clic en enlaces de grupos de Telegram crypto?',
			answer:
				'No. Telegram está lleno de enlaces de estafa, giveaways falsos y cuentas de suplantación. Nunca hagas clic en enlaces de extraños, incluso en grupos "oficiales."'
		},
		{
			question: '¿Qué hago si compartí mi seed phrase?',
			answer:
				'Transfiere inmediatamente todos los fondos a una wallet nueva con seed phrase fresca. El tiempo es crítico — el estafador puede estar monitoreando tu dirección. Usa un dispositivo diferente si es posible.'
		},
		{
			question: '¿Son peligrosos los airdrop scams?',
			answer:
				'Sí. Los airdrop scams te piden conectar tu wallet o ingresar tu seed phrase en un sitio web falso para "reclamar" tokens gratis. El contrato de dreneado de wallet roba tus fondos.'
		},
		{
			question: '¿Una wallet hardware me protege de todas las estafas?',
			answer:
				'Una wallet hardware protege contra la mayoría de ataques en línea, pero no contra robo físico, ataques de cadena de suministro o ingeniería social que te engaña para firmar una transacción maliciosa.'
		}
	],
	bitTaskerCta: {
		heading: 'Freelance Seguro con BitTasker',
		body: 'BitTasker usa identidad Nostr y escrow de smart contracts — sin email/password para phishear, sin fondos custodiales que perder. Los pagos fluyen directamente a tu wallet vía Lightning.',
		buttonText: 'Empieza Ahora',
		buttonHref: '/auth/signup'
	}
};
