import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Rootstock vs Ethereum: Qué Plataforma de Contratos Elegir',
		subtitle:
			'Rootstock y Ethereum ambos ejecutan contratos inteligentes. Compara seguridad, tarifas, ecosistema y casos de uso para elegir la cadena correcta.'
	},
	answerBlock:
		'Rootstock y Ethereum son ambas plataformas de contratos inteligentes compatibles con EVM, pero sirven para propósitos diferentes. Rootstock es una sidechain de Bitcoin asegurada por la tasa de hash de Bitcoin a través de merged mining, ofreciendo tarifas más bajas y uso directo de BTC. Ethereum es la plataforma original de contratos inteligentes con el ecosistema de desarrolladores más grande, más contratos desplegados y mayor total value locked. Elige Rootstock cuando quieras seguridad a nivel de Bitcoin con compatibilidad de EVM y costos más bajos. Elige Ethereum cuando necesites acceso al ecosistema DeFi más grande y la liquidez más profunda. Para BitTasker, Rootstock fue la elección clara — su modelo de seguridad de Bitcoin lo hace ideal para contratos de escrow que retienen dinero real.',
	sections: [
		{
			heading: '¿Cuál es la diferencia principal entre Rootstock y Ethereum?',
			body: 'La diferencia principal es el modelo de seguridad y el activo. Rootstock es una sidechain de Bitcoin — se ejecuta en paralelo a Bitcoin y está asegurada por mineros de Bitcoin a través de merged mining. Su activo nativo es RBTC (anclado 1:1 a BTC). Ethereum es una blockchain independiente con su propio consenso Proof of Stake y ETH como su activo nativo. Rootstock hereda la seguridad de Bitcoin y usa BTC en contratos; Ethereum tiene su propia capa de seguridad y usa ETH. Ambos usan Solidity y la EVM, así que la experiencia de desarrollador es casi idéntica.'
		},
		{
			heading: '¿Cómo se comparan las tarifas entre Rootstock y Ethereum?',
			body: 'Los gas fees de Rootstock son dramáticamente más bajos que Ethereum. Las transacciones típicas de Rootstock cuestan menos de $0.01, mientras que las transacciones de Ethereum regularmente cuestan $1-50+ dependiendo de la congestión de la red. Durante períodos de alta demanda, el gas de Ethereum puede saltar a $100+ para interacciones complejas de contratos. Las tarifas bajas de Rootstock lo hacen viable para microtransacciones, pagos de escrow pequeños e interacciones de alta frecuencia que serían cost-prohibitive en Ethereum. Esta ventaja de tarifas es significativa para plataformas de freelancing donde los pagos de proyecto pueden oscilar entre $50 y $5,000.'
		},
		{
			heading: '¿Qué ecosistema es más grande — Rootstock o Ethereum?',
			body: 'Ethereum tiene el ecosistema de contratos inteligentes más grande en cripto con cientos de miles de millones en TVL, miles de protocolos desplegados y más desarrolladores. El ecosistema de Rootstock es más pequeño pero está creciendo, con protocolos DeFi establecidos (Sovryn, MoneyOnChain) y creciente adopción institucional. Rootstock se beneficia de la compatibilidad con EVM — herramientas de Ethereum, bibliotecas e incluso algunos contratos se pueden portar directamente. Ethereum es el líder claro en tamaño de ecosistema, pero el modelo de seguridad de Bitcoin de Rootstock lo hace atractivo para aplicaciones que priorizan seguridad sobre amplitud de ecosistema.'
		},
		{
			heading: '¿Cuándo deberías elegir Rootstock sobre Ethereum?',
			body: 'Elige Rootstock cuando tu aplicación retiene valor significativo y se beneficia de seguridad a nivel de Bitcoin — como escrow, custodia y protocolos DeFi que manejan fondos de usuarios. Elige Rootstock cuando necesites tarifas de transacción más bajos para interacciones frecuentes. Elige Rootstock cuando tus usuarios son holders de Bitcoin que quieren interactuar con contratos inteligentes sin convertir a ETH. Elige Rootstock cuando las consideraciones regulatorias favorecen el estatus legal más establecido de Bitcoin. BitTasker eligió Rootstock porque los contratos de escrow deben ser máximamente seguros — el hash rate de Bitcoin proporciona garantías de seguridad más fuertes que cualquier alternativa.'
		},
		{
			heading: '¿Cuándo deberías elegir Ethereum sobre Rootstock?',
			body: 'Elige Ethereum cuando necesites acceso a los pools de liquidez más profundos y la gama más amplia de protocolos DeFi. Elige Ethereum cuando tu aplicación requiera características nativas específicas de Ethereum o integraciones. Elige Ethereum cuando necesites la selección más grande de herramientas de desarrollo y servicios de terceros. Elige Ethereum cuando tu audiencia objetivo ya está integrada en el ecosistema de Ethereum. La ventaja de Ethereum es la madurez del ecosistema — más auditores, más herramientas, más integraciones y más usuarios. Para aplicaciones donde el tamaño del ecosistema importa más que la seguridad de Bitcoin, Ethereum es la opción más fuerte.'
		},
		{
			heading: '¿Puedo mover activos entre Rootstock y Ethereum?',
			body: 'Sí, aunque requiere hacer bridge. Los activos se pueden mover entre Rootstock y Ethereum a través de bridges cross-chain. Sin embargo, esto introduce riesgo de bridge y complejidad adicional. En la práctica, la mayoría de usuarios eligen una cadena y se quedan en ella. Si necesitas BTC en contratos inteligentes, Rootstock es nativo. Si necesitas ETH en contratos inteligentes, Ethereum es nativo. El bridge solo debe hacerse cuando sea necesario, con conciencia de los riesgos asociados.'
		}
	],
	faq: [
		{
			question: '¿Rootstock es más rápido que Ethereum?',
			answer:
				'Rootstock tiene block times más rápidos y tarifas más bajas que Ethereum, pero ambos son relativamente lentos comparado con cadenas de alto throughput. La ventaja de Rootstock es costo y seguridad de Bitcoin, no velocidad pura. Para la mayoría de aplicaciones, Rootstock y Ethereum tienen rendimiento comparable.'
		},
		{
			question: '¿Puedo usar MetaMask con Rootstock?',
			answer:
				'Sí. Rootstock es compatible con EVM y funciona con MetaMask. Solo necesitas agregar la configuración de red de Rootstock a MetaMask. Las mismas billeteras, herramientas e interfaces que funcionan en Ethereum funcionan en Rootstock.'
		},
		{
			question: '¿Cuál es más descentralizado — Rootstock o Ethereum?',
			answer:
				'Ethereum tiene más validadores y una red de consenso más distribuida. Rootstock depende de merged mining con mineros de Bitcoin, lo que proporciona fuerte seguridad pero menos participantes directos. Ambos se consideran suficientemente descentralizados para la mayoría de aplicaciones.'
		},
		{
			question: '¿Rootstock es un clon de Ethereum?',
			answer:
				'Rootstock no es un clon — es una blockchain separada que usa la EVM para ejecución de contratos inteligentes. Tiene su propio mecanismo de consenso (merged mining con Bitcoin), su propio token (RBTC) y su propia red. La compatibilidad con EVM es una decisión de diseño que permite la reutilización de herramientas de desarrollo.'
		},
		{
			question: '¿Puedo desplegar el mismo contrato en ambas cadenas?',
			answer:
				'Sí, como ambas usan Solidity y la EVM, el mismo código de contrato generalmente se puede desplegar tanto en Rootstock como en Ethereum con modificaciones mínimas o ninguna. La diferencia principal es la seguridad subyacente y los costos de gas.'
		},
		{
			question: '¿Por qué BitTasker usa Rootstock en lugar de Ethereum?',
			answer:
				'BitTasker usa Rootstock porque los contratos de escrow necesitan máxima seguridad. Rootstock está respaldado por el hash rate de Bitcoin — la capa de seguridad más grande en cripto. Además, las tarifas más bajas de Rootstock hacen viables las microtransacciones, y los usuarios nativos de BTC no necesitan convertir a ETH.'
		}
	],
	bitTaskerCta: {
		heading: 'Escrow seguro impulsado por Bitcoin',
		body: 'BitTasker eligió Rootstock sobre Ethereum por una razón: seguridad a nivel de Bitcoin para tu dinero. Contratos inteligentes respaldados por la hash rate más poderosa del mundo.',
		buttonText: 'Comienza Ahora',
		buttonHref: '/auth/signup'
	}
};
