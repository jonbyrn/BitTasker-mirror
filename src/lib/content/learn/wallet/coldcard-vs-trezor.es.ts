import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Coldcard vs Trezor: Seguridad Bitcoin Comparada',
		subtitle:
			'Transparencia open source y seguridad air-gapped — ¿qué enfoque prote mejor tu Bitcoin?'
	},
	answerBlock:
		'El Coldcard y Trezor representan dos filosofías de seguridad Bitcoin. El Coldcard es una wallet Bitcoin-only y air-gapped que nunca se conecta a ningún dispositivo conectado a red — las transacciones se firman vía tarjeta MicroSD o código QR. Trezor es una wallet multi-moneda que se conecta vía USB y ofrece transparencia open source completa con una interfaz de pantalla táctil. Ambos son completamente open source. Elige el Coldcard si quieres máxima seguridad para almacenamiento Bitcoin a largo plazo sin exposición a red. Elige Trezor si quieres una wallet fácil de usar y multi-moneda. El Coldcard es la bóveda; Trezor es el cajón que usas regularmente.',
	sections: [
		{
			heading: '¿Qué hace diferente al Coldcard de Trezor?',
			body: 'El Coldcard es exclusivamente Bitcoin y completamente air-gapped. Se comunica exclusivamente a través de tarjetas MicroSD, NFC o códigos QR — nunca USB, nunca Bluetooth, nunca WiFi. Esto elimina cada posible ruta de datos para ataques remotos. Trezor se conecta vía USB (y Bluetooth en Model T), lo que significa que toca físicamente una computadora conectada a red durante su uso. El Coldcard usa elementos seguros duales (Microchip ATECC608 y Maxim DS28C36B) para protección redundante de claves. Trezor no usa ningún elemento seguro. El Coldcard también ofrece funciones de seguridad física únicas: PINs de coerción que cargan una wallet falsa, PINs de destrucción que destruyen permanentemente el elemento seguro si el dispositivo es incautado, y un temporizador de cuenta regresiva que retrasa el acceso.'
		},
		{
			heading: '¿Cuál es más seguro para almacenamiento en frío de Bitcoin?',
			body: 'Para almacenamiento en frío puro de Bitcoin, el Coldcard es objetivamente más seguro. Su diseño air-gapped significa que tu clave privada nunca toca una computadora, teléfono o cualquier dispositivo conectado a red — ni siquiera durante la configuración y firma de transacciones. Los elementos seguros duales proporcionan dos capas independientes de protección criptográfica. Funciones como PINs de coerción, PINs de destrucción y temporizadores de acceso añaden seguridad física que Trezor simplemente no ofrece. La ventaja de Trezor es la transparencia open source completa — cada línea de firmware es auditable públicamente. El Coldcard también es completamente open source. Para la mayoría de usuarios, el diseño air-gapped del Coldcard proporciona un techo de seguridad más alto que cualquier wallet conectada vía USB.'
		},
		{
			heading: '¿Cuánto cuesta cada wallet?',
			body: 'El Coldcard Mk5 cuesta $149.87 y el Coldcard Q cuesta $214.87, ambos en coinkite.com. Trezor ofrece más puntos de precio: Model One ($69), Safe 3 ($79), Model T ($219) y Safe 5 ($169). El Model One de Trezor a $69 es la opción más económica para almacenamiento en frío de Bitcoin. El precio del Coldcard refleja sus elementos seguros duales y arquitectura air-gapped. Ninguno requiere cuotas de suscripción.'
		},
		{
			heading: '¿Es Trezor más fácil de configurar que Coldcard?',
			body: 'Sí, Trezor es significativamente más fácil de configurar para principiantes. Conéctalo, ve a trezor.io/start, sigue las instrucciones en pantalla y estarás funcionando en 10 minutos. La interfaz de pantalla táctil hace la configuración intuitiva. El Coldcard requiere más conocimientos técnicos: necesitas entender los PSBTs (Partially Signed Bitcoin Transactions), usar una wallet companion como Sparrow Wallet, y manejar tarjetas MicroSD para la firma de transacciones. El flujo air-gapped es más seguro pero tiene una curva de aprendizaje más pronunciada.'
		},
		{
			heading: '¿Cuál funciona mejor con BitTasker?',
			body: 'Ambos funcionan bien con BitTasker para diferentes casos de uso. El Coldcard es ideal para almacenar grandes ganancias de Bitcoin de BitTasker a largo plazo — combínalo con Sparrow Wallet para crear transacciones sin firmar, firmarlas en el Coldcard y transmitirlas. Trezor funciona con Trezor Suite para una experiencia más integrada gestionando tus ganancias. Para pagos Lightning en BitTasker, ninguna soporta Lightning directamente — usa una wallet Lightning para transacciones diarias y mantén tu wallet hardware para ahorros.'
		}
	],
	faq: [
		{
			question: '¿Cuál es más seguro, Coldcard o Trezor?',
			answer:
				'El Coldcard es más seguro para almacenamiento Bitcoin a largo plazo. Su diseño air-gapped (sin USB, sin Bluetooth), elementos seguros duales y funciones de disuasión física proporcionan un techo de seguridad más alto que cualquier wallet conectada vía USB.'
		},
		{
			question: '¿Es Coldcard más caro que Trezor?',
			answer:
				'El Coldcard Mk5 ($149.87) es más caro que el Trezor Model One ($69) y Safe 3 ($79) pero comparable al Trezor Model T ($219). El Coldcard Q ($214.87) tiene un precio similar al Model T.'
		},
		{
			question: '¿Puedo usar Coldcard y Trezor con BitTasker?',
			answer:
				'Sí. Ambos generan direcciones de Bitcoin estándar que funcionan con BitTasker. Usa Sparrow Wallet (Coldcard) o Trezor Suite (Trezor) para gestionar direcciones de recepción. Para Lightning, combina cualquiera con una wallet Lightning de software.'
		},
		{
			question: '¿Trezor es completamente open source?',
			answer:
				'Sí, Trezor es 100% open source — firmware y diseños de hardware están disponibles públicamente. El Coldcard también es completamente open source con compilaciones de firmware reproducibles.'
		},
		{
			question: '¿Los principiantes deben comprar Coldcard o Trezor?',
			answer:
				'Los principiantes deben empezar con Trezor. El proceso de configuración es sencillo, la interfaz de pantalla táctil es intuitiva y Trezor Suite te guía en cada paso. El Coldcard tiene una curva de aprendizaje más pronunciada.'
		},
		{
			question: '¿Dónde debo comprar un Coldcard o Trezor?',
			answer:
				'Compra directamente en coinkite.com (Coldcard) o trezor.io (Trezor). Nunca compres wallets de hardware en Amazon, eBay o revendedores no autorizados.'
		}
	],
	bitTaskerCta: {
		heading: 'Protege Tus Ganancias Bitcoin de Freelance',
		body: 'Gana en BitTasker, almacena en Coldcard o Trezor. El Coldcard es tu bóveda para ahorros a largo plazo; Trezor es tu almacenamiento en frío de uso diario.',
		buttonText: 'Empieza a Ganar',
		buttonHref: '/auth/signup'
	}
};
