import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Seguridad de Wallets Hardware: Protección Avanzada',
		subtitle:
			"Respaldos de acero, Shamir's Secret Sharing, setups multisig y verificación de firmware"
	},
	answerBlock:
		"La seguridad de wallets hardware va más allá de simplemente poseer un dispositivo. La protección avanzada incluye respaldos de seed phrase en acero que sobreviven incendios domésticos (1400°C+), Shamir's Secret Sharing (SSSS) para dividir tu seed en múltiples acciones, wallets ocultas protegidas con passphrase, y setups multi-signature que requieren 2 de 3 o 3 de 5 claves para autorizar gastos. Los vectores de ataque comunes incluyen ataques de cadena de suministro (dispositivos manipulados), ataques evil maid (acceso físico), y phishing que te engaña para firmar transacciones maliciosas. Verificar la integridad del firmware a través de compilaciones reproducibles y herramientas de verificación del fabricante cierra la superficie de ataque restante.",
	sections: [
		{
			heading: '¿Por qué las wallets hardware son más seguras que las wallets software?',
			body: 'Las wallets hardware mantienen tus claves privadas en un elemente seguro dedicado — un chip resistente a la manipulación que nunca expone las claves a internet ni a tu computadora. Las wallets software almacenan claves en un dispositivo de propósito general (teléfono, laptop) constantemente conectado a internet, ejecutando software no confiable y vulnerable a malware, phishing y exploits remotos. Cuando firmas una transacción en una wallet hardware, la firma ocurre dentro del chip seguro. Verificas los detalles de la transacción en la pantalla del dispositivo (dirección, monto) y presionas físicamente un botón para confirmar. Incluso si tu computadora está completamente comprometida, el atacante no puede extraer tus claves ni engañarte para firmar una transacción que no verificaste en la pantalla del dispositivo.'
		},
		{
			heading: 'Estrategias de respaldo de seed phrase más allá del papel',
			body: "Los respaldos de papel son vulnerables al fuego, agua y el tiempo. Dispositivos de respaldo de acero (Coldcard Steel Wallet, Billfodl, Cryptosteel) están calificados para sobrevivir incendios domésticos a 1400°C+ por más de 2 horas, inundaciones y aplastamiento físico. Usan placas de metal grabadas para registrar permanentemente tus 24 palabras. Shamir's Secret Sharing (SSSS) divide tu seed en N acciones (ej. 5), donde cualquier M acciones (ej. 3) pueden reconstruir la seed. Esto significa que ninguna ubicación individual posee la seed completa — un ladrón necesitaría comprometer múltiples ubicaciones simultáneamente. Sin embargo, SSSS agrega complejidad. Si pierdes demasiadas acciones, tu Bitcoin se pierde para siempre. La mayoría de usuarios están mejor servidos con 2–3 respaldos de acero en ubicaciones geográficas separadas."
		},
		{
			heading: 'Passphrase vs sin passphrase: seguridad',
			body: 'Una passphrase BIP39 (la palabra 25ª) crea una wallet completamente separada de la misma seed phrase. Sin passphrase, tu seed deriva un conjunto de direcciones. Con passphrase, la misma seed deriva direcciones y saldos completamente diferentes. Esto proporciona dos capas críticas de seguridad. Primero, deniabilidad plausible: si te coercionan, puedes revelar la seed phrase sin la passphrase — el atacante ve una wallet de señuelo pequeña. Los fondos reales están ocultos detrás de la passphrase. Segundo, defensa en profundidad: incluso si alguien obtiene tu seed phrase, no puede acceder a tus fondos principales sin la passphrase. La passphrase debe ser: fuerte (no una palabra de diccionario, 8+ caracteres), memorable (nunca debes olvidarla — no hay recuperación), y almacenada separadamente de la seed phrase.'
		},
		{
			heading: 'Setups multi-signature para máxima seguridad',
			body: 'Multi-signature (multisig) requiere múltiples claves privadas para autorizar una transacción. Un setup 2 de 3 significa que 2 de 3 claves deben firmar antes de que el Bitcoin pueda gastarse. Esto elimina puntos únicos de falla: incluso si una clave está comprometida, el atacante no puede mover fondos solo. Configuraciones comunes: 2 de 3 con distribución de claves entre una wallet hardware, una segunda wallet hardware y un respaldo en papel/acero almacenado en una tercera ubicación. Esto proporciona redundancia y seguridad — ninguna clave comprometida puede vaciar los fondos. Para tenencias de alto valor, un setup 3 de 5 agrega mayor resiliencia. Herramientas como Sparrow Wallet, Electrum y Nunchuk soportan configuración multisig. Consideraciones importantes: debes gestionar múltiples dispositivos, asegurar redundancia de respaldo de claves y entender que perder demasiadas claves hace los fondos irrecuperables.'
		},
		{
			heading: 'Vectores de ataque comunes a wallets hardware',
			body: 'Ataques de cadena de suministro: Atacantes compran wallets hardware, generan o extraen seed phrases, re sellan el empaque y venden dispositivos manipulados. Prevención: compra solo del fabricante y verifica sellos antimanipulación. Evil maid: Alguien con acceso temporal puede intentar modificar tu wallet, copiar la seed phrase o instalar un keylogger físico. Prevención: usa PIN fuerte, habilita passphrase BIP39 (el dispositivo es inútil sin ella) y almacena el dispositivo de forma segura. Hijacking de clipboard: Malware reemplaza direcciones de Bitcoin, redirigiendo fondos a un atacante. Prevención: siempre verifica la dirección completa en la pantalla de la wallet hardware. Ataques de firmware: Firmware comprometido podría filtrar claves. Prevención: actualiza solo a través de apps oficiales, verifica integridad del firmware y prefiere firmware open source con compilaciones reproducibles.'
		},
		{
			heading: 'Cómo verificar la integridad del firmware',
			body: 'Coldcard: Completamente open source con compilaciones reproducibles. Puedes compilar el firmware desde el código fuente en GitHub y comparar el hash del binario contra el release oficial. El caso de policarbonato transparente permite inspección visual del PCB. Trezor: El firmware es completamente reproducible — puedes compilar desde la fuente y verificar el hash. Trezor Suite verifica la integridad durante la instalación. Ledger: Ledger Live realiza verificación automática del firmware contra los servidores de Ledger. El elemento seguro valida la firma del firmware antes de arrancar. Ledger usa un elemente seguro de código cerrado. Reglas generales: siempre actualiza a través de la app companion oficial. Nunca actualices a través de herramientas de terceros o enlaces en correos. Si una actualización te solicita ingresar tu seed phrase en una computadora, es una estafa.'
		},
		{
			heading: 'Cómo configurar una wallet hardware de forma segura',
			body: 'Paso 1: Compra directamente del sitio web oficial del fabricante. Paso 2: Verifica que el empaque antimanipulación esté intacto al llegar. Paso 3: Inicializa el dispositivo — genera una seed phrase fresca (nunca restaures una seed que encontraste o recibiste de alguien). Paso 4: Escribe las 24 palabras en papel, luego graba en acero. Paso 5: Configura un PIN fuerte (6+ dígitos). Paso 6: Habilita passphrase BIP39 y crea una passphrase fuerte — almacénala por separado. Paso 7: Envía una transacción pequeña de prueba para verificar que todo funcione. Paso 8: Almacena la wallet hardware, el respaldo de acero y la passphrase en ubicaciones seguras separadas. Paso 9: Prueba la restauración en un segundo dispositivo para verificar que tu respaldo sea correcto.'
		}
	],
	faq: [
		{
			question: '¿Cuál es la wallet hardware más segura?',
			answer:
				'Para seguridad pura de Bitcoin, la Coldcard Mk4 es ampliamente considerada el estándar de oro — completamente open source, firma air-gapped y caso transparente para inspección física. Foundation Passport ofrece firma premium basada en QR. Trezor proporciona el mejor equilibrio entre seguridad y usabilidad.'
		},
		{
			question: '¿Necesito un respaldo de acero para mi seed phrase?',
			answer:
				'Sí. El papel se degrada, quema y moja. Las wallets de acero sobreviven incendios domésticos (1400°C+), inundaciones y daños físicos. Para cualquier tenencia significativa de Bitcoin, un respaldo de acero es una pequeña inversión que protege contra la pérdida catastrófica.'
		},
		{
			question: "¿Qué es Shamir's Secret Sharing?",
			answer:
				'Un método criptográfico que divide tu seed en N acciones (ej. 5), donde cualquier M acciones (ej. 3) pueden reconstruir la seed completa. Ninguna acción individual revela información sobre la seed. Elimina puntos únicos de falla pero agrega complejidad.'
		},
		{
			question: '¿Debo usar una passphrase BIP39?',
			answer:
				'Para tenencias significativas, sí. Crea una wallet oculta que protege tus fondos principales incluso si tu seed phrase está comprometida. Elige una passphrase fuerte y memorable. Nunca la olvides — no hay recuperación sin ella.'
		},
		{
			question: '¿Qué es un setup multi-signature?',
			answer:
				'Una wallet que requiere múltiples claves para autorizar gastos (ej. 2 de 3). Proporciona redundancia y elimina puntos únicos de falla. Ideal para grandes tenencias donde la complejidad operativa está justificada.'
		},
		{
			question: '¿Cómo sé si mi wallet hardware ha sido manipulada?',
			answer:
				'Compra solo del fabricante. Verifica sellos antimanipulación. Para Coldcard, el caso transparente permite inspección del PCB. Inicializa fresca — nunca restaures una seed preexistente.'
		},
		{
			question: '¿Las actualizaciones de firmware pueden comprometer mi wallet?',
			answer:
				'Firmware comprometido podría filtrar claves. Mitiga actualizando solo a través de apps oficiales, verificando hashes del firmware y prefiriendo dispositivos con firmware open source y compilaciones reproducibles.'
		},
		{
			question: '¿Con qué frecuencia debo probar mi respaldo de seed?',
			answer:
				'Prueba tu respaldo inmediatamente después de crearlo restaurando en un segundo dispositivo. Después, prueba anualmente o cuando hagas cambios significativos a tu setup. Un respaldo que no has probado no es un respaldo — es una esperanza.'
		}
	],
	bitTaskerCta: {
		heading: 'Protege Tus Ganancias de BitTasker',
		body: 'BitTasker te paga directamente a tu wallet vía Lightning. Combina una wallet hardware con respaldo de acero, passphrase BIP39 y multisig para proteger tus ganancias freelance con seguridad de nivel institucional.',
		buttonText: 'Empieza Ahora',
		buttonHref: '/auth/signup'
	}
};
