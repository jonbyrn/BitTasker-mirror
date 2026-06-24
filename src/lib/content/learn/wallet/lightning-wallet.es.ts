import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Billetera Lightning: Pagos Instantáneos en Bitcoin',
		subtitle: 'Todo lo que necesitas saber sobre la capa de pagos más rápida de Bitcoin'
	},
	answerBlock:
		'Una billetera Lightning es un tipo de billetera Bitcoin construida sobre la Lightning Network, una solución de Capa 2 que permite transacciones Bitcoin instantáneas y de bajo costo. A diferencia de los pagos on-chain de Bitcoin que tardan 10-60 minutos en confirmarse, los pagos Lightning se liquidan en segundos por fracciones de centavo. Esto hace que Lightning sea ideal para compras diarias, propinas, remesas y pagos de freelance. En El Salvador, la adopción de Lightning ha sido la piedra angular de la estrategia Bitcoin del país, impulsando pagos a comerciantes en todo el territorio. Ya sea que elijas una billetera custodial como Blink para simplicidad o una de autocustodia como Aqua para control de claves, Lightning es la forma más rápida de usar Bitcoin para transacciones diarias.',
	sections: [
		{
			heading: '¿Qué Es Lightning Network y Por Qué Bitcoin la Necesita?',
			body: 'La Lightning Network es un protocolo de pagos de Capa 2 construido sobre Bitcoin. Fue creada para resolver las limitaciones de escalabilidad de Bitcoin — las transacciones on-chain están limitadas a aproximadamente 7 por segundo y tardan 10-60 minutos en confirmarse. Lightning crea canales de pago entre usuarios, permitiendo miles de transacciones fuera de la cadena que se liquidan instantáneamente en la blockchain de Bitcoin cuando el canal se cierra. Piensa en ello como una pestaña en un bar: en lugar de pagar en efectivo después de cada trago, abres una pestaña y liquidas una vez al final. Para Bitcoin, esto significa que puedes enviar satoshis instantáneamente con tarifas negligible, haciendo que las micro-transacciones y los pagos diarios sean prácticos por primera vez.'
		},
		{
			heading: '¿Cuál Es la Diferencia Entre Billeteras Lightning Custodiales y de Autocustodia?',
			body: 'Las billeteras Lightning custodiales (como Blink Wallet) guardan tu Bitcoin en tu nombre — confías en el servicio para gestionar los canales Lightning y mantener tus fondos seguros. El compromiso es la simplicidad: sin gestión de canales, sin preocupaciones de capacidad de canal y configuración instantánea. Las billeteras Lightning de autocustodia (como Aqua Wallet o el modo de autocustodia de Wallet of Satoshi) te dan control total de tus claves y canales Lightning. Gestiona tu propia capacidad de canal y conexiones de nodo. El compromiso es la complejidad: necesitas mantener la liquidez del canal y entender conceptos básicos de Lightning. Para principiantes, custodial es más simple. Para usuarios que valoran la soberanía, autocustodia es el camino. Ambas opciones están ampliamente disponibles y son gratis de descargar.'
		},
		{
			heading: 'Mejores Billeteras Lightning en 2026',
			body: 'Aqua Wallet es la mejor opción de autocustodia, soportando Lightning junto con Bitcoin on-chain y Liquid Network — tres redes en una app gratuita. Blink Wallet (antes Bitcoin Beach Wallet) es la mejor opción custodial con su saldo denominado en dólares, herramientas POS para comerciantes y soporte multilingüe en seis idiomas. Wallet of Satoshi es una billetera Lightning custodial popular con una interfaz limpia. Muun es una billetera híbrida que soporta tanto on-chain como Lightning con un solo conjunto de claves. Para la mayoría de los usuarios en El Salvador y Latinoamérica, Aqua o Blink cubre las necesidades Lightning diarias. Elige Aqua para autocustodia; elige Blink para simplicidad y funciones de comercio.'
		},
		{
			heading: 'Cómo Usa El Salvador Lightning Network',
			body: 'El Salvador se convirtió en el primer país en adoptar Bitcoin como moneda de curso legal en septiembre de 2021, y Lightning Network es la columna vertebral de esa adopción. El Chivo Wallet (ahora descontinuado) fue la billetera Lightning del gobierno, pero el ecosistema ha evolucionado para incluir Blink, Aqua y docenas de otras billeteras compatibles con Lightning. Comerciantes en todo El Salvador aceptan pagos Lightning vía códigos QR — desde vendedores ambulantes hasta grandes minoristas. La liquidación instantánea de Lightning y sus tarifas casi nulas lo hacen ideal para un país donde muchos ciudadanos no tienen acceso bancario y las remesas representan una porción significativa del PIB. La adopción de Lightning en El Salvador demuestra que Bitcoin puede funcionar como un sistema de pagos práctico diario, no solo como reserva de valor.'
		},
		{
			heading: 'Cómo Usa BitTasker Lightning para Pagos de Freelance',
			body: 'BitTasker integra Lightning Network para habilitar pagos instantáneos a freelancers. Cuando un cliente aprueba tu trabajo, el pago se envía por Lightning y llega a tu billetera en segundos — sin esperar transferencias bancarias ni confirmaciones on-chain. Esto es particularmente valioso para freelancers en países en desarrollo donde los canales de pago tradicionales son lentos y costosos. Los pagos Lightning en BitTasker tienen tarifas negligible, lo que significa que los freelancers conservan más de sus ganancias. Puedes recibir pagos Lightning en cualquier billetera compatible, incluyendo Blink, Aqua, Wallet of Satoshi o cualquier otra billetera habilitada con Lightning. La combinación de la protección de escrow de BitTasker y la liquidación instantánea de Lightning crea un sistema de pagos más rápido, más barato y más accesible que las plataformas tradicionales de freelance.'
		},
		{
			heading: 'Cómo Configurar una Billetera Lightning',
			body: 'Configurar una billetera Lightning toma aproximadamente dos minutos. Descarga Aqua Wallet o Blink Wallet de la App Store o Google Play. Sigue las indicaciones en pantalla para crear una nueva billetera — recibirás una dirección Lightning (similar a una dirección de correo electrónico) que puedes compartir para recibir pagos. No se requiere verificación de identidad para uso básico. Para fondar tu billetera, puedes comprar Bitcoin a través de servicios integrados, recibir pagos Lightning desde otra billetera o transferir Bitcoin desde un exchange. Una vez fundada, puedes enviar pagos Lightning escaneando códigos QR o ingresando una factura Lightning. Para la mayoría de los usuarios, la configuración por defecto funciona bien — las funciones avanzadas como gestión de canales son opcionales y solo se necesitan para billeteras de autocustodia.'
		}
	],
	faq: [
		{
			question: '¿Qué tan rápidos son los pagos Lightning?',
			answer:
				'Los pagos Lightning se liquidan en 1-3 segundos. Compara esto con los pagos on-chain de Bitcoin que tardan 10-60 minutos en confirmarse. Lightning es la forma más rápida de enviar y recibir Bitcoin.'
		},
		{
			question: '¿Cuáles son las tarifas de Lightning Network?',
			answer:
				'Las tarifas de Lightning son típicamente fracciones de centavo por transacción — generalmente entre $0.0001 y $0.01 dependiendo de la ruta de pago. Esto hace que Lightning sea ideal para micro-transacciones y gasto diario.'
		},
		{
			question: '¿Es segura Lightning Network?',
			answer:
				'Lightning Network está construida sobre el modelo de seguridad de Bitcoin. Las transacciones están aseguradas por pruebas criptográficas y la blockchain de Bitcoin. Sin embargo, las billeteras Lightning custodiales conllevan riesgo de custodia — confías en el servicio con tus fondos. Las billeteras de autocustodia te dan control total.'
		},
		{
			question: '¿Puedo usar Lightning en cualquier billetera Bitcoin?',
			answer:
				'No, no todas las billeteras Bitcoin soportan Lightning. Necesitas una billetera específicamente diseñada para pagos Lightning. Opciones populares incluyen Aqua Wallet, Blink Wallet, Wallet of Satoshi y Muun. Siempre verifica el soporte de Lightning antes de elegir una billetera.'
		},
		{
			question: '¿Qué es una dirección Lightning?',
			answer:
				'Una dirección Lightning es un identificador legible para humanos para recibir pagos Lightning, similar a una dirección de correo electrónico. Por ejemplo: usuario@billetera.com. Simplifica el proceso de pago al reemplazar facturas Lightning complejas con una dirección fácil de compartir.'
		},
		{
			question: '¿Puedo recibir pagos Lightning de cualquier persona?',
			answer:
				'Sí, cualquiera con una billetera compatible con Lightning puede enviarte un pago usando tu dirección Lightning o escaneando tu código QR. Lightning es interoperable entre billeteras — no necesitas usar la misma billetera que el remitente.'
		},
		{
			question: '¿Cómo se compara Lightning con Bitcoin on-chain para pagos?',
			answer:
				'Lightning es más rápido (segundos vs minutos), más barato (fracciones de centavo vs $1-5+ en tarifas) y soporta micro-transacciones (tan pequeñas como unos pocos satoshis). Bitcoin on-chain es mejor para transacciones grandes e infrecuentes donde se necesita máxima seguridad. Lightning es mejor para gasto diario y pagos.'
		}
	],
	bitTaskerCta: {
		heading: 'Recibe Pagos Instantáneos por Lightning',
		body: 'BitTasker usa Lightning Network para pagar a freelancers al momento de que el trabajo sea aprobado. Sin esperas bancarias, sin tarifas altas — solo Bitcoin en tu billetera en segundos.',
		buttonText: 'Empieza a Ganar Bitcoin',
		buttonHref: '/auth/signup'
	}
};
