import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Mejor Billetera Bitcoin en 2026: Guía Completa',
		subtitle: 'Compara billeteras de hardware, móviles y Lightning para encontrar la ideal para ti'
	},
	answerBlock:
		'La mejor billetera Bitcoin depende de cómo uses Bitcoin. Para ahorros a largo plazo, las billeteras de hardware como Coldcard Mk4 ($150), Trezor Model T ($219) o BitBox02 ($149) ofrecen almacenamiento en frío. Para gastos diarios en móvil, Aqua Wallet (gratis, autocustodia) y Blink Wallet (gratis, custodial) dominan los ecosistemas Lightning y Liquid. Para tenencias grandes con seguridad de nivel empresarial, Foundation Passport ($249) es una opción premium. La elección correcta equilibra seguridad, conveniencia y costo. La mayoría de los Bitcoiners experimentados usan al menos dos billeteras: una de hardware para ahorros y una móvil para gastos.',
	sections: [
		{
			heading: '¿Qué Es una Billetera Bitcoin y Cómo Funciona?',
			body: 'Una billetera Bitcoin es software o hardware que almacena tus claves privadas — la prueba criptográfica de que posees tu Bitcoin. En realidad no "guarda" Bitcoin como una billetera de cuero guarda efectivo. En cambio, tu Bitcoin vive en la blockchain, y tu billetera almacena las claves que autorizan gastarlo. Cuando envías Bitcoin, tu billetera firma la transacción con tu clave privada y la transmite a la red. Hay tres categorías principales: billeteras de hardware (dispositivos físicos para almacenamiento en frío), billeteras móviles (apps de teléfono para gastos diarios) y billeteras Lightning (diseñadas para pagos instantáneas y de bajo costo). Entender estas categorías es el primer paso para elegir la billetera correcta.'
		},
		{
			heading: 'Mejores Billeteras de Hardware para Bitcoin en 2026',
			body: 'Las billeteras de hardware son el estándar de oro para asegurar grandes tenencias de Bitcoin. Coldcard Mk4 ($150) es la más enfocada en seguridad, con firma air-gapped vía NFC, sin conexión USB requerida y soporte completo para CoinJoin y configuraciones de multi-signature. Trezor Model T ($219) ofrece una interfaz con pantalla táctil y soporta múltiples criptomonedas junto con Bitcoin. BitBox02 ($149) es un dispositivo compacto y bien diseñado con backup en microSD y configuración sencilla. Foundation Passport ($249) es una opción premium con firma air-gapped basada en códigos QR y una pantalla grande. Ledger Nano X ($149) soporta la mayor variedad de criptomonedas pero usa un secure element de código cerrado. Todas las billeteras de hardware mantienen tus claves fuera de línea, protegidas de ataques online.'
		},
		{
			heading: 'Mejores Billeteras Móviles de Bitcoin para Uso Diario',
			body: 'Las billeteras móviles están optimizadas para gastar Bitcoin sobre la marcha. Aqua Wallet es una billetera móvil de autocustodia que soporta Bitcoin, Liquid Network y Lightning — convirtiéndola en la opción móvil más versátil para usuarios que quieren control de claves. Blink Wallet es custodial y está enfocada en Lightning, construida para simplicidad con un saldo denominado en dólares, ideal para usuarios en El Salvador y Latinoamérica. Ambas son gratis de descargar. Electrum es una billetera móvil de clase escritorio popular entre usuarios avanzados por su conjunto robusto de funciones y soporte Lightning. Para la mayoría de las personas, Aqua o Blink cubre el 90% de las necesidades diarias de gasto en Bitcoin. Elige Aqua si quieres autocustodia; elige Blink si quieres simplicidad.'
		},
		{
			heading: 'Billetera de Hardware vs Billetera Móvil: Cuál Necesitas?',
			body: 'La respuesta es ambas. Las billeteras de hardware y móviles sirven propósitos complementarios. Una billetera de hardware (Coldcard, Trezor, BitBox) es para almacenamiento en frío — mantener la mayor parte de tu Bitcoin seguro de amenazas online, hacks de exchanges y malware. Una billetera móvil (Aqua, Blink) es para almacenamiento en caliente — gastar, recibir pagos y transacciones del día a día. El enfoque recomendado: guarda tus ahorros en una billetera de hardware y transfiere dinero para gastos a una billetera móvil según sea necesario. Este modelo de "cuenta de ahorros + cuenta corriente" te da seguridad y conveniencia. Nunca almacenes todas tus tenencias de Bitcoin en una billetera móvil — los teléfonos se pierden, roban o comprometen regularmente.'
		},
		{
			heading: 'Mejores Billeteras de Bitcoin por Caso de Uso',
			body: 'Elige Coldcard Mk4 si quieres la billetera de hardware más segura solo para Bitcoin con firma air-gapped. Elige Trezor Model T si quieres una billetera de hardware fácil de usar que también soporte altcoins. Elige BitBox02 si quieres una billetera de hardware compacta y bien diseñada con backup sencillo. Elige Foundation Passport si quieres firma premium air-gapped basada en QR. Elige Aqua Wallet si quieres una billetera móvil gratuita de autocustodia con soporte para Bitcoin, Liquid y Lightning. Elige Blink Wallet si quieres la billetera Lightning más simple para pagos diarios, especialmente en Latinoamérica. Elige BitTasker Wallet si quieres protección de escrow Bitcoin integrada para trabajo freelance.'
		},
		{
			heading: 'Cuánto Cuesta una Billetera Bitcoin?',
			body: 'Las billeteras móviles como Aqua y Blink son gratis. Las billeteras de hardware varían de $79 a $249 dependiendo del modelo y las características. Coldcard Mk4 cuesta alrededor de $150. Trezor Model T está aproximadamente a $219. BitBox02 tiene un precio de alrededor de $149. Foundation Passport se vende por $249. Ledger Nano X está alrededor de $149. La opción más económica para seguridad seria es el Coldcard Q ($250 con características que rivalizan con dispositivos mucho más caros). Para la mayoría, empezar con una billetera móvil gratuita como Aqua y agregar una billetera de hardware cuando los ahorros superen unos pocos cientos de dólares es el enfoque práctico.'
		},
		{
			heading: 'Cómo Elegir la Billetera Bitcoin Correcta',
			body: 'Hazte tres preguntas. Primero, para qué la usarás? Ahorros requiere una billetera de hardware; gastos diarios necesitan una billetera móvil. Segundo, cuánto Bitcoin tienes? Menos de $500 en dinero para gastos funciona bien en una billetera móvil. Ahorros significativos pertenecen a hardware. Tercero, necesitas Lightning? Si estás en El Salvador o haces pagos pequeños frecuentemente, sí — elige una billetera con soporte Lightning como Aqua o Blink. Para la mejor configuración general, combina un Coldcard o BitBox para ahorros con Aqua Wallet para gastos. Esto te da máxima seguridad para tu riqueza y máxima conveniencia para tus transacciones diarias.'
		}
	],
	faq: [
		{
			question: '¿Cuál es la mejor billetera Bitcoin para principiantes?',
			answer:
				'Para principiantes, Blink Wallet ofrece la experiencia más simple con su saldo denominado en dólares y modelo custodial. Aqua Wallet es la mejor opción gratuita de autocustodia si quieres controlar tus claves desde el día uno. Ambas son gratis y disponibles en iOS y Android.'
		},
		{
			question: '¿Cuánto cuesta una billetera Coldcard?',
			answer:
				'El Coldcard Mk4 cuesta aproximadamente $150 USD. Es una billetera de hardware solo para Bitcoin con firma air-gapped y sin pantalla táctil — optimizada para seguridad sobre conveniencia.'
		},
		{
			question: '¿Son seguras las billeteras Bitcoin gratuitas?',
			answer:
				'Las billeteras móviles gratuitas como Aqua y Blink son seguras para montos de gasto diario. Aqua es de autocustodia, lo que significa que tú controlas tus claves. Blink es custodial. Para ahorros grandes, siempre usa una billetera de hardware sin importar el costo.'
		},
		{
			question: '¿Puedo guardar Bitcoin y Lightning en la misma billetera?',
			answer:
				'Sí. Tanto Aqua Wallet como Blink Wallet soportan Lightning junto con Bitcoin on-chain. Aqua también soporta Liquid Network, dándote tres redes en una sola app.'
		},
		{
			question: '¿Cuál es la diferencia entre una billetera hot y una billetera cold?',
			answer:
				'Una billetera hot (móvil o de escritorio) está conectada a internet — conveniente para gastar pero más vulnerable a ataques online. Una billetera cold (dispositivo de hardware) mantiene las claves fuera de línea — segura para almacenamiento a largo plazo pero menos conveniente para transacciones diarias. Úsalas juntas.'
		},
		{
			question: '¿Qué billetera Bitcoin funciona con BitTasker?',
			answer:
				'Cualquier billetera que soporte pagos Lightning funciona con BitTasker. Esto incluye Blink Wallet, Aqua Wallet y la mayoría de las billeteras compatibles con Lightning. En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o un pago Lightning en la billetera que abre con una llave de acceso. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago.'
		},
		{
			question:
				'¿Necesito una billetera de hardware si solo tengo una cantidad pequeña de Bitcoin?',
			answer:
				'No necesariamente. Si tus tenencias de Bitcoin son pequeñas (menos de unos pocos cientos de dólares), una billetera móvil gratuita de autocustodia como Aqua es suficiente. A medida que tus tenencias crezcan, invertir en una billetera de hardware vale la pena por la seguridad adicional.'
		}
	],
	bitTaskerCta: {
		heading: 'Usa Tu Billetera Bitcoin para Ganar en BitTasker',
		body: 'Sin importar qué billetera elijas, BitTasker te permite recibir pagos de freelance en Bitcoin por Lightning, on-chain o vía escrow multi-chain. Recibe pagos directamente en tu billetera.',
		buttonText: 'Empieza a Freelancear con Bitcoin',
		buttonHref: '/auth/signup'
	}
};
