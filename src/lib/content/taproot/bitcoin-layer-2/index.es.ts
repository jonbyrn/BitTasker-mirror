import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Capa 2 de Bitcoin: Soluciones de Escalabilidad Comparadas',
		subtitle:
			'Lightning, Rootstock, Stacks, Liquid y más — encuentra la Capa 2 de Bitcoin correcta para tu caso de uso.'
	},
	answerBlock:
		'Las Capas 2 de Bitcoin son redes construidas sobre Bitcoin que agregan capacidades que la cadena base no soporta nativamente — como contratos inteligentes, transacciones más rápidas, funciones de privacidad y emisión de tokens. Liquidan transacciones de vuelta a Bitcoin para seguridad mientras procesan actividad en sus propias cadenas. Las categorías principales son canales de pago (Lightning), sidechains (Rootstock, Liquid) y Capas 2 con liquidación en Bitcoin (Stacks, Merlin, BOB). Cada una se optimiza para diferentes casos de uso: pagos, DeFi, privacidad o emisión de activos. Esta guía compara cada Capa 2 mayor de Bitcoin y explica cómo funcionan. En BitTasker la garantía es Bitcoin o Lightning. USDT muy pronto, en la billetera que abres con tu llave de acceso.',
	sections: [
		{
			heading: '¿Qué son las Capas 2 de Bitcoin?',
			body: 'Las Capas 2 de Bitcoin son redes construidas sobre Bitcoin que agregan capacidades que la cadena base no soporta nativamente — como contratos inteligentes, transacciones más rápidas, funciones de privacidad y emisión de tokens. Liquidan transacciones de vuelta a Bitcoin para seguridad mientras procesan actividad en sus propias cadenas. Las categorías principales son canales de pago (Lightning), sidechains (Rootstock, Liquid) y Capas 2 con liquidación en Bitcoin (Stacks, Merlin, BOB). Cada una aborda el trilema de escalabilidad de Bitcoin de manera diferente, equilibrando entre descentralización, velocidad y funcionalidad. La idea clave: la capa base de Bitcoin está diseñada para seguridad y descentralización, no para velocidad o programabilidad. Las Capas 2 agregan las funcionalidades necesarias para un sistema financiero global mientras heredan el modelo de seguridad de Bitcoin.'
		},
		{
			heading: 'Comparativa de Capas 2 de Bitcoin',
			body: 'Lightning Network — Consenso: Canales de pago | TVL: ~$200M | EVM: No | Caso de uso: Pagos instantáneos | Velocidad: Instantánea | Característica clave: Micropagos, comisiones más bajas.\n\nRootstock — Consenso: Merged mining con Bitcoin | TVL: ~$235M | EVM: Sí (completo) | Caso de uso: DeFi, escrow, dApps | Velocidad: ~30 segundos | Característica clave: Contratos inteligentes asegurados por Bitcoin, gas RBTC.\n\nStacks — Consenso: Proof of Transfer (PoX) | TVL: ~$500M+ | EVM: No (Clarity) | Caso de uso: DeFi, NFTs, DAOs | Velocidad: Segundos (post-Nakamoto) | Característica clave: sBTC, lenguaje Clarity, liquidación en Bitcoin.\n\nLiquid Network — Consenso: Federación | TVL: ~$180M | EVM: No | Caso de uso: Privacidad, emisión de activos | Velocidad: ~2 minutos | Característica clave: Transacciones confidenciales, Tether USDt.\n\nMerlin Chain — Consenso: Bitmap + ZK-Rollup | TVL: ~$500M+ | EVM: Sí | Caso de uso: DeFi nativo de Bitcoin | Velocidad: ~2 segundos | Característica clave: ZK-rollup, protocolo Bitmap.'
		},
		{
			heading: '¿Cuál es la mejor Capa 2 de Bitcoin para pagos?',
			body: 'Para pagos puros — enviar y recibir Bitcoin entre individuos — Lightning Network sigue siendo el ganador claro. Ofrece liquidaciones instantáneas, comisiones casi nulas y la infraestructura de pagos más madura con miles de billeteras y comerciantes integrados. Si necesitas pagos en stablecoins con privacidad, Liquid Network ofrece transacciones confidenciales de Tether USDt con confirmaciones de ~2 minutos. Para pagos basados en escrow con garantías de contratos inteligentes, Rootstock proporciona contratos de escrow respaldados por Bitcoin. La elección depende de tus necesidades específicas: velocidad (Lightning), privacidad (Liquid) o programabilidad (Rootstock).'
		},
		{
			heading: '¿Cuál es la mejor Capa 2 de Bitcoin para DeFi?',
			body: 'Para DeFi general (lending, borrowing, AMMs), Rootstock y Stacks son las opciones más fuertes. Rootstock ofrece compatibilidad completa con EVM, por lo que las herramientas y contratos existentes de DeFi de Ethereum funcionan con cambios mínimos. Stacks trae las garantías de seguridad de Clarity y sBTC para Bitcoin programable. Merlin Chain y BOB son más nuevos pero crecen rápido con tecnología ZK-rollup y funciones nativas de Bitcoin. El "mejor" depende de si priorizas herramientas EVM (Rootstock), seguridad de lenguaje nativo de Bitcoin (Stacks) o tecnología ZK de vanguardia (Merlin/BOB).'
		},
		{
			heading: '¿Cuál es la mejor Capa 2 de Bitcoin para privacidad?',
			body: 'Liquid Network es el líder claro para privacidad de transacciones. Sus transacciones confidenciales ocultan montos y tipos de activos de la vista pública usando compromisos de Pedersen. Ninguna otra Capa 2 de Bitcoin ofrece privacidad por defecto. Para privacidad a nivel de pagos, Lightning Network proporciona inherentemente algo de privacidad ya que los detalles de los canales no se transmiten. Sin embargo, para privacidad integral de transacciones (ocultar montos y tipos de activos en cadena), Liquid es inigualable en el espacio de Capas 2 de Bitcoin.'
		},
		{
			heading: '¿Cómo usa BitTasker múltiples Capas 2?',
			body: 'En BitTasker, quien contrata bloquea Bitcoin o Lightning en la billetera con llave de acceso y paga la factura después de aprobar el trabajo. USDT muy pronto.'
		}
	],
	faq: [
		{
			question: '¿Cuál es la Capa 2 de Bitcoin más grande por TVL?',
			answer:
				'Stacks y Merlin Chain compiten actualmente por el TVL más alto entre las Capas 2 de Bitcoin, con ambos superando los $500M en varios puntos. Rootstock tiene aproximadamente $235M, mientras que los canales de Lightning Network tienen alrededor de $200M.'
		},
		{
			question: '¿Son seguras las Capas 2 de Bitcoin?',
			answer:
				'La seguridad varía. Lightning tiene fuerte seguridad para canales de pago pero requiere nodos online. Rootstock hereda la seguridad de Bitcoin a través de merged mining. Stacks liquida en Bitcoin con la actualización Nakamoto. Liquid usa un modelo de federación. Cada una tiene diferentes supuestos de confianza.'
		},
		{
			question: '¿Puedo usar múltiples Capas 2 de Bitcoin?',
			answer:
				'Sí. Muchos usuarios operan en múltiples Capas 2. En BitTasker la garantía es Bitcoin o Lightning. USDT muy pronto, no otra red. Billeteras como Aqua soportan múltiples Capas 2 nativamente.'
		},
		{
			question: '¿Cuál tiene las comisiones más bajas?',
			answer:
				'Lightning Network tiene las comisiones más bajas — a menudo fracciones de centavo. Rootstock y Stacks típicamente cobran menos de $0.01 por interacción de contrato inteligente. Las transacciones de Liquid cuestan alrededor de $0.05-0.10.'
		},
		{
			question: '¿Qué es la actualización Nakamoto?',
			answer:
				'La actualización Nakamoto es la mejora principal de Stacks que trae tiempos de bloque más rápidos (de ~10 minutos a segundos), mayor finalidad de Bitcoin e infraestructura de sBTC. Fue activada completamente a finales de 2024.'
		},
		{
			question: '¿La Capa 2 de Bitcoin es lo mismo que la Capa 2 de Ethereum?',
			answer:
				'No. Las Capas 2 de Bitcoin están construidas sobre el modelo de seguridad de Bitcoin para casos de uso específicos de Bitcoin. Las Capas 2 de Ethereum (Arbitrum, Optimism) están construidas sobre Ethereum con diferentes consensos, lenguajes y modelos de confianza.'
		},
		{
			question: '¿Cómo elijo la Capa 2 de Bitcoin correcta?',
			answer:
				'Empieza con tu caso de uso: pagos → Lightning, DeFi → Rootstock/Stacks, privacidad → Liquid, NFTs → Stacks/Merlin. Considera la madurez del ecosistema: Lightning y Rootstock son los más probados.'
		}
	],
	bitTaskerCta: {
		heading: 'BitTasker Usa las Mejores Capas 2 para Cada Trabajo',
		body: 'En BitTasker, quien contrata bloquea Bitcoin o Lightning en la billetera con llave de acceso y paga la factura después de aprobar el trabajo. USDT muy pronto. Los mensajes se abren cuando la garantía está formada. Las reseñas se abren después de ese pago.',
		buttonText: 'Empieza con Bitcoin',
		buttonHref: '/auth/signup'
	}
};
