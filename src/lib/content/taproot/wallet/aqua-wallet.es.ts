import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Aqua Wallet: Bitcoin, Liquid y Lightning',
		subtitle:
			'Billetera autocustodia para gastar stablecoins y enviar Bitcoin — todo en una sola app'
	},
	answerBlock:
		'Aqua Wallet es una billetera Bitcoin de autocustodia construida por JAN3 que soporta tres redes en una sola aplicación: Bitcoin en la Liquid Network para transacciones confidenciales rápidas, y Lightning para micropagos instantáneos. Cuenta con Tether USDt nativo en Liquid, convirtiéndola en una de las pocas billeteras donde puedes guardar Bitcoin y gastar stablecoins sin salir de la app. Disponible en iOS y Android sin requisitos de KYC, Aqua te da control total de tus claves manteniendo la experiencia lo suficientemente simple para el uso diario en El Salvador, Latinoamérica y el mundo.',
	sections: [
		{
			heading: '¿Qué Hace Diferente a Aqua Wallet de Otras Billeteras Bitcoin?',
			body: 'La mayoría de las billeteras Bitcoin te obligan a elegir entre funcionalidad on-chain y la velocidad de Lightning. Aqua Wallet resuelve esto soportando Bitcoin, Liquid Network y Lightning en una sola interfaz. Puedes recibir BTC on-chain, hacer swap a Liquid para transacciones más rápidas y baratas, o usar Lightning para pagos instantáneos. El soporte nativo de Tether USDt en Liquid significa que puedes guardar un stablecoin en dólares junto a tu Bitcoin — útil en regiones donde la volatilidad del precio importa, como El Salvador y Latinoamérica. Aqua también te permite crear múltiples billeteras dentro de la misma app, para separar tus ahorros de tu dinero para gastos sin manejar diferentes aplicaciones.'
		},
		{
			heading: '¿Cómo Maneja Aqua Wallet los Stablecoins?',
			body: 'Aqua Wallet integra Tether USDt nativamente en la Liquid Network. A diferencia de muchas billeteras que solo soportan stablecoins ERC-20 en Ethereum, Aqua te permite guardar y enviar USDt en Liquid — una sidechain de Bitcoin con bloques más rápidos y tarifas más bajas que Ethereum. Esto es especialmente valioso para freelancers, remesas y comercio cotidiano en Latinoamérica, donde la estabilidad del dólar se prefiere sobre la volatilidad del Bitcoin para gastos diarios. Puedes hacer swap entre BTC y USDt dentro de la app, guardar ambos activos en billeteras separadas y enviar cualquiera a cualquier persona en la Liquid Network. El modelo de autocustodia significa que ningún intermediario guarda tus stablecoins — tú controlas las claves.'
		},
		{
			heading: '¿Es Aqua Wallet Seguro y Sin KYC?',
			body: 'Aqua Wallet es completamente de autocustodia, lo que significa que tus claves privadas nunca salen de tu dispositivo y ningún tercero tiene acceso a tus fondos. No hay requisitos de KYC (Conoce a Tu Cliente) — descargas la app, creas una billetera y empiezas a usarla inmediatamente. Esto hace que Aqua sea accesible para cualquier persona sin importar su ubicación o estado documental. La billetera es construida por JAN3, una empresa de tecnología Bitcoin fundada por Samson Mow, lo que aporta credibilidad institucional al proyecto. Las funciones de seguridad incluyen respaldo estándar con seed phrase, protección con PIN y autenticación biométrica en dispositivos compatibles. Como con cualquier billetera de autocustodia, la contrapartida es responsabilidad total: si pierdes tu seed phrase, no hay recuperación de cuenta.'
		},
		{
			heading: '¿Cómo se Compara Aqua Wallet con Blink Wallet?',
			body: 'Aqua Wallet y Blink Wallet sirven a diferentes nichos en el ecosistema Bitcoin. Aqua es de autocustodia y soporta tres redes (Bitcoin, Liquid, Lightning), haciéndola mejor para usuarios que quieren control sobre sus claves y acceso a stablecoins. Blink Wallet (antes Bitcoin Beach Wallet) es custodial y está enfocada en Lightning, diseñada para simplicidad y pagos cotidianos con funciones como herramientas POS para comerciantes y Circles comunitarias. Si priorizas la autocustodia y el acceso a stablecoins, elige Aqua. Si priorizas facilidad de uso para pagos Lightning y adopción comercial, Blink es una excelente opción. Ambas billeteras son populares en El Salvador y soportan múltiples idiomas incluyendo español.'
		},
		{
			heading: '¿Puedo Usar Aqua Wallet para Pagos de Freelance?',
			body: 'Sí. Aqua Wallet es ideal para recibir pagos de freelance en Bitcoin. Puedes recibir BTC on-chain para pagos más grandes o Lightning para transacciones más pequeñas y rápidas. La opción de Liquid Network es útil para pagos de tamaño medio donde quieres tarifas más bajas que Bitcoin on-chain pero no necesitas Lightning. Si trabajas a través de plataformas como BitTasker que soportan pagos multi-chain, puedes recibir tus ganancias en BTC, Lightning o BTC directamente en tu Aqua Wallet. La capacidad de guardar USDt en Liquid también significa que puedes convertir ganancias volátiles de Bitcoin en stablecoins si prefieres ahorros denominados en dólares.'
		},
		{
			heading: '¿En Qué Países Está Disponible Aqua Wallet?',
			body: 'Aqua Wallet está disponible globalmente en iOS y Android sin restricciones geográficas. No hay KYC, así que usuarios en cualquier país pueden descargarla y empezar a usarla inmediatamente. La billetera tiene particular relevancia en El Salvador y Latinoamérica, donde JAN3 ha estado promoviendo activamente la adopción del Bitcoin. Usuarios en Estados Unidos, Europa y Asia también usan Aqua por su funcionalidad multi-red. La app soporta inglés y español como idiomas principales, haciéndola accesible en toda Latinoamérica. Dado que Aqua es de autocustodia, no hay integraciones bancarias regionales — las transacciones ocurren directamente en las redes Bitcoin, Liquid y Lightning.'
		}
	],
	faq: [
		{
			question: '¿Es Aqua Wallet gratis de usar?',
			answer:
				'Aqua Wallet es gratis de descargar y usar. No hay tarifas de suscripción. Se aplican tarifas de red estándar cuando envías Bitcoin, transacciones Liquid o pagos Lightning — estas se pagan a las respectivas redes, no a Aqua.'
		},
		{
			question: '¿Puedo comprar Bitcoin directamente en Aqua Wallet?',
			answer:
				'Aqua Wallet soporta la compra de Bitcoin a través de servicios de terceros integrados. También puedes recibir Bitcoin desde otras billeteras, exchanges o plataformas de pago. La disponibilidad de opciones de compra dentro de la app puede variar por región.'
		},
		{
			question: '¿Aqua Wallet soporta Lightning Network?',
			answer:
				'Sí, Aqua Wallet soporta pagos Lightning Network junto con Bitcoin on-chain y Liquid Network. Puedes enviar y recibir pagos Lightning para transacciones instantáneas con tarifas bajas.'
		},
		{
			question: '¿Qué es Tether USDt en Liquid Network?',
			answer:
				'Tether USDt en Liquid es un stablecoin anclado al dólar que funciona en la Liquid Network, una sidechain de Bitcoin. Ofrece transacciones más rápidas y tarifas más bajas que USDt en Ethereum, haciéndolo práctico para el gasto cotidiano en regiones como Latinoamérica.'
		},
		{
			question: '¿Cuántas billeteras puedo crear en Aqua?',
			answer:
				'Aqua Wallet te permite crear múltiples billeteras dentro de una sola app. Esto te permite separar tus ahorros de tu dinero para gastos, organizar fondos por propósito o gestionar diferentes activos independientemente.'
		},
		{
			question: '¿Quién construyó Aqua Wallet?',
			answer:
				'Aqua Wallet fue construida por JAN3, una empresa de tecnología Bitcoin fundada por Samson Mow. JAN3 se enfoca en avanzar la adopción del Bitcoin a nivel mundial, con énfasis particular en Latinoamérica y mercados emergentes.'
		},
		{
			question: '¿Es Aqua Wallet mejor que las billeteras de hardware?',
			answer:
				'Aqua Wallet y las billeteras de hardware sirven para diferentes propósitos. Las billeteras de hardware como Coldcard y Ledger están diseñadas para almacenamiento en frío a largo plazo de grandes tenencias de Bitcoin. Aqua es una billetera móvil optimizada para transacciones diarias, gastos y acceso multi-red. Muchos Bitcoiners usan ambas: una billetera de hardware para ahorros y Aqua para gastos.'
		}
	],
	bitTaskerCta: {
		heading: 'Recibe Pagos en Bitcoin en Tu Aqua Wallet',
		body: 'Conecta tu Aqua Wallet a BitTasker y recibe pagos de freelance en BTC, Lightning o stablecoins — directamente a tu billetera de autocustodia.',
		buttonText: 'Empieza a Ganar en BitTasker',
		buttonHref: '/auth/signup'
	}
};
