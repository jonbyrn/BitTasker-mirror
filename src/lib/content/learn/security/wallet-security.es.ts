import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Seguridad de Wallets: Protege tu Bitcoin de Hackers',
		subtitle:
			'Mejores prácticas de wallets hardware, respaldo de seed phrase y vectores de ataque comunes'
	},
	answerBlock:
		'La seguridad de wallets Bitcoin se trata de proteger tus claves privadas — la prueba criptográfica de que posees tu Bitcoin. La práctica más importante es usar una wallet hardware (Coldcard, Ledger, Trezor) para almacenamiento a largo plazo, manteniendo tus claves offline y fuera del alcance de hackers. El respaldo de seed phrase es crítico: almacena tus 24 palabras en acero (a prueba de fuego), nunca digitalmente, y considera separación geográfica. Los ataques comunes incluyen phishing (sitios web falsos de wallets), ataques de cadena de suministro (dispositivos manipulados) y ataques evil maid (acceso físico a tu dispositivo). Usar una passphrase BIP39 agrega una capa crucial de seguridad. Los setups multi-signature proporcionan el nivel más alto de seguridad para grandes tenencias.',
	sections: [
		{
			heading: '¿Cuáles son las mejores prácticas de seguridad de wallet hardware?',
			body: 'Compra tu wallet hardware directamente del fabricante (ledger.com, trezor.io, coinkite.com) — nunca de Amazon, eBay o revendedores donde los dispositivos pueden estar pre-configurados con seed phrases controladas por atacantes. Verifica que el empaque antimanipulación esté intacto. Durante la configuración, genera una seed phrase nueva (nunca restaures una vieja). Escribe las 24 palabras en papel, luego grábalas en un dispositivo de respaldo de acero. Configura un PIN fuerte (6+ dígitos). Habilita la función de passphrase BIP39 para una capa adicional — crea una wallet oculta separada accesible solo con la passphrase. Almacena la passphrase separadamente de la seed phrase.'
		},
		{
			heading: '¿Cómo deberías respaldar tu seed phrase?',
			body: 'La estrategia de respaldo de tres capas proporciona máxima protección. Capa 1: Escribe las 24 palabras en orden en papel usando tinta (el lápiz se desvanece con el tiempo). Guarda en una caja de seguridad a prueba de fuego. Nunca fotografíes, escanees o escribas la seed phrase en ningún dispositivo digital. Capa 2: Graba las palabras en un dispositivo de respaldo de acero. Las wallets de acero (Coldcard Steel Wallet, Billfodl, Cryptosteel) sobreviven incendios domésticos (1400°C+ por 2+ horas), inundaciones y daños físicos. Capa 3: Separación geográfica — guarda el respaldo en una ubicación física diferente a tu copia principal. Para passphrases BIP39, almacena la passphrase en un papel separado en una ubicación diferente.'
		},
		{
			heading: '¿Qué es una passphrase BIP39 y deberías usar una?',
			body: 'Una passphrase BIP39 (también llamada la palabra 25ª) es una adición opcional a tus 24 palabras de seed que crea una jerarquía de wallet completamente separada. Sin passphrase, tu seed deriva un conjunto de direcciones. Con passphrase, la misma seed deriva direcciones y saldos completamente diferentes. Esto proporciona dos beneficios: deniabilidad plausible y una capa adicional de seguridad. Si alguien obtiene tu seed phrase, no puede acceder a tus fondos principales sin la passphrase. Almacena la passphrase separadamente de las palabras de seed. Usa una passphrase fuerte y única. Nunca la olvides — no hay recuperación sin ella.'
		},
		{
			heading: 'Ataques comunes a wallets Bitcoin que debes vigilar',
			body: 'Phishing: Atacantes crean sitios web falsos de wallets (ej. "ledger-wallet.com" en lugar de "ledger.com") idénticos al real. El sitio falso te solicita tu seed phrase. Verifica siempre la URL y descarga wallets solo de fuentes oficiales. Ataques de cadena de suministro: Atacantes compran wallets hardware, extraen las seed phrases pre-generadas, re sellan el empaque y venden los dispositivos manipulados. Prevención: compra solo del fabricante y verifica sellos antimanipulación. Evil maid: Alguien con acceso temporal modifica tu wallet o copia tu seed phrase. Prevención: usa PIN fuerte, habilita passphrase y almacena el dispositivo de forma segura. Hijacking de clipboard: Malware reemplaza direcciones de Bitcoin al copiar. Prevención: siempre verifica la dirección completa en la pantalla de tu wallet hardware.'
		},
		{
			heading: 'Cómo verificar que el firmware de tu wallet es genuino',
			body: 'Ledger: Ledger Live verifica automáticamente el firmware contra los servidores de Ledger durante la instalación. El elemento seguro valida la firma del firmware antes de arrancar. Trezor: Trezor Suite verifica la integridad del firmware durante la instalación. También puedes verificar compilaciones desde el código fuente en GitHub — el firmware de Trezor es completamente reproducible. Coldcard: El firmware es completamente open source con compilaciones reproducibles. Puedes compilar desde la fuente y comparar el hash del binario contra el release oficial. Buena práctica general: siempre actualiza el firmware a través de la app companion oficial — nunca a través de herramientas de terceros.'
		},
		{
			heading: '¿Qué es un setup multi-signature?',
			body: 'Una wallet multi-signature (multisig) requiere múltiples claves privadas para autorizar una transacción — por ejemplo, 2 de 3 o 3 de 5 claves deben firmar antes de que el Bitcoin pueda gastarse. Esto protege contra puntos únicos de falla: incluso si una clave está comprometida, el atacante no puede mover fondos sin las otras claves requeridas. Configuraciones comunes incluyen 2 de 3 con claves en una wallet hardware, una segunda wallet hardware y un respaldo en papel almacenado por separado. Esto proporciona redundancia y seguridad — ninguna clave comprometida puede vaciar los fondos. Para grandes tenencias de Bitcoin, multisig proporciona seguridad de nivel institucional. Herramientas como Sparrow Wallet y Electrum soportan configuración multisig.'
		},
		{
			heading: '¿Cómo maneja BitTasker la seguridad de wallets?',
			body: 'BitTasker se integra con prácticas estándar de seguridad Bitcoin. Tu identidad Nostr (clave privada) nunca toca los servidores de BitTasker — permanece en tu dispositivo. Los pagos fluyen vía Lightning Network directamente a tu wallet conectada, sin intermediario custodial. Para transacciones on-chain, BitTasker soporta direcciones de Bitcoin estándar de cualquier wallet hardware o software. La plataforma no almacena tu seed phrase, claves privadas o credenciales de wallet. Tu seguridad es tu responsabilidad — BitTasker proporciona las herramientas pero tú controlas las claves.'
		}
	],
	faq: [
		{
			question: '¿Cuál es la práctica más importante de seguridad de wallet?',
			answer:
				'Proteger tu seed phrase. Almacénala en acero (a prueba de fuego), nunca digitalmente, y en un lugar seguro. Una passphrase BIP39 agrega una capa adicional crítica. La seed phrase ES tu Bitcoin — trátala como lo más valioso que posees.'
		},
		{
			question: '¿Debo usar wallet de hardware o software?',
			answer:
				'Ambas. Una wallet hardware (Coldcard, Ledger, Trezor) para ahorros a largo plazo — claves offline. Una wallet software (Sparrow, Aquawallet) para gastos diarios. Mantén tus tenencias más grandes en la wallet hardware.'
		},
		{
			question: '¿Qué es una passphrase BIP39?',
			answer:
				'Una palabra 25ª opcional que se agrega a tu seed phrase creando una wallet oculta separada. Incluso si alguien tiene tu seed phrase, no puede acceder a tus fondos sin la passphrase.'
		},
		{
			question: '¿Cómo sé si mi wallet hardware es genuina?',
			answer:
				'Compra directamente del fabricante (ledger.com, trezor.io, coinkite.com). Verifica el empaque antimanipulación. Nunca compres en Amazon, eBay o revendedores.'
		},
		{
			question: '¿Qué es una wallet multi-signature?',
			answer:
				'Una wallet que requiere múltiples claves privadas para autorizar transacciones (ej. 2 de 3). Si una clave está comprometida, el atacante no puede mover fondos solo.'
		},
		{
			question: '¿BitTasker puede acceder a mi wallet?',
			answer:
				'No. BitTasker usa NWC que concede permisos limitados — la plataforma puede solicitar pagos pero nunca accede a tus claves privadas o seed phrase. Puedes revocar acceso en cualquier momento.'
		},
		{
			question: '¿Qué hago si creo que mi wallet está comprometida?',
			answer:
				'Transfiere inmediatamente todos los fondos a una wallet nueva con seed phrase fresca. Si tienes passphrase BIP39, usa una diferente. Contacta al fabricante si sospechas un ataque de cadena de suministro.'
		},
		{
			question: '¿Con qué frecuencia debo actualizar el firmware?',
			answer:
				'Actualiza cuando el fabricante publique parches de seguridad o nuevas funciones. Verifica actualizaciones mensualmente. Siempre actualiza a través de la app companion oficial.'
		}
	],
	bitTaskerCta: {
		heading: 'Protege Tus Ganancias con Mejores Prácticas',
		body: 'BitTasker te paga directamente a tu wallet. Sigue las prácticas de esta guía — wallet hardware, respaldo de seed en acero, passphrase BIP39 — para proteger tus ganancias Bitcoin.',
		buttonText: 'Empieza Ahora',
		buttonHref: '/auth/signup'
	}
};
