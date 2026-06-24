import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Foundation Passport vs Coldcard: Comparación Air-Gapped',
		subtitle:
			'Dos wallets Bitcoin-only y air-gapped — ¿qué dispositivo de almacenamiento en frío premium es correcto para ti?'
	},
	answerBlock:
		'El Foundation Passport y Coldcard son ambas wallets de hardware premium, exclusivamente Bitcoin y air-gapped que nunca se conectan a internet. El Passport (de Foundation Devices, ~$349) presenta una pantalla táctil grande, escaneo de código QR y un cuerpo elegante de aluminio mecanizado. El Coldcard (de Coinkite, $150–$215) usa firma PSBT vía MicroSD con un diseño compacto y elementos seguros duales. Ambos son completamente open source. El Passport ofrece una experiencia más pulida tipo smartphone con su pantalla táctil y flujos QR. El Coldcard proporciona funciones de seguridad física más fuertes (PINs de coerción, PINs de destrucción, temporizadores de acceso) y cuesta menos. Elige el Passport por usabilidad y diseño; elige el Coldcard por máxima seguridad física y valor.',
	sections: [
		{
			heading: '¿Cuáles son las diferencias clave entre Passport y Coldcard?',
			body: 'Ambas comparten la misma filosofía core — exclusivamente Bitcoin, air-gapped, completamente open source — pero difieren en ejecución. El Foundation Passport usa una pantalla táctil a color grande (2.7") y se comunica exclusivamente vía códigos QR. Su cuerpo de aluminio mecanizado, retroalimentación háptica y batería recargable le dan una sensación premium similar a un smartphone. El Coldcard se comunica vía MicroSD, NFC y QR (solo modelo Q) con una pantalla OLED más pequeña y teclado numérico (Mk5) o QWERTY (Q). El Passport tiene un elemento seguro (ATECC608B). El Coldcard tiene dos (ATECC608A + Maxim DS28C36B), proporcionando protección redundante de claves. El Passport cuesta ~$349, mientras el Coldcard va de $149.87 (Mk5) a $214.87 (Q).'
		},
		{
			heading: '¿Cuál tiene mejores funciones de seguridad?',
			body: 'El Coldcard gana en funciones de seguridad física. Ofrece PINs de coerción (que cargan una wallet falsa bajo coacción), PINs de destrucción (que destruyen permanentemente el elemento seguro si es incautado) y un temporizador de cuenta regresiva (que retrasa el acceso al dispositivo hasta 28 días). El Foundation Passport ofrece protección PIN estándar y soporte de passphrase pero carece de estos disuasores físicos avanzados. Ambos usan elementos seguros, pero la arquitectura dual del Coldcard proporciona una segunda capa independiente de protección.'
		},
		{
			heading: '¿Cómo difieren los flujos de firma?',
			body: 'El Passport usa un flujo basado en QR: crea un PSBT en tu wallet companion (Sparrow, Nunchuk), muéstralo como código QR, escanéalo con la cámara del Passport, verifica en pantalla y muestra la transacción firmada como QR para que tu companion la transmita. El Coldcard usa tarjetas MicroSD: guarda un PSBT en la tarjeta, insértala en el Coldcard, verifica y firma, luego retira la tarjeta y transmite desde tu computadora. El Coldcard Q también soporta firma vía QR y NFC. Ambos son completamente air-gapped.'
		},
		{
			heading: '¿Cuál es mejor para principiantes?',
			body: 'El Foundation Passport es más amigable para principiantes. Su pantalla táctil grande brinda orientación visual durante la configuración y firma, los flujos QR se sienten familiares para usuarios de smartphone y el diseño es pulido y consumidor. El Coldcard requiere más conocimiento técnico — entender PSBTs, manejar tarjetas MicroSD y navegar una pantalla más pequeña. Para principiantes que quieren seguridad air-gapped sin curva de aprendizaje pronunciada, el Passport es mejor. Para usuarios técnicamente proficientes que quieren máxima seguridad y valor, el Coldcard es superior.'
		},
		{
			heading: '¿Cuál funciona mejor con BitTasker?',
			body: 'Ambos se integran bien con BitTasker para pagos en Bitcoin. El Passport se combina con Sparrow Wallet y Nunchuk vía QR. El Coldcard se combina con Sparrow Wallet vía MicroSD. Para almacenamiento a largo plazo de ganancias de BitTasker, ambos proporcionan almacenamiento en frío air-gapped de nivel institucional. El flujo QR del Passport es ligeramente más rápido para usuarios móviles. El flujo MicroSD del Coldcard es mejor para usuarios desktop. Ninguno soporta Lightning nativamente.'
		}
	],
	faq: [
		{
			question: '¿Cuál es más seguro, Passport o Coldcard?',
			answer:
				'El Coldcard ofrece seguridad física más fuerte con PINs de coerción, PINs de destrucción y temporizadores de acceso — funciones que el Passport no tiene. Ambos brindan excelente seguridad digital a través de diseños air-gapped y Bitcoin-only con elementos seguros.'
		},
		{
			question: '¿Cuánto cuesta el Foundation Passport?',
			answer:
				'El Foundation Passport cuesta aproximadamente $349 USD, disponible en foundationdevices.com. El Coldcard Mk5 ($149.87) y Q ($214.87) son significativamente más económicos.'
		},
		{
			question: '¿El Passport es más fácil de usar que Coldcard?',
			answer:
				'Sí, la pantalla táctil grande y los flujos QR del Passport son más intuitivos para principiantes. El Coldcard tiene una curva de aprendizaje más pronunciada.'
		},
		{
			question: '¿Puedo usar ambos con BitTasker?',
			answer:
				'Sí. Ambos generan direcciones de Bitcoin estándar compatibles con BitTasker. Combina con Sparrow Wallet (Coldcard) o Sparrow/Nunchuk (Passport).'
		},
		{
			question: '¿Ambos son completamente open source?',
			answer:
				'Sí, ambos son completamente open source — firmware y diseños de hardware están disponibles públicamente. Ambos soportan compilaciones de firmware reproducibles.'
		},
		{
			question: '¿Dónde puedo comprar estas wallets?',
			answer:
				'Compra el Passport en foundationdevices.com y el Coldcard en coinkite.com. Nunca compres en Amazon, eBay o revendedores no autorizados.'
		}
	],
	bitTaskerCta: {
		heading: 'Protege Tus Ganancias Bitcoin de Freelance',
		body: 'Gana Bitcoin en BitTasker, luego almacénalo air-gapped en un Passport o Coldcard. Ambos mantienen tus ganancias completamente offline.',
		buttonText: 'Empieza a Ganar',
		buttonHref: '/auth/signup'
	}
};
