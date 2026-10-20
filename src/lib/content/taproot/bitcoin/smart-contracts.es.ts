import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Contratos Inteligentes en Bitcoin: Qué es Posible en 2026',
		subtitle:
			'Rootstock, Stacks y Ordinals traen dinero programable a Bitcoin. Así es como funcionan.'
	},
	answerBlock:
		'Bitcoin sí soporta contratos inteligentes, pero a través de soluciones de Capa 2 en lugar de la cadena base. El más establecido es Rootstock (RSK), una sidechain compatible con EVM que se mina junto con Bitcoin y trae capacidades completas de contratos inteligentes en Solidity al ecosistema Bitcoin. Stacks trae contratos inteligentes a través de su consenso Proof-of-Transfer, y Ordinals introdujo la inscripción de datos directamente en satoshis. Para freelancers y plataformas, Rootstock es la opción más práctica — ofrece contratos inteligentes compatibles con Ethereum respaldados por el modelo de seguridad de Bitcoin, habilitando escrow, préstamos y exchange descentralizado sin salir del ecosistema Bitcoin. En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o un pago Lightning en la billetera que abre con una llave de acceso. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago.',
	sections: [
		{
			heading: '¿Bitcoin puede tener contratos inteligentes?',
			body: 'Bitcoin siempre ha tenido una forma limitada de contratos inteligentes a través de Bitcoin Script — el lenguaje de programación simple que gobierna cómo se pueden gastar las transacciones. Los scripts habilitan billeteras multi-firma, transacciones con bloqueo temporal y pagos condicionales básicos. Sin embargo, Bitcoin Script es intencionalmente limitado por razones de seguridad, sin la completitud de Turing de lenguajes como Solidity. Para traer capacidades completas de contratos inteligentes a Bitcoin, los desarrolladores construyeron soluciones de Capa 2: Rootstock (RSK) para compatibilidad EVM, Stacks para un entorno de programación nativo de Bitcoin (Clarity), y Ordinals/Inscriptions para incrustar datos directamente en la cadena. Cada enfoque compensa diferentes propiedades — seguridad, compatibilidad, descentralización — pero todos expanden lo que es posible en Bitcoin más allá de la simple transferencia de valor.'
		},
		{
			heading: '¿Qué es Rootstock y la compatibilidad EVM?',
			body: 'Rootstock (RSK) es una sidechain de Bitcoin que trae compatibilidad con la Máquina Virtual Ethereum (EVM) al ecosistema Bitcoin. Esto significa que los desarrolladores pueden escribir contratos inteligentes en Solidity — el mismo lenguaje usado en Ethereum — y desplegarlos en una red asegurada por la tasa de hash de Bitcoin a través de merged mining. Rootstock procesa transacciones más rápido y barato que Ethereum mientras hereda las garantías de seguridad de Bitcoin. Para el ecosistema Bitcoin, esto es transformador: significa que cualquier dApp de Ethereum puede portarse para ejecutarse en el modelo de seguridad de Bitcoin. Puentes permiten que BTC se mueva entre la cadena principal de Bitcoin y Rootstock, donde se convierte en RBTC (Rootstock Bitcoin) para uso en contratos inteligentes. En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o Lightning en la billetera con llave de acceso y paga la factura después de aprobar el trabajo. Los mensajes se abren cuando la garantía está formada. Las reseñas se abren después de ese pago.'
		},
		{
			heading: 'Bitcoin Script vs Solidity: ¿cuál es la diferencia?',
			body: 'Bitcoin Script es un lenguaje basado en pila, no completo de Turing, diseñado para simplicidad y seguridad. Puede verificar firmas, imponer bloqueos temporales y verificar condiciones — pero no puede iterar indefinadamente ni hacer llamadas externas. Esta limitación es intencional: los scripts complejos aumentan la superficie de ataque y pueden introducir vulnerabilidades. Solidity, usado en Ethereum y Rootstock, es completo de Turing y mucho más expresivo. Soporta estructuras de datos complejas, herencia, llamadas a contratos externos y registro de eventos. Para pagos simples y condiciones básicas, Bitcoin Script es suficiente y más seguro. Para lógica compleja como escrow con resolución de disputas, préstamos automatizados o exchanges descentralizados, Solidity en Rootstock proporciona la flexibilidad necesaria mientras sigue siendo asegurado por la tasa de hash de Bitcoin.'
		},
		{
			heading: '¿Cuáles son los casos de uso de contratos inteligentes en Bitcoin?',
			body: 'Los contratos inteligentes en Bitcoin habilitan varias aplicaciones prácticas. Los servicios de escrow bloquean fondos en código hasta que se cumplan condiciones — BitTasker usa esto para pagos de proyectos freelance. Los protocolos de préstamos permiten a los poseedores de Bitcoin prestar BTC y ganar intereses, o pedir préstamos contra sus tenencias. Los exchanges descentralizados (DEX) permiten el intercambio peer-to-peer sin libro de órdenes central. Las plataformas de tokenización crean activos digitales en el modelo de seguridad de Bitcoin. Las DAOs (organizaciones autónomas descentralizadas) pueden gobernar tesorerías compartidas con votación transparente. Para freelancers específicamente, el escrow es el caso de uso más impactante: contratos inteligentes que liberan pagos automáticamente cuando el trabajo es aprobado, sin requerir confianza en ninguna plataforma o intermediario.'
		},
		{
			heading: '¿Qué son Ordinals e inscripciones en Bitcoin?',
			body: 'Ordinals, lanzados a principios de 2023, introdujeron una forma de inscribir datos directamente en satoshis individuales — la unidad más pequeña de Bitcoin. Esto efectivamente trajo NFTs, tokens y otros datos a la capa base de Bitcoin sin requerir una sidechain o Capa 2. Cada satoshi puede portar hasta 4 MB de datos a través de un mecanismo llamado "envelopes". Aunque controversial en la comunidad Bitcoin (algunos lo ven como spam de la blockchain), Ordinals demostró que la capa base de Bitcoin puede soportar más que solo transacciones financieras. Para contratos inteligentes, Ordinals es menos práctico que Rootstock o Stacks — no habilita lógica programable, solo almacenamiento de datos. Sin embargo, expandió la conversación sobre las capacidades de Bitcoin y atrajo nuevos desarrolladores al ecosistema.'
		},
		{
			heading: 'Cómo funciona la garantía en BitTasker',
			body: 'En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o un pago Lightning en la billetera que abre con una llave de acceso. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago. En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o Lightning en la billetera con llave de acceso y paga la factura después de aprobar el trabajo. En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o un pago Lightning en la billetera que abre con una llave de acceso. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago.'
		},
		{
			heading: 'Riesgos y limitaciones de los contratos inteligentes en Bitcoin',
			body: 'Los contratos inteligentes en Bitcoin a través de soluciones de Capa 2 conllevan riesgos inherentes. Las sidechains como Rootstock requieren confianza en el mecanismo del puente que mueve BTC entre cadenas — los exploits de puentes han sido entre los ataques más costosos en cripto. La Proof-of-Transfer de Stacks introduce sus propias suposiciones de consenso. Los datos de Ordinals se almacenan en la capa base de Bitcoin, aumentando las comisiones de transacción durante períodos de alta demanda. Para desarrolladores, el panorama fragmentado significa que no hay un estándar único para contratos inteligentes en Bitcoin — elegir entre Rootstock, Stacks u Ordinals implica compromisos en seguridad, compatibilidad y madurez del ecosistema. Para usuarios, el riesgo principal es entender en qué capa están sus activos y qué garantías aplican. Rootstock ofrece el modelo de seguridad más fuerte entre las opciones debido al merged mining, pero los usuarios siempre deben verificar que están interactuando con contratos legítimos.'
		}
	],
	faq: [
		{
			question: '¿Bitcoin soporta contratos inteligentes nativamente?',
			answer:
				'Bitcoin soporta contratos inteligentes básicos a través de Bitcoin Script en la capa base — multi-firma, bloqueos temporales y pagos condicionales. Para contratos inteligentes complejos (escrow, préstamos, DEX), las soluciones de Capa 2 como Rootstock y Stacks traen programabilidad completa al ecosistema Bitcoin.'
		},
		{
			question: '¿Cuál es la mejor plataforma para contratos inteligentes en Bitcoin?',
			answer:
				'Rootstock es actualmente la plataforma más establecida para contratos inteligentes en Bitcoin, ofreciendo compatibilidad EVM y seguridad respaldada por la tasa de hash de Bitcoin a través de merged mining. Soporta Solidity, haciéndola accesible al gran grupo de desarrolladores de Ethereum. Stacks ofrece una alternativa nativa de Bitcoin con su lenguaje Clarity.'
		},
		{
			question: '¿Los contratos inteligentes de Bitcoin son tan seguros como los de Ethereum?',
			answer:
				'Los contratos inteligentes de Rootstock están asegurados por la tasa de hash de Bitcoin a través de merged mining, haciéndolos posiblemente más seguros que el mecanismo de consenso separado de Ethereum. Sin embargo, el puente entre Bitcoin y Rootstock introduce suposiciones de confianza adicionales. Los contratos inteligentes de Ethereum se benefician de un historial más largo y un ecosistema de auditoría más grande.'
		},
		{
			question: '¿Puedo usar contratos inteligentes de Bitcoin sin conocimientos técnicos?',
			answer:
				'En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o Lightning en la billetera con llave de acceso y paga la factura después de aprobar el trabajo.'
		},
		{
			question: '¿Cuáles son las comisiones de los contratos inteligentes en Bitcoin?',
			answer:
				'BitTasker cobra una comisión de servicio cuando se completa una tarea. Las comisiones de Bitcoin o Lightning son aparte.'
		},
		{
			question: '¿Cómo muevo Bitcoin a Rootstock para contratos inteligentes?',
			answer:
				'No puenteas bitcoin a otra red. Agrega Bitcoin o USDT a la billetera de BitTasker, o compra bitcoin con tarjeta o transferencia a tu propia dirección.'
		}
	],
	bitTaskerCta: {
		heading: 'Experimenta escrow sin confianza con contratos inteligentes de Bitcoin',
		body: 'En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o un pago Lightning en la billetera que abre con una llave de acceso. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago. Seguridad de Bitcoin encuentra flexibilidad de contratos inteligentes.',
		buttonText: 'Prueba el Escrow Inteligente',
		buttonHref: '/auth/signup'
	}
};
