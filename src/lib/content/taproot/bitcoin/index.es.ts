import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Pagos y Tecnología de Bitcoin Explicados',
		subtitle:
			'Lightning Network, contratos inteligentes, identidad Nostr, comparativas y stablecoins — la referencia completa.'
	},
	answerBlock:
		'Bitcoin es más que dinero digital — es una red de pagos global, una capa de dinero programable y la base para identidad descentralizada. Esta guía cubre el ecosistema de Bitcoin tal como se relaciona con freelancers y desarrolladores: Lightning Network para pagos instantáneos, contratos inteligentes para escrow programable, Nostr para identidad descentralizada, comparativas Bitcoin vs. Ethereum y stablecoins para estabilidad denominada en dólares. Ya sea que estés ganando tu primer Bitcoin o construyendo sobre el protocolo, esta es tu referencia completa para entender cómo Bitcoin impulsa la economía freelance moderna.',
	sections: [
		{
			heading: '¿Qué es la Lightning Network?',
			body: 'La Lightning Network es un protocolo de Capa 2 construido sobre Bitcoin que habilita transacciones instantáneas con comisiones casi nulas. En lugar de liquidar cada pago en la cadena principal de Bitcoin — que toma 10+ minutos y cuesta comisiones variables — Lightning crea canales de pago off-chain entre participantes. Los pagos se enrutan a través de una red de estos canales, llegando en milisegundos por fracciones de centavo. Para freelancers, Lightning significa recibir pago en el momento en que se aprueba el trabajo, sin esperar confirmaciones de blockchain. Lightning ha probado su viabilidad a escala nacional en El Salvador y es ahora el estándar para micropagos de Bitcoin en todo el mundo. Nuestra guía de Lightning Network explica canales, enrutamiento, billeteras y adopción del mundo real en profundidad.'
		},
		{
			heading: '¿Contratos inteligentes en Bitcoin: qué son?',
			body: 'Los contratos inteligentes en Bitcoin habilitan dinero programable — acuerdos auto-ejecutables donde los términos están escritos en código. A diferencia del modelo de cuentas de Ethereum, el modelo UTXO de Bitcoin requiere soluciones de Capa 2 para contratos inteligentes complejos. Rootstock (RSK) trae compatibilidad completa con EVM a Bitcoin, permitiendo contratos inteligentes en Solidity asegurados por la tasa de hash de Bitcoin a través de merged mining. Otros enfoques incluyen Stacks (lenguaje Clarity, sBTC), Ordinals e inscripciones (NFTs nativos de Bitcoin) y scripts basados en OP_CAT. Para freelancers, los contratos inteligentes potencian escrow sin confianza: los fondos se bloquean en código hasta que se apruebe el trabajo, eliminando la necesidad de un intermediario de confianza. Nuestra guía de contratos inteligentes cubre cada enfoque en detalle.'
		},
		{
			heading: '¿Qué es la identidad Nostr para freelancers?',
			body: 'Nostr (Notes and Other Stuff Transmitted by Relays) le da a los freelancers una identidad criptográfica que ninguna plataforma posee. Tu clave pública es tu nombre de usuario en cada servicio compatible con Nostr. Tu reputación — reseñas, trabajos completados, portafolio — viaja contigo porque está firmada con tu clave privada, no almacenada en la base de datos de una empresa. Si BitTasker cerrara mañana, tu identidad Nostr y todos tus datos de reputación firmados seguirían existiendo en relays y podrían importarse en cualquier plataforma compatible. Esto es fundamentalmente diferente a Upwork, donde tus años de reseñas desaparecen en el momento en que tu cuenta es suspendida. La identidad Nostr significa que posees tu reputación profesional para siempre.'
		},
		{
			heading: 'Bitcoin vs. Ethereum: ¿cuáles son las diferencias?',
			body: 'Bitcoin y Ethereum son las dos criptomonedas más grandes, construidas para diferentes propósitos. Bitcoin es un almacenamiento de valor descentralizado y red de pagos — su seguridad proviene de la mayor tasa de hash de Proof of Work en existencia, y su diseño prioriza simplicidad, seguridad y descentralización. Ethereum es una plataforma programable de contratos inteligentes — su seguridad proviene de Proof of Stake, y su diseño prioriza flexibilidad y herramientas de desarrollo. Para freelancers: la Lightning Network de Bitcoin es la vía de pago más rápida; Ethereum tiene un ecosistema DeFi más grande pero con comisiones más altas. Rootstock cierra la brecha al traer contratos inteligentes EVM a Bitcoin.'
		},
		{
			heading: '¿Qué son los stablecoins en Bitcoin?',
			body: 'Los stablecoins son criptomonedas con valor estable — típicamente vinculadas al dólar estadounidense. En Bitcoin, los stablecoins existen a través de sidechains y soluciones de Capa 2. Rootstock aloja USDC y stablecoins respaldadas por Bitcoin de MoneyOnChain (DOC, rDOC). Liquid Network soporta Tether USDt con transacciones confidenciales. Los stablecoins le dan a los freelancers lo mejor de ambos mundos: la red de pagos de Bitcoin con estabilidad del dólar. Un freelancer en Argentina puede recibir un pago en stablecoin, evitando la devaluación del peso, mientras sigue usando la Red Lightning para transferencias rápidas y baratas. Nuestra guía de stablecoins cubre cada opción nativa de Bitcoin.'
		},
		{
			heading: '¿Cómo usa BitTasker el ecosistema de Bitcoin?',
			body: 'BitTasker combina cuatro tecnologías del ecosistema de Bitcoin en una sola plataforma de freelancing. Lightning Network para pagos instantáneos con bajas comisiones. La garantía usa Bitcoin, USDT en RGB o Lightning. Nostr guarda la identidad. En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o Lightning en la billetera con llave de acceso y paga la factura después de aprobar el trabajo. La reputación del freelancer es un par de claves Nostr que posee — portable entre plataformas. Esta integración significa que los freelancers obtienen los beneficios de todo el ecosistema de Bitcoin sin necesitar entender cada tecnología individualmente.'
		}
	],
	faq: [
		{
			question: '¿Para qué se usa Bitcoin además de pagos?',
			answer:
				'Bitcoin soporta contratos inteligentes (a través de Rootstock, Stacks), identidad descentralizada (Nostr), stablecoins (USDC en Rootstock, DOC en MoneyOnChain), NFTs (Ordinals) y escrow programable. Está evolucionando de una red de pagos a una capa completa de dinero programable.'
		},
		{
			question: '¿La Lightning Network es lo mismo que Bitcoin?',
			answer:
				'Lightning es un protocolo de Capa 2 construido sobre Bitcoin. Usa Bitcoin para liquidación pero procesa transacciones off-chain para velocidad instantánea y comisiones casi nulas. Lightning no es una criptomoneda separada — es Bitcoin operando en una capa más rápida.'
		},
		{
			question: '¿Cuál es la diferencia entre Bitcoin y Ethereum?',
			answer:
				'Bitcoin prioriza seguridad, descentralización y almacenamiento de valor. Ethereum prioriza flexibilidad de contratos inteligentes y herramientas de desarrollo. Bitcoin usa Proof of Work; Ethereum usa Proof of Stake. La Lightning Network de Bitcoin es más rápida para pagos; Ethereum tiene más protocolos DeFi.'
		},
		{
			question: '¿Necesito entender todo esto para usar BitTasker?',
			answer:
				'No. BitTasker maneja la complejidad técnica. Necesitas una billetera Lightning para recibir pagos y un entendimiento básico de Bitcoin. La plataforma gestiona escrow, identidad y enrutamiento de pagos detrás de escena.'
		},
		{
			question: '¿Son seguros los stablecoins en Bitcoin?',
			answer:
				'Los stablecoins en sidechains de Bitcoin (como USDC en Rootstock) están respaldados por reservas y asegurados por el mecanismo de consenso de la sidechain. Rootstock se mina junto con Bitcoin para seguridad. Siempre verifica el respaldo y la auditoría de cualquier stablecoin antes de usarlo.'
		},
		{
			question: '¿Qué es Nostr y por qué importa?',
			answer:
				'Nostr es un protocolo descentralizado para identidad y comunicación. Te da un par de claves criptográficas que funciona en cada plataforma compatible. Tu reputación, identidad y datos son portables — ninguna empresa puede bloquearte.'
		},
		{
			question: '¿Puedo usar BitTasker con Ethereum?',
			answer:
				'En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o un pago Lightning en la billetera que abre con una llave de acceso. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago. MetaMask y otras wallets compatibles con Ethereum funcionan con Rootstock. No necesitas usar Ethereum directamente.'
		}
	],
	bitTaskerCta: {
		heading: 'Experimenta el Stack Completo de Bitcoin',
		body: 'En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o un pago Lightning en la billetera que abre con una llave de acceso. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago. Empieza a ganar hoy.',
		buttonText: 'Comienza Ahora',
		buttonHref: '/auth/signup'
	}
};
