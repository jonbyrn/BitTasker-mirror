import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'DeFi en Bitcoin: Finanzas Descentralizadas en Rootstock',
		subtitle:
			'DeFi en Bitcoin ya existe. Rootstock potencia lending, borrowing, DEX y stablecoins asegurados por el hash rate de Bitcoin.'
	},
	answerBlock:
		'El DeFi en Bitcoin se refiere a aplicaciones financieras descentralizadas construidas en Bitcoin a través de plataformas Layer 2 como Rootstock. En lugar de mantener Bitcoin como un almacenamiento pasivo de valor, el DeFi en Bitcoin te permite prestar, pedir prestado, comerciar y generar yield — todo asegurado por la tasa de hash de Bitcoin a través de merged mining. Rootstock alberga el ecosistema DeFi de Bitcoin más grande con protocolos como Sovryn (trading y lending descentralizado), MoneyOnChain (stablecoins respaldadas por Bitcoin) y Tropykus (cuentas de ahorro). Con más de $235M en TVL, el DeFi en Bitcoin en Rootstock ofrece una forma de hacer trabajar tu Bitcoin sin salir del modelo de seguridad de Bitcoin.',
	sections: [
		{
			heading: '¿Qué es el DeFi en Bitcoin?',
			body: 'El DeFi en Bitcoin es el ecosistema de aplicaciones financieras descentralizadas que corren en sidechains de Bitcoin o redes Layer 2. A diferencia del DeFi en Ethereum, que corre en la blockchain propia de Ethereum, el DeFi en Bitcoin opera en redes como Rootstock que están aseguradas por Bitcoin a través de merged mining. Esto significa que tus fondos en protocolos DeFi de Bitcoin se benefician de la seguridad de Bitcoin — la tasa de hash más grande del mundo. El DeFi en Bitcoin incluye lending, borrowing, exchanges descentralizados, stablecoins, yield farming y tokenización de activos, todo usando BTC o tokens anclados a BTC como activo principal.'
		},
		{
			heading: '¿Qué protocolos DeFi corren en Rootstock?',
			body: 'Rootstock alberga varios protocolos DeFi establecidos. Sovryn es el más grande, ofreciendo un exchange descentralizado (AMM), trading con margen, lending y borrowing. MoneyOnChain proporciona stablecoins respaldadas por Bitcoin (DOC y RIF Dollar) que mantienen un anclaje 1:1 a USD mientras están respaldadas por BTC bloqueado en Rootstock. Tropykus ofrece cuentas de ahorro con yields competitivos desplegando fondos a través de múltiples protocolos DeFi. Estos protocolos han estado en producción por años, procesando miles de millones en volumen y demostrando la viabilidad del DeFi construido directamente en la capa de seguridad de Bitcoin.'
		},
		{
			heading: '¿Cómo funciona el lending en el DeFi de Bitcoin?',
			body: 'El lending de DeFi en Bitcoin en Rootstock funciona de manera similar a los protocolos de lending de Ethereum. Los usuarios depositan BTC o RBTC en pools de lending y ganan intereses de los prestatarios. Los prestatarios proporcionan colateral (típicamente más BTC de lo que piden prestado) y reciben préstamos en stablecoins u otros activos. Los contratos inteligentes aplican reglas de liquidación — si el valor del colateral cae por debajo de un umbral, se vende automáticamente para reembolsar el préstamo. En Sovryn, por ejemplo, puedes prestar BTC y ganar yield, o pedir stablecoins prestadas contra tu colateral BTC sin venderlo. Todo esto es ejecutado por contratos inteligentes auditable en Rootstock, asegurados por el hash rate de Bitcoin.'
		},
		{
			heading: '¿Qué son las stablecoins respaldadas por Bitcoin?',
			body: 'Las stablecoins respaldadas por Bitcoin son tokens anclados al dólar estadounidense pero colateralizados con Bitcoin bloqueado en Rootstock. El DOC (Dollar on Chain) de MoneyOnChain es el ejemplo principal — mantiene un anclaje 1:1 a USD a través de mecanismos de arbitraje y está respaldado por BTC depositado en el protocolo de MoneyOnChain. RIF Dollar es otra stablecoin en el ecosistema de Rootstock. A diferencia de las stablecoins centralizadas (USDT, USDC), las stablecoins respaldadas por Bitcoin son descentralizadas y transparentes — puedes verificar el colateral en cadena. Esto las hace atractivas para usuarios DeFi que quieren estabilidad de dólar sin depender de emisores centralizados.'
		},
		{
			heading: '¿Cuáles son los riesgos del DeFi en Bitcoin?',
			body: 'El DeFi en Bitcoin conlleva varios riesgos. Los bugs en contratos inteligentes podrían llevar a pérdida de fondos, aunque los protocolos auditados mitigan esto. El riesgo de bridge existe cuando BTC se bloquea en Rootstock — si el bridge federado tiene problemas, acceder a los fondos podría verse afectado temporalmente. El riesgo de liquidez significa que algunos pools DeFi pueden no tener suficientes activos para retiros grandes. El riesgo de yield — las tasas anunciadas pueden cambiar según las condiciones del mercado. El riesgo regulatorio — las regulaciones de DeFi están evolucionando globalmente. El riesgo de contraparte se reduce comparado con plataformas centralizadas pero no se elimina completamente. Siempre investiga los protocolos a fondo, comienza con cantidades pequeñas y entiende los riesgos antes de comprometer capital significativo.'
		},
		{
			heading: '¿Por qué está creciendo el DeFi en Bitcoin?',
			body: 'El DeFi en Bitcoin está creciendo porque los holders de Bitcoin quieren ganar yield en su BTC sin vender ni mudarse a Ethereum. Rootstock hace esto posible al proporcionar contratos inteligentes compatibles con EVM asegurados por Bitcoin. El interés institucional está aumentando mientras entidades reguladas buscan formas conformes de acceder a rendimientos DeFi. El crecimiento de la infraestructura Bitcoin Layer 2 también ha mejorado la experiencia de usuario, haciendo más fácil hacer bridge de BTC e interactuar con protocolos DeFi. El uso de BitTasker de Rootstock para escrow también demuestra utilidad DeFi del mundo real más allá del comercio — asegurando pagos freelance con contratos inteligentes.'
		}
	],
	faq: [
		{
			question: '¿Puedo ganar yield en Bitcoin con DeFi?',
			answer:
				'Sí. En Rootstock, puedes prestar BTC a través de protocolos como Sovryn y Tropykus para ganar intereses. También puedes proveer liquidez a pools de DEX o participar en yield farming. Los retornos varían según las condiciones del mercado y factores específicos del protocolo.'
		},
		{
			question: '¿Es seguro el DeFi en Bitcoin?',
			answer:
				'El DeFi en Bitcoin en Rootstock está asegurado por la tasa de hash de Bitcoin a través de merged mining, proporcionando fuerte seguridad. Sin embargo, los riesgos de contratos inteligentes, bridge y mercado aún existen. Usa protocolos auditados, comienza con cantidades pequeñas y nunca inviertas más de lo que puedas permitirte perder.'
		},
		{
			question: '¿Cuál es la diferencia entre DeFi en Bitcoin y DeFi en Ethereum?',
			answer:
				'El DeFi en Bitcoin usa BTC como activo principal y está asegurado por mineros de Bitcoin. El DeFi en Ethereum usa ETH y está asegurado por el Proof of Stake de Ethereum. El DeFi en Bitcoin tiene menos TVL y menos protocolos pero se beneficia del modelo de seguridad de Bitcoin y atrae a usuarios nativos de Bitcoin.'
		},
		{
			question: '¿Necesito envolver mi BTC para usar DeFi en Bitcoin?',
			answer:
				'En Rootstock, haces bridge de BTC para obtener RBTC (anclado 1:1 a BTC). Esto es diferente a envolver — RBTC existe en una sidechain de Bitcoin asegurada por merged mining, no en Ethereum. El proceso de bridge es sencillo a través del bridge federado de Rootstock.'
		},
		{
			question: '¿Cuál es el TVL del DeFi en Bitcoin en Rootstock?',
			answer:
				'El TVL total de Rootstock ha oscilado entre $235M y $267M, con la mayoría en protocolos DeFi como Sovryn y MoneyOnChain. Esto convierte a Rootstock en una de las sidechains de Bitcoin más grandes por valor bloqueado.'
		},
		{
			question: '¿Puedo usar el DeFi en Bitcoin para freelancing?',
			answer:
				'Sí. BitTasker usa contratos inteligentes de Rootstock para escrow sin necesidad de confianza en proyectos freelance. Esta es una aplicación DeFi práctica donde los contratos inteligentes garantizan el pago sin intermediarios de plataforma.'
		}
	],
	bitTaskerCta: {
		heading: 'Haz trabajar tu Bitcoin con BitTasker',
		body: 'BitTasker usa infraestructura DeFi de Rootstock para escrow seguro y sin necesidad de confianza. Tus pagos freelance están protegidos por la seguridad de Bitcoin — ninguna empresa retiene tus fondos.',
		buttonText: 'Comienza Ahora',
		buttonHref: '/auth/signup'
	}
};
