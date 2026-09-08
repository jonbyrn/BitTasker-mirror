import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Liquid Network: Sidechain de Bitcoin para Privacidad y Activos',
		subtitle:
			'La sidechain confidencial de Blockstream para transacciones rápidas y privadas en Bitcoin. Descubre L-BTC, Tether y emisión de activos.'
	},
	answerBlock:
		'Liquid Network es una sidechain de Bitcoin construida por Blockstream que habilita transacciones rápidas y confidenciales y emisión de activos personalizados sobre Bitcoin. Utiliza L-BTC — un token vinculado a BTC — como su activo nativo, con transacciones que se liquidan en aproximadamente 2 minutos. El diferenciador clave de Liquid son las transacciones confidenciales: los montos y tipos de activo se ocultan de la vista pública mientras siguen siendo verificables por los participantes. La red soporta Tether USDt para pagos con stablecoins, emisión de security tokens y NFTs. Aqua Wallet, una billetera Bitcoin popular, integra Liquid nativamente para transacciones fluidas de stablecoins y Bitcoin confidencial.',
	sections: [
		{
			heading: '¿Qué es Liquid Network?',
			body: 'Liquid Network es una sidechain federada de Bitcoin, lanzada en 2018 por Blockstream. Funciona como una blockchain separada conectada a Bitcoin a través de un peg bidireccional, donde BTC se bloquea en la cadena principal de Bitcoin y L-BTC se emite en Liquid. A diferencia de RGB o Stacks, Liquid se enfoca en velocidad de transacción, privacidad e emisión de activos en lugar de contratos inteligentes de propósito general. La red utiliza una federación de functionaries — un consorcio de entidades conocidas — para validar transacciones y gestionar el peg. Este modelo federado intercambia algo de descentralización por tiempos de bloque significativamente más rápidos (~2 minutos) y soporte de transacciones confidenciales.'
		},
		{
			heading: '¿Qué son las transacciones confidenciales?',
			body: 'Las transacciones confidenciales son la característica distintiva de Liquid. En las transacciones estándar de Bitcoin, el monto enviado es visible para todos en la blockchain. En Liquid, los montos de transacción y los tipos de activos transferidos están ocultos criptográficamente. Solo el emisor y receptor pueden ver los valores reales. Los observadores externos pueden verificar que no se crearon nuevos activos (previniendo inflación) pero no pueden determinar cuánto se envió o qué tipo de activo se transfirió. Esto se logra usando Pedersen commitments — una técnica criptográfica que codifica valores de una manera que permite verificación matemática sin revelar los números subyacentes.'
		},
		{
			heading: '¿Qué es L-BTC?',
			body: 'L-BTC (Liquid Bitcoin) es el activo nativo de Liquid Network, vinculado 1:1 a BTC. Los usuarios bloquean BTC en la cadena principal de Bitcoin a través de la federación y se emite L-BTC equivalente en Liquid. El proceso inverso quema L-BTC y libera BTC. L-BTC tiene todas las propiedades de Bitcoin — es escaso, transferible y puede usarse como dinero — pero con transacciones más rápidas (~2 minutos de confirmación) y montos confidenciales. L-BTC se usa para trading en exchanges basados en Liquid, envío de pagos privados y como colateral para activos emitidos en Liquid Network.'
		},
		{
			heading: '¿Cómo funciona Tether en Liquid?',
			body: 'Tether (USDt) fue uno de los primeros tokens emitidos en Liquid Network. Tether en Liquid se beneficia de las transacciones confidenciales — el monto de USDt en una transferencia se oculta de la vista pública. Esto hace que USDt en Liquid sea atractivo para usuarios y empresas conscientes de la privacidad. Las transacciones también son más rápidas y baratas que en Ethereum, con ~2 minutos de confirmación y tarifas mínimas. Tether en Liquid puede moverse entre billeteras y exchanges compatibles con Liquid, proporcionando una opción de stablecoin que combina estabilidad de precio con privacidad de transacción.'
		},
		{
			heading: 'Emisión de activos en Liquid',
			body: 'Liquid soporta la emisión de tokens personalizados a través de su protocolo de issued assets. Cualquiera puede crear tokens en Liquid para varios propósitos: security tokens para recaudación de fondos, puntos de lealtad, tokens de membresía, NFTs o cualquier activo representable. El protocolo incluye funciones integradas como montos confidenciales (las cantidades de tokens pueden ocultarse), soporte multi-sig y mecanismos de recuperación para llaves perdidas. La emisión de activos en Liquid es más simple que los estándares de tokens de Ethereum — no se requieren contratos inteligentes complejos, solo el protocolo de emisión integrado. Esto lo hace accesible para empresas que quieren tokenizar activos sin desarrollo blockchain profundo.'
		},
		{
			heading: '¿Cómo usa Aqua Wallet Liquid?',
			body: 'Aqua Wallet, desarrollada por Blockstream, es una billetera Bitcoin que soporta nativamente Liquid Network. Los usuarios pueden mantener L-BTC, Tether USDt en Liquid y otros activos emitidos en Liquid junto con su BTC de la red principal en una sola billetera. Aqua facilita enviar y recibir transacciones confidenciales, intercambiar entre BTC y L-BTC, y usar stablecoins para pagos cotidianos. Para freelancers y empresas en mercados emergentes, la integración de Liquid en Aqua proporciona acceso a stablecoins denominados en USD sin depender de exchanges centralizados o tarifas de gas de Ethereum.'
		},
		{
			heading: 'Liquid Network vs otras Bitcoin Layer 2s',
			body: 'Liquid toma un enfoque diferente que otras Bitcoin Layer 2s. Mientras RGB y Stacks se enfocan en contratos inteligentes de propósito general y DeFi, Liquid se especializa en transacciones rápidas y privadas y emisión de activos. Liquid usa un modelo federado (más rápido pero más centralizado) versus el merged mining de RGB o el Proof of Transfer de Stacks. Las transacciones confidenciales de Liquid son únicas — ninguna otra Bitcoin Layer 2 ofrece montos ocultos por defecto. El compromiso es que el modelo federado de Liquid requiere confiar en los functionaries, mientras que RGB y Stacks derivan seguridad más directamente del mecanismo de consenso de Bitcoin.'
		}
	],
	faq: [
		{
			question: '¿Liquid Network es un Bitcoin Layer 2?',
			answer:
				'Liquid es técnicamente una sidechain federada conectada a Bitcoin a través de un peg bidireccional. Extiende la funcionalidad de Bitcoin con transacciones más rápidas, montos confidenciales y emisión de activos. Aunque la clasificación técnica difiere de las Layer 2 basadas en rollups, Liquid sirve un propósito similar de agregar capacidades a Bitcoin.'
		},
		{
			question: '¿Qué hace diferente a Liquid de Lightning Network?',
			answer:
				'Lightning está optimizado para micropagos instantáneos entre dos partes. Liquid se enfoca en transacciones confidenciales, emisión de activos y liquidaciones rápidas tipo on-chain. Lightning requiere abrir canales; Liquid funciona como una blockchain regular. Sirven propósitos complementarios — Lightning para pagos, Liquid para privacidad y activos.'
		},
		{
			question: '¿Las transacciones de Liquid son realmente privadas?',
			answer:
				'Las transacciones de Liquid son confidenciales — los montos y tipos de activo se ocultan de la vista pública usando Pedersen commitments. Solo el emisor y receptor pueden ver los valores reales. Sin embargo, el grafo de transacciones (quién envió a quién) sigue siendo visible. La privacidad verdadera del grafo de transacciones requiere técnicas adicionales.'
		},
		{
			question: '¿Cómo obtengo L-BTC?',
			answer:
				'Puedes obtener L-BTC bloqueando BTC a través de la federación de Liquid vía exchanges que soportan Liquid, billeteras como Aqua o Blockstream Green, o peer-to-peer. El bridge bloquea tu BTC en la cadena principal de Bitcoin y emite L-BTC equivalente en Liquid.'
		},
		{
			question: '¿Puedo emitir mi propio token en Liquid?',
			answer:
				'Sí. Liquid soporta emisión de tokens personalizados a través de su protocolo integrado de issued assets. Puedes crear security tokens, puntos de lealtad, NFTs o cualquier activo representable. El proceso es más simple que los estándares de tokens de Ethereum — no se requieren contratos inteligentes complejos.'
		},
		{
			question: '¿Liquid Network es descentralizado?',
			answer:
				'Liquid usa un modelo federado — un consorcio de entidades conocidas valida transacciones y gestiona el peg. Esto proporciona tiempos de bloque más rápidos y transacciones confidenciales pero es más centralizado que la red principal de Bitcoin o sidechains con merged mining como RGB. Los miembros de la federación son públicamente conocidos y auditables.'
		},
		{
			question: '¿Qué tan rápidas son las transacciones de Liquid?',
			answer:
				'Los bloques de Liquid se producen aproximadamente cada 2 minutos, haciendo las transacciones significativamente más rápidas que los ~10 minutos de bloques de Bitcoin. Para comparación, Lightning es instantáneo pero requiere configuración de canales, mientras que Ethereum varía de segundos a minutos dependiendo de la congestión.'
		}
	],
	bitTaskerCta: {
		heading: 'Paga a freelancers de forma privada con Liquid Network',
		body: 'BitTasker integra Liquid para pagos confidenciales con stablecoins. Los freelancers pueden recibir USDt en Liquid con montos ocultos, liquidaciones rápidas y tarifas mínimas a través de Aqua Wallet.',
		buttonText: 'Inicia Pagos Privados',
		buttonHref: '/auth/signup'
	}
};
