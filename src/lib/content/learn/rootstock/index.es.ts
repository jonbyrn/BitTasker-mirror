import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Rootstock: Construye Contratos Inteligentes en Bitcoin',
		subtitle:
			'Contratos inteligentes compatibles con EVM, RBTC, DeFi y escrow — la referencia completa de Rootstock.'
	},
	answerBlock:
		'Rootstock (RSK) es una sidechain de Bitcoin que trae contratos inteligentes compatibles con Ethereum a la red de Bitcoin. Como la sidechain de smart contracts de Bitcoin más antigua y establecida, Rootstock está asegurada por la tasa de hash de Bitcoin a través de merged mining, usa RBTC para tarifas de gas y tiene más de $235 millones en valor total bloqueado (TVL). Impulsa protocolos de DeFi, tokenización, NFTs, DAOs y el sistema de escrow detrás de BitTasker. Si quieres construir en Bitcoin sin salir del ecosistema EVM, Rootstock es el puente. Esta guía cubre todo: qué es Rootstock, cómo se compara con alternativas, cómo funcionan los contratos inteligentes en Bitcoin, el panorama DeFi y cómo usar RBTC.',
	sections: [
		{
			heading: '¿Qué es Rootstock?',
			body: 'Rootstock (RSK) es una sidechain de Bitcoin que trae contratos inteligentes compatibles con Ethereum a la red de Bitcoin. Lanzada en enero de 2018, es la plataforma de smart contracts de Bitcoin más antigua en producción. Rootstock está asegurada por la tasa de hash de Bitcoin a través de merged mining — los mineros de Bitcoin minan bloques de Bitcoin y Rootstock simultáneamente, brindando seguridad de nivel Bitcoin a la sidechain. Usa RBTC, un token vinculado 1:1 a Bitcoin, para tarifas de gas. Los desarrolladores despliegan contratos inteligentes en Solidity que se liquidan en la capa de seguridad de Bitcoin. Con más de $235 millones en TVL y adopción institucional creciente en Japón, Brasil y América Latina, Rootstock cierra la brecha entre la seguridad inigualable de Bitcoin y la programabilidad necesaria para DeFi, escrow y tokenización de activos.'
		},
		{
			heading: '¿Qué es RBTC?',
			body: 'RBTC (Rootstock Bitcoin) es el token nativo de la red Rootstock, vinculado 1:1 a Bitcoin. Se usa para pagar tarifas de gas al ejecutar contratos inteligentes en Rootstock — similar a cómo funciona ETH en Ethereum. Obtienes RBTC al hacer bridge de BTC desde la cadena principal de Bitcoin a Rootstock a través de un bridge federado. Cuando quieres volver a Bitcoin, RBTC se quema en Rootstock y BTC se desbloquea en la cadena principal. RBTC no es una criptomoneda separada — representa BTC operando en la sidechain de Rootstock. El vinculo es mantenido por una red de funcionarios que bloquean BTC cuando emiten RBTC y desbloquean BTC cuando RBTC se quema. Nuestra guía de RBTC cubre bridge, estimación de gas y configuración de billetera.'
		},
		{
			heading: '¿Cómo funcionan los contratos inteligentes en Rootstock?',
			body: 'Rootstock es completamente compatible con EVM, significando que los desarrolladores de Ethereum pueden desplegar contratos existentes en Solidity sin cambios de código. Toda la cadena de herramientas de desarrollo de Ethereum — Remix, Hardhat, Foundry, MetaMask, OpenZeppelin — funciona en Rootstock listo para usar. Los contratos inteligentes en Rootstock se ejecutan con seguridad de nivel Bitcoin a través de merged mining. Las tarifas de gas se pagan en RBTC y son significativamente más bajas que Ethereum (típicamente menores a $0.01 por transacción). Rootstock también soporta contratos precompilados para operaciones nativas de Bitcoin como verificación de firmas y funciones hash. Para desarrolladores que quieren construir en Bitcoin sin aprender un nuevo lenguaje de programación, Rootstock es el camino más fácil.'
		},
		{
			heading: '¿Qué es Bitcoin DeFi?',
			body: 'Bitcoin DeFi se refiere a aplicaciones de finanzas descentralizadas construidas en Bitcoin o sidechains de Bitcoin. Rootstock alberga un ecosistema DeFi en crecimiento: Sovryn (trading y lending descentralizado), MoneyOnChain (stablecoins respaldadas por Bitcoin como DOC y rDOC), Tropykus (ahorros y lending) y Beex (exchange). Estos protocolos aprovechan la seguridad de Bitcoin mientras proporcionan la programabilidad necesaria para instrumentos financieros complejos. Con más de $235 millones en TVL solo en Rootstock, Bitcoin DeFi está creciendo rápidamente. La ventaja clave sobre Ethereum DeFi: la seguridad subyacente está respaldada por la tasa de hash de Bitcoin — la red Proof of Work más descentralizada y probada.'
		},
		{
			heading: 'Rootstock vs. otras Capas 2 de Bitcoin',
			body: 'Rootstock se destaca entre las Capas 2 de Bitcoin por su completa compatibilidad con EVM, su historial de producción más largo (desde 2018) y su consenso asegurado por Bitcoin a través de merged mining. Comparado con Stacks: Rootstock usa Solidity (el lenguaje de Ethereum); Stacks usa Clarity. Rootstock tiene herramientas EVM; Stacks tiene sBTC y la actualización Nakamoto. Comparado con Liquid: Rootstock tiene contratos inteligentes y DeFi; Liquid se enfoca en transacciones confidenciales y emisión de activos. Comparado con Merlin y BOB: Rootstock es más probado; las cadenas más nuevas ofrecen tecnología ZK-rollup. Para freelancing y escrow, la madurez y compatibilidad EVM de Rootstock lo convierten en la opción más práctica.'
		},
		{
			heading: 'Cómo usa BitTasker Rootstock',
			body: 'BitTasker usa contratos inteligentes de Rootstock como columna vertebral de su sistema de escrow. Cuando un cliente financia un proyecto, el pago se bloquea en un contrato inteligente de Rootstock — minado junto con Bitcoin para seguridad. El contrato aplica los términos acordados: los fondos se liberan cuando se aprueban los hitos, las disputas siguen reglas transparentes de resolución. Ninguna entidad — incluyendo BitTasker — puede mover los fondos en escrow unilateralmente. Rootstock fue elegido por su compatibilidad EVM (habilitando contratos Solidity estándar), seguridad de nivel Bitcoin (merged mining), bajas tarifas de gas (menores a $0.01) y su historial probado (más de 6 años en producción).'
		}
	],
	faq: [
		{
			question: '¿Rootstock es lo mismo que Bitcoin?',
			answer:
				'No. Rootstock es una sidechain — una red separada conectada a Bitcoin a través de un bridge de dos vías. Corre en paralelo a Bitcoin, no encima de ella. Rootstock trae funcionalidad de contratos inteligentes mientras está asegurada por la tasa de hash de Bitcoin a través de merged mining.'
		},
		{
			question: '¿Cuál es la diferencia entre Rootstock y Ethereum?',
			answer:
				'Ambos son compatibles con EVM, pero Rootstock está asegurado por Bitcoin a través de merged mining mientras Ethereum usa Proof of Stake. Rootstock tiene comisiones más bajas y permite uso directo de BTC en contratos. Ethereum tiene un ecosistema de desarrolladores más grande y más TVL.'
		},
		{
			question: '¿Necesito saber Solidity para usar Rootstock?',
			answer:
				'Para desplegar contratos inteligentes, sí — Rootstock usa Solidity. Para usar dApps en Rootstock, solo necesitas una wallet compatible como MetaMask configurada para la red Rootstock.'
		},
		{
			question: '¿Cuánto cuesta usar Rootstock?',
			answer:
				'Las tarifas de gas son significativamente más bajas que Ethereum — típicamente menores a $0.01 por transacción. Necesitas RBTC para pagar gas, que obtienes al hacer bridge de BTC a Rootstock.'
		},
		{
			question: '¿Es seguro Rootstock?',
			answer:
				'Rootstock está asegurado por la tasa de hash de Bitcoin a través de merged mining. Ha estado en producción desde 2018 sin incidentes de seguridad. El bridge federado ha procesado miles de millones en transferencias cross-chain.'
		},
		{
			question: '¿Cuál es el TVL en Rootstock?',
			answer:
				'El TVL de Rootstock ha oscilado entre $235 millones y $267 millones, convirtiéndolo en una de las sidechains de Bitcoin más grandes por valor total bloqueado. El TVL fluctúa con las condiciones del mercado pero ha mostrado crecimiento consistente.'
		},
		{
			question: '¿Cómo obtengo RBTC?',
			answer:
				'Haz bridge de BTC desde la cadena principal de Bitcoin a Rootstock usando el bridge oficial o billeteras compatibles. Un BTC se convierte en un RBTC. Necesitas una pequeña cantidad de RBTC para tarifas de gas.'
		}
	],
	bitTaskerCta: {
		heading: 'Construye en Bitcoin con BitTasker',
		body: 'BitTasker usa contratos inteligentes de Rootstock para escrow sin confianza. Tus pagos están asegurados por la tasa de hash de Bitcoin — ninguna plataforma retiene tus fondos.',
		buttonText: 'Comienza Ahora',
		buttonHref: '/auth/signup'
	}
};
