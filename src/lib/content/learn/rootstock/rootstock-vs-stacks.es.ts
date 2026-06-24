import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Rootstock vs Stacks: Plataforma de Contratos en Bitcoin',
		subtitle:
			'Rootstock y Stacks ambos traen contratos inteligentes a Bitcoin. Compara consenso, lenguaje, TVL y ecosistema para elegir la correcta.'
	},
	answerBlock:
		'Rootstock y Stacks son las dos plataformas líderes que traen capacidades de contratos inteligentes a Bitcoin, pero toman enfoques fundamentalmente diferentes. Rootstock es una sidechain compatible con EVM asegurada por merged mining de Bitcoin, funcionando en producción desde 2018 con soporte de Solidity y más de $235M en TVL. Stacks usa un lenguaje personalizado (Clarity) y consenso Proof of Transfer, lanzando su mainnet en 2021 con creciente actividad DeFi. Rootstock es mejor para desarrolladores que quieren compatibilidad con Ethereum en Bitcoin, mientras Stacks ofrece un enfoque construido a medida con su propio paradigma de programación. La elección correcta depende de tus requisitos técnicos, ecosistema deseado y si priorizas compatibilidad con EVM o integración nativa con Bitcoin.',
	sections: [
		{
			heading: '¿Cuál es la diferencia entre Rootstock y Stacks?',
			body: 'La diferencia fundamental es la arquitectura. Rootstock es una sidechain compatible con EVM — se ejecuta en paralelo a Bitcoin y está asegurada por mineros de Bitcoin a través de merged mining. Los desarrolladores escriben contratos inteligentes en Solidity, el mismo lenguaje usado en Ethereum. Stacks es una Layer 1 que se asienta en Bitcoin a través del consenso Proof of Transfer (PoX). Usa Clarity, un lenguaje construido a medida diseñado para contratos inteligentes predecibles. Rootstock ofrece compatibilidad con EVM y tarifas más bajas; Stacks ofrece integración más estrecha con Bitcoin a través de su mecanismo de consenso único y las garantías de seguridad del lenguaje Clarity.'
		},
		{
			heading: '¿Cómo difiere el consenso entre Rootstock y Stacks?',
			body: 'Rootstock usa merged mining — los mineros de Bitcoin minan bloques de Rootstock simultáneamente con bloques de Bitcoin, compartiendo el mismo hash power. Esto le da a Rootstock seguridad a nivel de Bitcoin desde el primer día. Stacks usa Proof of Transfer (PoX), donde los mineros de STX comprometen BTC para participar en la minería, y esos BTC se envían a los holders de STX como recompensas. PoX es un mecanismo de consenso novedoso que recicla Bitcoin para asegurar la red Stacks, pero tiene menos hash power respaldándolo comparado con el merged mining directo de Rootstock con mineros de Bitcoin.'
		},
		{
			heading: '¿Cuál tiene más value locked — Rootstock o Stacks?',
			body: 'Rootstock ha mantenido históricamente un TVL más alto, oscilando entre $235M y $267M. El TVL de Stacks ha sido más bajo y volátil, generalmente entre $50M y $150M dependiendo de las condiciones del mercado y el precio del token STX. El TVL más alto de Rootstock refleja su historial más largo (más de seis años en producción) y su ecosistema DeFi establecido con protocolos como Sovryn y MoneyOnChain. El TVL de Stacks ha crecido con el auge de Bitcoin NFTs (Ordinals) y la creciente actividad de desarrolladores.'
		},
		{
			heading: 'Rootstock vs Stacks: lenguajes de programación',
			body: 'Rootstock usa Solidity, dando a los desarrolladores acceso a toda la cadena de herramientas de Ethereum — Hardhat, Remix, OpenZeppelin y miles de bibliotecas existentes. Esto reduce drásticamente la curva de aprendizaje para desarrolladores de Ethereum que se mudan a Bitcoin. Stacks usa Clarity, un lenguaje enfocado en decidibilidad donde los contratos pueden ser analizados estáticamente antes del despliegue. Clarity elimina clases enteras de bugs (reentrancy, overflow) por diseño, pero tiene una comunidad de desarrolladores más pequeña y menos bibliotecas existentes. Elige Rootstock por amplitud de ecosistema; elige Stacks por garantías de seguridad del lenguaje.'
		},
		{
			heading: '¿Qué ecosistema es más grande — Rootstock o Stacks?',
			body: 'Rootstock tiene un ecosistema DeFi más maduro con protocolos establecidos: Sovryn (DEX y lending), MoneyOnChain (stablecoins de Bitcoin), Tropykus (ahorro) y Dokyo (mercado NFT). También se beneficia del ecosistema más amplio de Ethereum a través de compatibilidad con EVM — cualquier dApp de Ethereum puede desplegarse en Rootstock con cambios mínimos. Stacks tiene un ecosistema en crecimiento enfocado en aplicaciones nativas de Bitcoin, incluyendo ALEX (DeFi), Arkadiko (lending) y fuerte actividad alrededor de Bitcoin Ordinals y tokens BRC-20. Rootstock lidera en madurez DeFi; Stacks lidera en innovación nativa de Bitcoin.'
		},
		{
			heading: '¿Cuál es mejor para freelancers y escrow?',
			body: 'Para casos de uso de escrow y freelancing, Rootstock tiene una ventaja clara. Su compatibilidad con EVM significa que bibliotecas de contratos inteligentes auditadas y probadas como OpenZeppelin se pueden usar directamente. Las tarifas de gas más bajas hacen viables las microtransacciones para proyectos freelance pequeños. BitTasker eligió Rootstock específicamente porque su historial de producción de seis años, seguridad a nivel de Bitcoin y soporte de Solidity lo hacen ideal para contratos de escrow sin necesidad de confianza que necesitan ser confiables y rentables.'
		}
	],
	faq: [
		{
			question: '¿Rootstock o Stacks es más seguro?',
			answer:
				'Rootstock está asegurado por la tasa de hash de Bitcoin a través de merged mining, proporcionando seguridad directa a nivel de Bitcoin. Stacks usa Proof of Transfer que recicla BTC para seguridad pero tiene menos hash power. Rootstock tiene un historial de seguridad más largo (desde 2018) y se beneficia del peso completo de la minería de Bitcoin.'
		},
		{
			question: '¿Puedo usar Solidity en Stacks?',
			answer:
				'No. Stacks usa Clarity, un lenguaje de contratos inteligentes construido a medida. No puedes desplegar contratos Solidity en Stacks. Si quieres usar Solidity, Rootstock es la opción compatible con Bitcoin.'
		},
		{
			question: '¿Cuál es más barato de usar — Rootstock o Stacks?',
			answer:
				'Los gas fees de Rootstock son típicamente menos de $0.01 por transacción. Los costos de transacción de Stacks dependen del precio del token STX y la congestión de la red, pero son generalmente comparables. Ambos son significativamente más baratos que Ethereum mainnet.'
		},
		{
			question: '¿Puedo hacer bridge de activos entre Rootstock y Stacks?',
			answer:
				'No hay un bridge directo entre Rootstock y Stacks. Para mover activos entre ellos, necesitarías hacer bridge a través de la mainchain de Bitcoin — convirtiendo RBTC a BTC, y luego haciendo bridge de BTC a Stacks.'
		},
		{
			question: '¿Qué plataforma tiene más desarrolladores?',
			answer:
				'Rootstock se beneficia de la masiva comunidad de desarrolladores de Ethereum a través de compatibilidad con EVM — cualquier desarrollador de Solidity puede construir en Rootstock inmediatamente. Stacks tiene una comunidad de desarrolladores dedicada pero más pequeña enfocada en Clarity y aplicaciones nativas de Bitcoin.'
		},
		{
			question: '¿Rootstock o Stacks es mejor para NFTs?',
			answer:
				'Stacks tiene mayor actividad de NFTs debido a su estrecha integración con Bitcoin Ordinals y tokens BRC-20. Rootstock tiene el mercado NFT Dokyo pero menos actividad relacionada con Ordinals. Para NFTs nativos de Bitcoin, Stacks tiene la ventaja.'
		}
	],
	bitTaskerCta: {
		heading: 'Construye escrow en Bitcoin con BitTasker',
		body: 'BitTasker usa contratos inteligentes compatibles con EVM de Rootstock para escrow sin necesidad de confianza. Seis años de seguridad en producción, código Solidity auditable y protección de Bitcoin para cada proyecto.',
		buttonText: 'Comienza Ahora',
		buttonHref: '/auth/signup'
	}
};
