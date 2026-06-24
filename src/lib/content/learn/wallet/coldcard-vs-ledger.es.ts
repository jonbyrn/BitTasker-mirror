import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Coldcard vs Ledger: Comparación de Almacenamiento Bitcoin',
		subtitle:
			'Air-gapped Bitcoin-only vs multi-moneda con elemento seguro — ¿qué prote mejor tus ahorros?'
	},
	answerBlock:
		'Coldcard y Ledger son ambas excelentes wallets de hardware, pero sirven a diferentes perfiles de Bitcoiners. El Coldcard es un dispositivo exclusivamente Bitcoin y air-gapped que firma transacciones vía tarjeta MicroSD — nunca se conecta a ningún dispositivo conectado a red. Ledger es una wallet multi-moneda con un chip de elemento seguro certificado que se conecta vía USB o Bluetooth. Para máxima seguridad de almacenamiento en frío, el Coldcard gana — su diseño air-gapped y elementos seguros duales eliminan todo vector de ataque remoto. Para usuarios que quieren un solo dispositivo para Bitcoin, Ethereum y cientos de altcoins con una app móvil pulida, Ledger es la opción práctica.',
	sections: [
		{
			heading: '¿Qué hace diferente al Coldcard de Ledger?',
			body: 'El Coldcard es exclusivamente Bitcoin y completamente air-gapped. Nunca se conecta a una computadora, teléfono o red — las transacciones se firman insertando una tarjeta MicroSD. Ledger se conecta vía USB-C (Nano S Plus, Nano X, Stax) o Bluetooth (Nano X, Stax), lo que crea una ruta de datos física entre el dispositivo y una computadora conectada a red. El Coldcard usa elementos seguros duales (Microchip ATECC608 y Maxim DS28C36B) para protección redundante de claves. Ledger usa un solo elemento seguro (ST33 para dispositivos más nuevos). El Coldcard ofrece funciones de disuasión física — PINs de coerción que cargan una wallet falsa, PINs de destrucción que destruyen el elemento seguro, y un temporizador de cuenta regresiva de acceso. Ledger ofrece protección PIN estándar y soporte de passphrase.'
		},
		{
			heading: '¿Cuál es más seguro para almacenar Bitcoin?',
			body: 'Para almacenamiento en frío puro de Bitcoin, el Coldcard proporciona un techo de seguridad más alto. Su arquitectura air-gapped significa que la clave privada nunca toca físicamente una computadora — ni siquiera durante la configuración y firma de transacciones. El flujo PSBT vía MicroSD crea una brecha air-gapped que ninguna wallet USB o Bluetooth puede igualar. Los elementos seguros duales del Coldcard proporcionan dos capas independientes de protección criptográfica. El elemento seguro de Ledger también es altamente resistente a la extracción física, haciendo que ambos dispositivos sean extremadamente seguros contra ataques a nivel de hardware. La diferencia es el modelo de conexión: Ledger requiere contacto USB/Bluetooth con una computadora conectada a red durante su uso, mientras que el Coldcard nunca lo hace.'
		},
		{
			heading: '¿Cómo se comparan los precios?',
			body: 'Precios del Coldcard: Mk5 ($149.87) con teclado numérico compacto, o Q ($214.87) con teclado QWERTY completo y escáner QR. Precios de Ledger: Nano S Plus ($79) para USB-C económico, Nano X ($149) para Bluetooth, Stax ($279) para pantalla E Ink táctil. Ledger ofrece un punto de entrada más bajo a $79 vs $149.87 del Coldcard. Sin embargo, el precio más bajo de Ledger refleja su elemento seguro único y diseño no air-gapped. El premium del Coldcard cubre elementos seguros duales, arquitectura air-gapped completa y funciones avanzadas de seguridad física.'
		},
		{
			heading: '¿Coldcard soporta altcoins como Ledger?',
			body: 'No. El Coldcard es estrictamente Bitcoin-only — no soporta Ethereum, tokens ERC-20, Solana o ninguna otra criptomoneda. Esta es una decisión de diseño deliberada que reduce la superficie de ataque. Ledger soporta más de 5,500 criptomonedas a través de Ledger Live, incluyendo staking nativo, DeFi y gestión de NFTs. Si mantienes múltiples criptomonedas, Ledger (o Ledger más una wallet exclusiva de Bitcoin) es la opción práctica. Si eres maximalista de Bitcoin que quiere el almacenamiento en frío más fuerte posible, el enfoque Bitcoin-only del Coldcard es una función de seguridad, no una limitación.'
		},
		{
			heading: '¿Cuál funciona mejor con BitTasker?',
			body: 'Ambas funcionan con BitTasker para pagos en Bitcoin. El Coldcard se combina con Sparrow Wallet para flujos de transacciones air-gapped — crea transacciones sin firmar en Sparrow, fírmalas en el Coldcard vía MicroSD y transmítelas. Ledger usa Ledger Live para una experiencia más integrada. Para pagos Lightning en BitTasker, ninguna soporta Lightning nativamente — usa una wallet Lightning (Aquawallet, Blink, Phoenix) para transacciones diarias. El Coldcard es ideal para asegurar grandes ganancias de BitTasker a largo plazo; Ledger es más conveniente para acceso regular y gestión multi-moneda.'
		}
	],
	faq: [
		{
			question: '¿Es Coldcard más seguro que Ledger?',
			answer:
				'Para almacenamiento en frío de Bitcoin, sí. El diseño air-gapped del Coldcard (sin USB, sin Bluetooth) y elementos seguros duales proporcionan un techo de seguridad más alto. El elemento seguro de Ledger también es muy seguro, pero la conexión USB/Bluetooth crea una ruta de datos que el Coldcard elimina por completo.'
		},
		{
			question: '¿Es Ledger más barato que Coldcard?',
			answer:
				'Sí, el Ledger Nano S Plus a $79 es la opción más económica comparada con el Coldcard Mk5 a $149.87. Sin embargo, obtienes un elemento seguro único y un dispositivo no air-gapped al precio más bajo.'
		},
		{
			question: '¿Puedo usar Coldcard con BitTasker?',
			answer:
				'Sí. Genera una dirección de recepción de Bitcoin a través de Sparrow Wallet (combinado con tu Coldcard), luego agrégala a tu perfil de BitTasker.'
		},
		{
			question: '¿Puedo usar Ledger para Ethereum y Bitcoin?',
			answer:
				'Sí, Ledger soporta más de 5,500 criptomonedas incluyendo Bitcoin y Ethereum a través de Ledger Live. El Coldcard es exclusivamente Bitcoin.'
		},
		{
			question: '¿Dónde puedo comprar un Coldcard o Ledger?',
			answer:
				'Compra directamente en coinkite.com (Coldcard) o ledger.com (Ledger). Nunca compres en Amazon, eBay o revendedores no autorizados.'
		},
		{
			question: '¿Cuál es más fácil de configurar?',
			answer:
				'Ledger es más fácil para principiantes. Ledger Live te guía en la configuración y la conexión USB hace la gestión de transacciones sencilla. El Coldcard tiene una curva de aprendizaje más pronunciada pero ofrece mayor seguridad.'
		},
		{
			question: '¿Coldcard es open source?',
			answer:
				'Sí, el Coldcard es completamente open source — firmware y diseños de hardware están disponibles públicamente en GitHub con compilaciones reproducibles. Ledger es parcialmente open source.'
		}
	],
	bitTaskerCta: {
		heading: 'Protege Tus Ganancias Bitcoin de Freelance',
		body: 'Gana Bitcoin en BitTasker, luego almacénalo en Coldcard o Ledger. El Coldcard es tu bóveda offline; Ledger te da flexibilidad multi-moneda. Ambas protegen tus ganancias mucho mejor que cualquier exchange.',
		buttonText: 'Empieza Ahora',
		buttonHref: '/auth/signup'
	}
};
