import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Mejor Bitcoin Layer 2: Tabla Comparativa y Guía',
		subtitle:
			'Compara Lightning, Rootstock, Stacks, Liquid, Merlin y BOB. Encuentra la Bitcoin Layer 2 ideal para tu caso de uso.'
	},
	answerBlock:
		'No existe una única "mejor" Bitcoin Layer 2 — cada red se optimiza para diferentes casos de uso. Lightning es la más rápida para pagos. Rootstock lidera en TVL y DeFi con compatibilidad EVM. Stacks trae la actualización Nakamoto y sBTC para Bitcoin programable. Liquid destaca en transacciones confidenciales y emisión de assets. Merlin y BOB (Build on Bitcoin) son participantes más recientes enfocados en DeFi nativo de Bitcoin y soporte multi-VM. Tu elección depende de lo que estés construyendo: pagos, DeFi, privacidad, NFTs o emisión de assets empresariales.',
	sections: [
		{
			heading: '¿Qué son las Bitcoin Layer 2s?',
			body: 'Las Bitcoin Layer 2s son redes construidas sobre Bitcoin que agregan capacidades que la cadena base no soporta nativamente — como contratos inteligentes, transacciones más rápidas, funciones de privacidad y emisión de tokens. Liquidan transacciones de vuelta a Bitcoin por seguridad mientras procesan actividad en sus propias cadenas. Las principales categorías son canales de pago (Lightning), sidechains (Rootstock, Liquid) y Layer 2s con liquidación en Bitcoin (Stacks, Merlin, BOB). Cada una aborda el trilema de escalabilidad de Bitcoin de manera diferente, intercambiando entre descentralización, velocidad y funcionalidad.'
		},
		{
			heading: 'Tabla comparativa de Bitcoin Layer 2s',
			body: 'Lightning Network | Consenso: Canales de pago | TVL: ~$200M | EVM: No | Caso de uso: Pagos instantáneos | Velocidad: Instantánea | Característica clave: Micropagos, tarifas más bajas.\n\nRootstock | Consenso: Merged mining con Bitcoin | TVL: ~$235M | EVM: Sí (completo) | Caso de uso: DeFi, escrow, dApps | Velocidad: ~30 segundos | Característica clave: Contratos inteligentes asegurados por Bitcoin, gas RBTC.\n\nStacks | Consenso: Proof of Transfer (PoX) | TVL: ~$500M+ | EVM: No (Clarity) | Caso de uso: DeFi, NFTs, DAOs | Velocidad: Segundos (post-Nakamoto) | Característica clave: sBTC, lenguaje Clarity, liquidación en Bitcoin.\n\nLiquid Network | Consenso: Federación | TVL: ~$180M | EVM: No | Caso de uso: Privacidad, emisión de assets | Velocidad: ~2 minutos | Característica clave: Transacciones confidenciales, Tether USDt.\n\nMerlin Chain | Consenso: Bitmap + ZK-Rollup | TVL: ~$500M+ | EVM: Sí | Caso de uso: DeFi nativo de Bitcoin | Velocidad: ~2 segundos | Característica clave: ZK-rollup, protocolo Bitmap.\n\nBOB (Build on Bitcoin) | Consenso: Híbrido (Bitcoin + OP_NET) | TVL: ~$200M+ | EVM: Sí + Bitcoin VM | Caso de uso: DeFi nativo de Bitcoin | Velocidad: ~2 segundos | Característica clave: Multi-VM, soporte OP_NET ordinals.'
		},
		{
			heading: '¿Cuál es la mejor Bitcoin Layer 2 para pagos?',
			body: 'Para pagos puros — enviar y recibir Bitcoin entre individuos — Lightning Network sigue siendo la opción clara. Ofrece liquidaciones instantáneas, tarifas casi cero y la infraestructura de pagos más madura con miles de billeteras y comercios integrados. Si necesitas pagos con stablecoins con privacidad, Liquid Network ofrece transacciones confidenciales de Tether USDt con confirmaciones de ~2 minutos. Para pagos basados en escrow con garantías de contratos inteligentes, Rootstock proporciona contratos de escrow respaldados por Bitcoin.'
		},
		{
			heading: '¿Cuál es la mejor Bitcoin Layer 2 para DeFi?',
			body: 'Para DeFi general (préstamos, empréstitos, AMMs), Rootstock y Stacks son las opciones más fuertes. Rootstock ofrece compatibilidad completa con EVM, así que las herramientas y contratos existentes de DeFi de Ethereum funcionan con cambios mínimos. Stacks trae las garantías de seguridad de Clarity y sBTC para Bitcoin programable. Merlin Chain y BOB son más nuevos pero crecen rápido con tecnología ZK-rollup y funciones nativas de Bitcoin como soporte de ordinals. La "mejor" depende de si priorizas herramientas EVM (Rootstock), seguridad del lenguaje nativo de Bitcoin (Stacks) o tecnología ZK de vanguardia (Merlin/BOB).'
		},
		{
			heading: '¿Cuál es la mejor Bitcoin Layer 2 para privacidad?',
			body: 'Liquid Network es el líder claro para privacidad de transacciones. Sus transacciones confidenciales ocultan montos y tipos de assets de la vista pública usando Pedreements. Ninguna otra Bitcoin Layer 2 ofrece privacidad por defecto. Para privacidad a nivel de pagos, Lightning Network inherentemente proporciona cierta privacidad ya que los detalles de canales no se transmiten. Sin embargo, para privacidad integral de transacciones (ocultar montos y tipos de assets en cadena), Liquid es insuperable en el espacio de Bitcoin Layer 2.'
		},
		{
			heading: '¿Cuál es la mejor Bitcoin Layer 2 para NFTs y emisión de assets?',
			body: 'Liquid Network ofrece la emisión de assets más simple a través de su protocolo integrado — no se necesitan contratos inteligentes, solo el mecanismo de emisión. Stacks tiene un ecosistema NFT en crecimiento con marketplaces como Gamma. Merlin Chain soporta ordinals e inscripciones nativas de Bitcoin. BOB conecta ordinals de Bitcoin con capacidades EVM. Para security tokens empresariales y emisión de assets regulados, las transacciones confidenciales de Liquid y su federación establecida la convierten en la opción más madura.'
		},
		{
			heading: 'Cómo elegir la Bitcoin Layer 2 correcta',
			body: 'Empieza con tu caso de uso principal. Pagos → Lightning o Liquid (para stablecoins). DeFi → Rootstock (EVM), Stacks (Clarity) o Merlin/BOB (ZK). Privacidad → Liquid. NFTs → Stacks o Merlin. Emisión de assets → Liquid. También considera la madurez del ecosistema: Lightning y Rootstock son las más probadas. Stacks tiene la narrativa más fuerte nativa de Bitcoin con Nakamoto y sBTC. Liquid tiene funciones únicas de privacidad. Merlin y BOB ofrecen tecnología de vanguardia pero son menos probadas. Para una plataforma freelance como BitTasker, la respuesta es multi-cadena — usando Lightning para pagos, Rootstock para escrow y Liquid para soporte de stablecoins.'
		}
	],
	faq: [
		{
			question: '¿Cuál es la Bitcoin Layer 2 más grande por TVL?',
			answer:
				'Stacks y Merlin Chain actualmente compiten por el TVL más alto entre las Bitcoin Layer 2s, ambas superando los $500M en varios momentos. Rootstock mantiene aproximadamente $235M, mientras que los canales de Lightning Network mantienen alrededor de $200M. El TVL fluctúa según las condiciones del mercado y la actividad DeFi.'
		},
		{
			question: '¿Son seguras las Bitcoin Layer 2s?',
			answer:
				'La seguridad varía según la Layer 2. Lightning tiene seguridad fuerte para canales de pago pero requiere nodos en línea. Rootstock hereda seguridad de Bitcoin a través de merged mining. Stacks liquidan en Bitcoin con la actualización Nakamoto. Liquid usa un modelo federado — más rápido pero requiere confiar en los functionaries. Cada una tiene diferentes supuestos de confianza.'
		},
		{
			question: '¿Puedo usar múltiples Bitcoin Layer 2s?',
			answer:
				'Sí. Muchos usuarios y plataformas operan en múltiples Layer 2s. Un freelancer podría usar Lightning para pagos instantáneos, Rootstock para escrow y Liquid para stablecoins. Billeteras como Aqua soportan múltiples Layer 2s nativamente.'
		},
		{
			question: '¿Cuál Bitcoin Layer 2 tiene las tarifas más bajas?',
			answer:
				'Lightning Network tiene las tarifas más bajas — a menudo fracciones de centavo por transacción. Rootstock y Stacks típicamente cobran menos de $0.01 por interacción de contrato inteligente. Las transacciones de Liquid cuestan aproximadamente $0.05-0.10. Las tarifas varían según la congestión de la red y la complejidad de la transacción.'
		},
		{
			question: '¿Qué es la actualización Nakamoto?',
			answer:
				'La actualización Nakamoto es la mejora principal de Stacks que trae tiempos de bloque más rápidos (de ~10 minutos a segundos), finalidad de Bitcoin más fuerte e infraestructura para sBTC. Se activó completamente a finales de 2024 y mejoró drámuticamente el rendimiento y capacidades de Stacks.'
		},
		{
			question: '¿Bitcoin Layer 2 es lo mismo que Ethereum Layer 2?',
			answer:
				'No. Las Bitcoin Layer 2s están construidas sobre el modelo de seguridad de Bitcoin y diseñadas para casos de uso específicos de Bitcoin. Las Ethereum Layer 2s (como Arbitrum, Optimism) están construidas sobre Ethereum. Tienen diferentes mecanismos de consenso, lenguajes de programación y modelos de confianza. Las Bitcoin Layer 2s generalmente priorizan la compatibilidad con Bitcoin sobre la compatibilidad con EVM.'
		}
	],
	bitTaskerCta: {
		heading: 'BitTasker usa las mejores Bitcoin Layer 2s para cada trabajo',
		body: 'Lightning para pagos instantáneos, Rootstock para escrow con contratos inteligentes, Liquid para privacidad con stablecoins. BitTasker elige la Layer 2 correcta para cada función para que no tengas que hacerlo.',
		buttonText: 'Empieza a Freelancear en Bitcoin',
		buttonHref: '/auth/signup'
	}
};
