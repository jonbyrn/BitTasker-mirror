import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Rootstock: Bitcoin Layer 2 para Contratos Inteligentes',
		subtitle:
			'Sidechain compatible con EVM, merged mined con Bitcoin. Descubre cómo Rootstock trae contratos inteligentes a Bitcoin con +$235M en TVL.'
	},
	answerBlock:
		'Rootstock (RSK) es una sidechain de Bitcoin Layer 2 que trae contratos inteligentes compatibles con Ethereum a la red Bitcoin. Lanzada en 2018 y asegurada a través de merged mining con mineros de Bitcoin, Rootstock permite a los desarrolladores desplegar contratos Solidity que se liquidan de vuelta a Bitcoin. Utiliza RBTC como su token de gas y actualmente mantiene más de $235M en total value locked (TVL) en DeFi, NFTs y dApps. A diferencia de las Layer 2 construidas sobre Ethereum, Rootstock hereda el modelo de seguridad de Bitcoin directamente — los mineros que ya aseguran Bitcoin también validan los bloques de Rootstock, convirtiéndola en una de las plataformas de contratos inteligentes con anclaje de seguridad más sólido de la industria.',
	sections: [
		{
			heading: '¿Qué es Rootstock?',
			body: 'Rootstock es una sidechain de Bitcoin — una blockchain separada que corre en paralelo a la cadena principal de Bitcoin y está conectada a través de un peg bidireccional. Fue la primera sidechain programable en Bitcoin, lanzada en enero de 2018. Rootstock es completamente compatible con EVM, lo que significa que cualquier contrato inteligente escrito en Solidity para Ethereum puede desplegarse en Rootstock con cambios mínimos. La sidechain utiliza su propia máquina virtual llamada RVM (Rootstock Virtual Machine), que extiende la EVM de Ethereum con opcodes adicionales diseñados para la integración con Bitcoin. Las transacciones de Rootstock son más rápidas y baratas que la red principal de Bitcoin, pero la seguridad proviene de Bitcoin a través de merged mining.'
		},
		{
			heading: '¿Cómo asegura Rootstock el merged mining?',
			body: 'El merged mining permite a los mineros de Bitcoin minar tanto Bitcoin como Rootstock simultáneamente sin gastar poder computacional adicional. Los mineros adjuntan bloques de Rootstock a sus soluciones de bloques de Bitcoin, y los nodos de Rootstock los aceptan como prueba de trabajo válida. Esto significa que Rootstock se beneficia de la misma tasa de hash que asegura Bitcoin — actualmente la más alta de cualquier blockchain. El compromiso es que la producción de bloques de Rootstock depende de que los mineros de Bitcoin elijan participar en el merged mining. En la práctica, una porción significativa de la tasa de hash de Bitcoin se ha unido al mining de Rootstock, proporcionando seguridad robusta desde el inicio de la sidechain.'
		},
		{
			heading: '¿Qué es RBTC y cómo se usa?',
			body: 'RBTC (Rootstock Bitcoin) es el token de gas nativo de la red Rootstock. Está vinculado 1:1 con BTC, lo que significa que 1 RBTC está respaldado por 1 BTC retenido en un bridge controlado por federación. Los usuarios convierten BTC a RBTC para pagar las interacciones de contratos inteligentes en Rootstock — similar a cómo se usa ETH para gas en Ethereum. Se puede obtener RBTC a través del bridge de Rootstock, exchanges descentralizados en la sidechain, o plataformas como BitTasker que integran Rootstock nativamente. El mecanismo del bridge implica bloquear BTC en la cadena principal de Bitcoin y acuñar RBTC equivalente en Rootstock, con el proceso inverso quemando RBTC y liberando BTC.'
		},
		{
			heading: '¿Qué puedes construir en Rootstock?',
			body: 'Rootstock soporta toda la gama de aplicaciones descentralizadas posibles en Ethereum — protocolos DeFi, marketplaces de NFTs, DAOs, plataformas de préstamos y emisión de tokens. Al ser compatible con EVM, los desarrolladores pueden usar las herramientas existentes de Ethereum: Hardhat, Foundry, MetaMask, bibliotecas OpenZeppelin y todo el ecosistema de Solidity. El diferenciador clave es que todo esto corre con el modelo de seguridad de Bitcoin en lugar del mecanismo de consenso separado de proof-of-stake de Ethereum. Proyectos destacados en Rootstock incluyen Sovryn (DeFi), Money on Chain (stablecoins) y Rootstock Collective (gobernanza DAO).'
		},
		{
			heading: 'Rootstock vs Ethereum para contratos inteligentes',
			body: 'La diferencia fundamental es la herencia de seguridad. Los contratos inteligentes de Ethereum dependen del propio conjunto de validadores y mecanismo de consenso de Ethereum. Los contratos de Rootstock están respaldados finalmente por la tasa de hash de Bitcoin a través de merged mining. Rootstock también ofrece tarifas de transacción significativamente más bajas — típicamente fracciones de centavo comparado con las tarifas variables de gas de Ethereum que pueden aumentar durante congestiones. El compromiso es el tamaño del ecosistema: Ethereum tiene mucho más TVL total, herramientas de desarrollo y efectos de red. Sin embargo, el TVL de Rootstock ha crecido constantemente y su compatibilidad con EVM significa que los desarrolladores enfrentan fricción mínima al desplegar contratos existentes de Ethereum en Rootstock.'
		},
		{
			heading: '¿Cómo usa BitTasker Rootstock?',
			body: 'BitTasker utiliza contratos inteligentes de Rootstock para escrow y pagos basados en hitos en la plataforma freelance. Cuando un cliente contrata a un freelancer, los fondos del proyecto se depositan en un contrato de escrow de Rootstock que aplica los términos de pago en código. El contrato libera fondos cuando se aprueban los hitos y sigue reglas predefinidas de resolución de disputas si surgen desacuerdos. Al ser compatible con EVM, los contratos de escrow de BitTasker son auditable y utilizan patrones estándar de Solidity. Esto brinda a freelancers y clientes la seguridad de contratos inteligentes respaldados por Bitcoin sin las tarifas altas ni la complejidad de la red principal de Ethereum.'
		}
	],
	faq: [
		{
			question: '¿Rootstock es realmente un Bitcoin Layer 2?',
			answer:
				'Rootstock es técnicamente una sidechain — una blockchain separada conectada a Bitcoin a través de un peg bidireccional y asegurada a través de merged mining. Algunas personas se refieren coloquialmente a ella como Layer 2 porque extiende la funcionalidad de Bitcoin y hereda su seguridad. La distinción es técnicamente relevante pero Rootstock sirve el mismo propósito que las Layer 2: agregar capacidades a Bitcoin sin alterar la cadena base.'
		},
		{
			question: '¿Cuánto TVL tiene Rootstock?',
			answer:
				'Rootstock ha mantenido consistentemente más de $235M en total value locked (TVL) a través de su ecosistema de DeFi y dApps. Aunque es más pequeño que el TVL de Ethereum, representa el ecosistema de contratos inteligentes más grande directamente anclado a la seguridad de Bitcoin.'
		},
		{
			question: '¿Qué gas usa Rootstock?',
			answer:
				'Rootstock usa RBTC (Rootstock Bitcoin) para gas — la tarifa pagada para procesar transacciones e interacciones de contratos inteligentes. RBTC está vinculado 1:1 con BTC y se puede obtener a través del bridge de Rootstock o plataformas integradas. Las tarifas de gas en Rootstock son típicamente menos de $0.01 por transacción.'
		},
		{
			question: '¿Puedo desplegar contratos de Ethereum en Rootstock?',
			answer:
				'Sí. Rootstock es completamente compatible con EVM, así que los contratos Solidity escritos para Ethereum pueden desplegarse en Rootstock con modificaciones mínimas o ninguna. Los desarrolladores usan las mismas herramientas — Hardhat, Foundry, Remix, MetaMask — y las mismas bibliotecas OpenZeppelin.'
		},
		{
			question: '¿Qué tan segura es Rootstock comparada con Ethereum?',
			answer:
				'Rootstock hereda seguridad de Bitcoin a través de merged mining, lo que significa que los mineros de Bitcoin validan ambas cadenas simultáneamente. La tasa de hash de Bitcoin es la más alta de cualquier blockchain, dando a Rootstock fuertes garantías de seguridad. Sin embargo, el conjunto de validadores de proof-of-stake de Ethereum también es robusto y los dos sistemas tienen diferentes supuestos de confianza.'
		},
		{
			question: '¿Qué es el bridge de RBTC?',
			answer:
				'El bridge de RBTC es el mecanismo que convierte BTC a RBTC y viceversa. Bloqueas BTC en la cadena principal de Bitcoin a través de una federación de firmantes, y se acuña RBTC equivalente en Rootstock. El proceso inverso quema RBTC y libera BTC. Este peg bidireccional te permite mover valor entre Bitcoin y Rootstock de forma segura.'
		},
		{
			question: '¿BitTasker cobra comisiones extra por el escrow de Rootstock?',
			answer:
				'La tarifa de servicio de BitTasker cubre la gestión de escrow — no hay cargos adicionales por usar contratos inteligentes de Rootstock. Las tarifas de red de Rootstock para transacciones individuales son mínimas (típicamente menos de $0.01), haciendo el escrow asequible incluso para proyectos pequeños.'
		}
	],
	bitTaskerCta: {
		heading: 'Construye en Bitcoin con contratos inteligentes de Rootstock',
		body: 'BitTasker aprovecha la sidechain compatible con EVM de Rootstock para escrow seguro respaldado por Bitcoin. Cada proyecto freelance está protegido por contratos inteligentes que heredan la seguridad de Bitcoin.',
		buttonText: 'Inicia un Proyecto Seguro',
		buttonHref: '/auth/signup'
	}
};
