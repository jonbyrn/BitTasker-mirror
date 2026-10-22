import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker Multi-Chain: Múltiples Bitcoin Layer 2s en Una Plataforma',
		subtitle:
			'Lightning para pagos, RGB para escrow, Liquid para stablecoins. Descubre cómo BitTasker combina Layer 2s para la mejor experiencia freelance.'
	},
	answerBlock:
		'BitTasker es una plataforma freelance multi-cadena que usa múltiples Bitcoin Layer 2s simultáneamente — no porque el maximalismo blockchain lo exija, sino porque cada Layer 2 sobresale en un trabajo diferente. Lightning Network maneja pagos instantáneos de baja comisión. RGB ejecuta contratos de escrow con contratos inteligentes respaldados por la seguridad de Bitcoin. Liquid Network habilita transacciones confidenciales con stablecoins a través de la integración con Aqua Wallet. Al combinar estas redes, BitTasker brinda a freelancers y clientes los pagos más rápidos, el escrow más seguro y soporte flexible de stablecoins sin comprometer en ninguna dimensión.',
	sections: [
		{
			heading: '¿Por qué BitTasker usa múltiples Bitcoin Layer 2s?',
			body: 'Ninguna Bitcoin Layer 2 individual hace todo bien. Lightning es insuperable para pagos instantáneos pero no soporta contratos inteligentes. RGB sobresale en DeFi y escrow pero no está diseñado para micropagos. Liquid ofrece privacidad y stablecoins pero usa un modelo federado. En lugar de forzar a los usuarios a una sola red, BitTasker enruta cada función a la Layer 2 que la maneja mejor. Este enfoque multi-cadena significa que los freelancers obtienen confirmaciones de pago instantáneas, los clientes obtienen escrow respaldado por Bitcoin, y ambas partes pueden usar stablecoins para facturación predecible — todo desde una interfaz de plataforma única.'
		},
		{
			heading: 'Lightning para pagos instantáneos',
			body: 'BitTasker usa Lightning Network como la vía de pago principal para la compensación de freelancers. Cuando se completa y aprueba un hito, el pago se envía vía Lightning — llegando en segundos con tarifas bajo $0.01. La arquitectura de canales de pago de Lightning habilita liquidación instantánea sin esperar confirmaciones de bloques de Bitcoin. Para freelancers en mercados emergentes, esto significa recibir pago inmediatamente en lugar de esperar horas o días para transacciones en cadena de Bitcoin. La integración de BitTasker con Lightning también soporta pagos por streaming para trabajo por hora, donde los freelancers reciben compensación en tiempo real mientras trabajan.'
		},
		{
			heading: 'RGB para escrow con contratos inteligentes',
			body: 'Los fondos del proyecto se bloquean en contratos inteligentes de RGB antes de que comience el trabajo. Estos contratos compatibles con EVM aplican términos de pago, cronogramas de hitos y reglas de resolución de disputas en código auditable. La seguridad de merged mining de RGB con Bitcoin significa que los contratos de escrow heredan la protección de la tasa de hash de Bitcoin. El contrato libera fondos automáticamente cuando ambas partes aprueban los hitos. Si surgen disputas, el contrato inteligente sigue lógica predefinida de resolución — ninguna empresa retiene los fondos ni actúa como juez. BitTasker eligió RGB para escrow porque combina la seguridad de Bitcoin con la programabilidad necesaria para acuerdos freelance complejos.'
		},
		{
			heading: 'Liquid para soporte de stablecoins',
			body: 'En BitTasker, quien contrata bloquea Bitcoin o un pago Lightning en la billetera que abre con una llave de acceso. USDT muy pronto. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago. Las transacciones confidenciales de Liquid ocultan los montos de pago de la vista pública, proporcionando privacidad para facturación empresarial. El soporte de stablecoins importa para freelancers en economías de alta inflación donde la volatilidad del precio de BTC crea incertidumbre en presupuestos. Al recibir una porción de pagos en USDt en Liquid, los freelancers pueden fijar valores en dólares mientras siguen operando dentro del ecosistema Bitcoin. Las confirmaciones rápidas de Liquid (~2 minutos) y tarifas mínimas lo hacen práctico para transacciones regulares con stablecoins.'
		},
		{
			heading: 'Cómo funciona multi-cadena en la práctica',
			body: 'Un proyecto típico de BitTasker podría fluir así: Un cliente deposita fondos en un contrato de escrow de RGB denominado en BTC. El freelancer comienza el trabajo y presenta hitos. Cuando se aprueba un hito, el contrato de RGB libera BTC, que BitTasker enruta vía Lightning al wallet del freelancer — llegando en segundos. Si el freelancer prefiere stablecoins, BitTasker puede convertir el BTC a USDt en Liquid y enviarlo a través de Aqua Wallet. Todo esto ocurre detrás de una interfaz única — el usuario no necesita entender qué Layer 2 está manejando cada transacción.'
		},
		{
			heading: 'Por qué importa multi-cadena para freelancers',
			body: 'Los freelancers necesitan confiabilidad, velocidad y flexibilidad — no ideología blockchain. Un desarrollador en Argentina necesita pago instantáneo en una moneda estable. Un diseñador en Nigeria necesita protección de escrow sin intermediarios bancarios. Un consultor en EE.UU. necesita facturación amigable con impuestos en BTC. El soporte multi-cadena significa que cada freelancer puede elegir el método de pago que se adapte a su situación: Lightning para velocidad, Liquid para stablecoins y privacidad, RGB para seguridad de escrow. La plataforma maneja la complejidad para que los usuarios no tengan que hacerlo.'
		},
		{
			heading: 'Qué otras Layer 2s podría soportar BitTasker',
			body: 'BitTasker evalúa nuevas Bitcoin Layer 2s a medida que maduran. Stacks es un candidato fuerte para futura integración — su token sBTC podría habilitar escrow con Bitcoin programable con las garantías de seguridad de Clarity. La tecnología ZK-rollup de Merlin Chain ofrece potencial para interacciones de contratos inteligentes de menor costo. El enfoque multi-VM de BOB podría conectar ordinals de Bitcoin con capacidades DeFi. Los criterios para agregar nuevas Layer 2s incluyen: madurez del modelo de seguridad, adopción del ecosistema, estructura de tarifas y qué tan bien la red complementa el stack existente de Layer 2s de BitTasker.'
		}
	],
	faq: [
		{
			question: '¿Necesito manejar múltiples billeteras para BitTasker?',
			answer:
				'No. La interfaz de BitTasker maneja la complejidad multi-cadena detrás de escena. Conectas una sola billetera — como Aqua, que soporta Lightning, Liquid y RGB nativamente — y la plataforma enruta las transacciones a la Layer 2 apropiada automáticamente.'
		},
		{
			question: '¿Qué Layer 2 usa BitTasker para escrow?',
			answer:
				'BitTasker usa contratos inteligentes de RGB para escrow. RGB es compatible con EVM y se mina junto con Bitcoin, proporcionando contratos inteligentes asegurados por Bitcoin con tarifas bajas. Los fondos de escrow se bloquean en contratos Solidity auditable en la sidechain de RGB.'
		},
		{
			question: '¿Puedo recibir pagos en stablecoins en BitTasker?',
			answer:
				'Sí. En BitTasker, quien contrata bloquea Bitcoin o un pago Lightning en la billetera que abre con una llave de acceso. USDT muy pronto. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago. Los freelancers pueden elegir recibir una porción de sus pagos en USDt para estabilidad en dólares, con transacciones confidenciales que ocultan los montos de pago.'
		},
		{
			question: '¿Qué tan rápidos son los pagos de BitTasker?',
			answer:
				'Los pagos de Lightning llegan en segundos con tarifas mínimas. Las liberaciones de escrow de RGB se confirman en ~30 segundos. Las transferencias de stablecoins de Liquid se liquidan en ~2 minutos. La experiencia más rápida es Lightning para pagos directos.'
		},
		{
			question: '¿Están seguros mis fondos de escrow si BitTasker se desconecta?',
			answer:
				'Sí. Los fondos de escrow existen en la blockchain de RGB en contratos inteligentes — no en los servidores de BitTasker. Incluso si la plataforma se desconecta, puedes interactuar con el contrato de escrow directamente a través de la red de RGB para acceder a tus fondos.'
		},
		{
			question: '¿Por qué no usar solo una Layer 2?',
			answer:
				'Cada Layer 2 tiene fortalezas y compromisos. Lightning sobresale en pagos pero no puede hacer contratos inteligentes. RGB sobresale en escrow pero no está optimizado para micropagos. Liquid sobresale en privacidad y stablecoins pero usa un modelo federado. Multi-cadena permite a BitTasker usar cada red para lo que hace mejor.'
		},
		{
			question: '¿BitTasker agregará soporte de Stacks?',
			answer:
				'BitTasker evalúa integraciones de Layer 2 basándose en madurez, seguridad y demanda de usuarios. Stacks con sBTC es un candidato fuerte para soporte futuro, particularmente para funciones programables de Bitcoin. Las decisiones de integración dependen de la adopción del ecosistema y la preparación técnica.'
		}
	],
	bitTaskerCta: {
		heading: 'La plataforma freelance multi-cadena construida sobre Bitcoin',
		body: 'BitTasker combina Lightning, RGB y Liquid para ofrecer pagos instantáneos, escrow asegurado por Bitcoin y soporte de stablecoins — todo desde una plataforma.',
		buttonText: 'Únete a BitTasker',
		buttonHref: '/auth/signup'
	}
};
