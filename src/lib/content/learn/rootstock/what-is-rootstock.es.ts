import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Qué es Rootstock: Contratos Inteligentes en Bitcoin',
		subtitle:
			'Rootstock trae contratos inteligentes a Bitcoin. Aprende cómo la sidechain EVM más antigua de Bitcoin potencia DeFi, escrow y tokenización.'
	},
	answerBlock:
		'Rootstock (RSK) es una sidechain de Bitcoin que trae contratos inteligentes compatibles con Ethereum a la red de Bitcoin. Lanzada en 2018, es la sidechain EVM de Bitcoin más antigua y establecida, asegurada por la tasa de hash de Bitcoin a través de merged mining. Rootstock usa RBTC — un token anclado 1:1 a Bitcoin — para pagar gas fees, permitiendo a los desarrolladores desplegar contratos inteligentes en Solidity que se asientan en la capa de seguridad de Bitcoin. Con más de $235 millones en total value locked (TVL) y creciente adopción institucional en Japón, Brasil y América Latina, Rootstock cierra la brecha entre la seguridad incomparable de Bitcoin y la programabilidad necesaria para DeFi, escrow y tokenización de activos.',
	sections: [
		{
			heading: '¿Cómo se conecta Rootstock con Bitcoin?',
			body: 'Rootstock se conecta a Bitcoin a través de un mecanismo de two-way peg. Los usuarios bloquean BTC en un bridge federado en la mainchain de Bitcoin y reciben una cantidad equivalente de RBTC en la sidechain de Rootstock. RBTC está anclado 1:1 a Bitcoin, lo que significa que un RBTC siempre equivale a un BTC. Cuando quieres mover fondos de vuelta a Bitcoin, el proceso se invierte — RBTC se quema en Rootstock y BTC se desbloquea en la mainchain. Este two-way peg permite a los holders de Bitcoin acceder a funcionalidades de contratos inteligentes sin salir del modelo de seguridad de Bitcoin.'
		},
		{
			heading: '¿Qué hace a Rootstock diferente de otros Bitcoin Layer 2?',
			body: 'Rootstock se destaca porque es completamente compatible con EVM, lo que significa que los desarrolladores de Ethereum pueden desplegar contratos Solidity existentes sin cambios de código. A diferencia de otras soluciones de Bitcoin Layer 2, Rootstock hereda la seguridad de Bitcoin a través de merged mining — los mineros de Bitcoin minan simultáneamente bloques de Bitcoin y Rootstock, proporcionando seguridad a nivel de Bitcoin a la sidechain. También es la plataforma de contratos inteligentes de Bitcoin más madura, en producción desde enero de 2018 con más de seis años de tiempo de actividad ininterrumpido.'
		},
		{
			heading: '¿Qué es RBTC?',
			body: 'RBTC (Rootstock Bitcoin) es el token nativo de la red Rootstock, anclado 1:1 a Bitcoin. Se usa para pagar gas fees al ejecutar contratos inteligentes en Rootstock, similar a como funciona ETH en Ethereum. Obtienes RBTC al hacer bridge de BTC desde la mainchain de Bitcoin a Rootstock. El anclaje lo mantiene una red de bridge federado que bloquea BTC cuando emite RBTC y desbloquea BTC cuando RBTC se quema. RBTC no es una criptomoneda separada — representa BTC operando en la sidechain de Rootstock.'
		},
		{
			heading: '¿Qué puedes construir en Rootstock?',
			body: 'Rootstock soporta la gama completa de aplicaciones de contratos inteligentes: protocolos de finanzas descentralizadas (DeFi) como lending, borrowing e intercambios descentralizados; tokenización de activos del mundo real; NFTs; DAOs; y sistemas de escrow descentralizados. Porque Rootstock es compatible con EVM, toda la cadena de herramientas de desarrollo de Ethereum — Remix, Hardhat, MetaMask y bibliotecas OpenZeppelin — funciona en Rootstock listo para usar. Esto lo convierte en el camino más fácil para desarrolladores que quieren construir sobre Bitcoin sin aprender un nuevo lenguaje de programación.'
		},
		{
			heading: '¿Cómo se asegura Rootstock?',
			body: 'Rootstock está asegurado por Bitcoin a través de merged mining. Los mineros de Bitcoin minan bloques de Rootstock junto con bloques de Bitcoin usando el mismo hash power, lo que significa que un atacante necesitaría comprometer la tasa de hash de Bitcoin para atacar Rootstock. Esto convierte a Rootstock en una de las plataformas de contratos inteligentes más seguras del mundo — su seguridad está respaldada por la red Proof of Work más grande y descentralizada. La red ha operado sin interrupciones desde 2018, y el bridge federado ha procesado miles de millones de dólares en transferencias cross-chain.'
		},
		{
			heading: '¿Quién usa Rootstock?',
			body: 'Rootstock alberga un ecosistema en crecimiento de protocolos DeFi incluyendo Sovryn (trading y lending descentralizado), MoneyOnChain (stablecoins respaldadas por Bitcoin) y Tropykus (ahorro y lending). La adopción institucional está expandiéndose, particularmente en Japón donde exchanges como bitFlyer han integrado Rootstock, y en Brasil y Argentina donde DeFi Bitcoin está ganando terreno. BitTasker usa Rootstock para su sistema de escrow con contratos inteligentes, proporcionando protección de pago sin necesidad de confianza para freelancers y clientes.'
		}
	],
	faq: [
		{
			question: '¿Rootstock es lo mismo que Bitcoin?',
			answer:
				'No. Rootstock es una sidechain — una red separada que se conecta a Bitcoin a través de un two-way peg. Se ejecuta en paralelo con Bitcoin, no encima de ella. Rootstock trae funcionalidad de contratos inteligentes a Bitcoin mientras está asegurada por la tasa de hash de Bitcoin a través de merged mining.'
		},
		{
			question: '¿Cuál es la diferencia entre Rootstock y Ethereum?',
			answer:
				'Ambos son plataformas de contratos inteligentes compatibles con EVM, pero Rootstock está asegurado por Bitcoin a través de merged mining mientras Ethereum usa su propio consenso Proof of Stake. Rootstock tiene tarifas de transacción más bajas y permite el uso directo de BTC en contratos sin wrapping. Ethereum tiene un ecosistema de desarrolladores más grande y más total value locked.'
		},
		{
			question: '¿Necesito saber Solidity para usar Rootstock?',
			answer:
				'Si quieres desplegar contratos inteligentes, sí — Rootstock usa Solidity, el mismo lenguaje que Ethereum. Si quieres usar dApps en Rootstock, solo necesitas una billetera compatible como MetaMask configurada para la red de Rootstock.'
		},
		{
			question: '¿Cuánto cuesta usar Rootstock?',
			answer:
				'Los gas fees de Rootstock son significativamente más bajos que Ethereum, típicamente menos de $0.01 por transacción. Necesitas RBTC para pagar gas fees, que obtienes al hacer bridge de BTC a Rootstock.'
		},
		{
			question: '¿Es seguro Rootstock?',
			answer:
				'Rootstock está asegurado por la tasa de hash de Bitcoin a través de merged mining, haciéndolo una de las plataformas de contratos inteligentes más seguras. Ha estado en producción desde 2018 sin incidentes de seguridad. El bridge federado ha procesado miles de millones en transferencias cross-chain sin problemas.'
		},
		{
			question: '¿Cuál es el total value locked (TVL) en Rootstock?',
			answer:
				'El TVL de Rootstock ha fluctuado entre $235 millones y $267 millones, convirtiéndolo en una de las sidechains de Bitcoin más grandes por total value locked. El TVL fluctúa con las condiciones del mercado pero ha mostrado crecimiento consistente en adopción institucional y de retail.'
		}
	],
	bitTaskerCta: {
		heading: 'Construye sobre Bitcoin con BitTasker',
		body: 'BitTasker usa contratos inteligentes de Rootstock para proporcionar escrow sin necesidad de confianza para freelancers. Tus pagos están asegurados por el hash rate de Bitcoin — ninguna plataforma retiene tus fondos.',
		buttonText: 'Comienza Ahora',
		buttonHref: '/auth/signup'
	}
};
