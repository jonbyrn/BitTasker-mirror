import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Contratos Inteligentes en Bitcoin: Cómo Funcionan en Rootstock',
		subtitle:
			'Los contratos inteligentes en Bitcoin son reales — y funcionan en Rootstock. Aprende cómo los contratos Solidity se ejecutan en la blockchain más segura del mundo.'
	},
	answerBlock:
		'Los contratos inteligentes en Bitcoin son programas autoejecutables que funcionan en Rootstock, una sidechain de Bitcoin que trae compatibilidad con Ethereum Virtual Machine (EVM) a Bitcoin. En lugar de desplegar contratos en Ethereum, los desarrolladores escriben código Solidity que se ejecuta en Rootstock y está asegurado por la tasa de hash de Bitcoin a través de merged mining. Esto significa que obtienes toda la programabilidad de los contratos inteligentes de Ethereum — escrow, lending, tokenización, DEX — con la seguridad incomparable de Bitcoin. BitTasker usa contratos inteligentes de Rootstock para potenciar su sistema de escrow sin necesidad de confianza, donde los fondos del proyecto se bloquean en código auditable hasta que ambas partes confirmen la finalización.',
	sections: [
		{
			heading: '¿Cómo funcionan los contratos inteligentes en Bitcoin?',
			body: 'La capa base de Bitcoin tiene capacidades de scripting intencionalmente limitadas por razones de seguridad. Los contratos inteligentes en Bitcoin funcionan a través de soluciones Layer 2 como Rootstock, que se ejecuta como una sidechain conectada a Bitcoin. Cuando despliegas un contrato inteligente en Rootstock, se ejecuta en la red de Rootstock pero asienta su estado en Bitcoin a través de merged mining. La lógica del contrato corre en la EVM (Ethereum Virtual Machine), que es completamente compatible con el entorno de ejecución de Ethereum. Esto significa que los contratos Solidity — el mismo código que corre en Ethereum — funcionan en Rootstock sin modificaciones. La diferencia clave es que la seguridad de Rootstock está respaldada por mineros de Bitcoin, no por un conjunto de validadores separado.'
		},
		{
			heading: '¿Qué puedes construir con contratos inteligentes en Bitcoin?',
			body: 'Los contratos inteligentes en Bitcoin en Rootstock permiten las mismas aplicaciones que Ethereum, pero aseguradas por Bitcoin: sistemas de escrow para freelancers y marketplaces (como BitTasker), protocolos de lending y borrowing descentralizados (como Sovryn), stablecoins respaldadas por BTC (como MoneyOnChain), exchanges descentralizados, activos del mundo real tokenizados, NFTs y DAOs. La ventaja de construir estos en Rootstock en lugar de Ethereum es que tus contratos están protegidos por el hash rate de Bitcoin — la capa de seguridad más grande y descentralizada en criptomonedas. Esto es especialmente valioso para aplicaciones que retienen valor significativo, como escrow y protocolos DeFi.'
		},
		{
			heading: '¿Cómo se comparan los contratos inteligentes de Bitcoin con los de Ethereum?',
			body: 'Funcionalmente, los contratos inteligentes de Bitcoin en Rootstock y los de Ethereum son casi idénticos — ambos usan Solidity y la EVM. Las diferencias están en seguridad y costo. Los contratos de Rootstock están asegurados por el merged mining de Bitcoin, proporcionando garantías de seguridad argumentablemente más fuertes que el Proof of Stake de Ethereum. Los gas fees en Rootstock son significativamente más bajos que Ethereum mainnet (típicamente menos de $0.01 vs. $1-50+ en Ethereum). Sin embargo, Ethereum tiene un ecosistema más grande con más contratos desplegados, más desarrolladores y más total value locked. Para aplicaciones que priorizan seguridad a nivel de Bitcoin y costos más bajos sobre el tamaño del ecosistema, Rootstock es la opción más fuerte.'
		},
		{
			heading: '¿Cómo usa BitTasker los contratos inteligentes en Bitcoin?',
			body: 'BitTasker despliega contratos inteligentes de escrow en Rootstock que manejan automáticamente los pagos de proyectos freelance. Cuando un cliente publica un proyecto, los fondos se depositan en un contrato inteligente de Rootstock que los bloquea según condiciones predefinidas — típicamente entrega y aprobación de hitos. El contrato aplica las reglas de pago sin ningún intermediario humano. Cuando ambas partes confirman la finalización, los fondos se liberan al freelancer. Si surge una disputa, el contrato sigue reglas de resolución estructuradas. Toda la lógica del contrato es auditable en la blockchain, así que ambas partes pueden verificar las condiciones del escrow antes de comprometerse. Esto elimina la necesidad de confiar en una empresa de plataforma con tu dinero.'
		},
		{
			heading: '¿Son seguros los contratos inteligentes en Bitcoin?',
			body: 'Los contratos inteligentes en Rootstock heredan la seguridad de Bitcoin a través de merged mining. Esto significa que el mismo hash power que asegura miles de millones de dólares de Bitcoin también asegura los contratos de Rootstock. En la práctica, atacar un contrato de Rootstock requeriría comprometer la tasa de hash de Bitcoin — una proposición astronómicamente costosa. Además, los contratos de Rootstock usan código Solidity auditable y de código abierto. Contratos bien auditados de bibliotecas como OpenZeppelin se pueden desplegar directamente, reduciendo el riesgo de vulnerabilidades. La combinación de seguridad a nivel de Bitcoin y código auditable hace a los contratos inteligentes de Rootstock entre los más seguros de la industria.'
		},
		{
			heading: '¿Cuáles son las limitaciones de los contratos inteligentes en Bitcoin?',
			body: 'La limitación principal es el tamaño del ecosistema — Rootstock tiene menos contratos desplegados y una comunidad de desarrolladores más pequeña que Ethereum. El riesgo de bridge existe al mover BTC a Rootstock (el bridge federado introduce una suposición de confianza). Los bugs en contratos inteligentes pueden ocurrir si el código está mal escrito o sin auditar, independientemente de la blockchain subyacente. El throughput de transacciones en Rootstock es mayor que Bitcoin mainnet pero menor que cadenas dedicadas de alto throughput. Para la mayoría de aplicaciones, especialmente aquellas que priorizan seguridad sobre velocidad pura, estas limitaciones son trade-offs aceptables.'
		}
	],
	faq: [
		{
			question: '¿Realmente se pueden ejecutar contratos inteligentes en Bitcoin?',
			answer:
				'Sí, a través de Rootstock. Rootstock es una sidechain de Bitcoin que trae capacidad completa de contratos inteligentes EVM a Bitcoin. Los contratos están asegurados por Bitcoin a través de merged mining y se asientan en la blockchain de Bitcoin. No es teórico — Rootstock ha estado ejecutando contratos inteligentes en producción desde 2018.'
		},
		{
			question: '¿Necesito aprender un nuevo lenguaje para contratos inteligentes en Bitcoin?',
			answer:
				'No. Rootstock usa Solidity, el mismo lenguaje usado para contratos inteligentes en Ethereum. Si conoces Solidity, puedes desplegar en Rootstock inmediatamente. Si eres nuevo en contratos inteligentes, Solidity es el lenguaje de contratos inteligentes más documentado y enseñado.'
		},
		{
			question:
				'¿Los contratos inteligentes en Bitcoin en Rootstock son iguales a los de Ethereum?',
			answer:
				'Los contratos en sí son idénticos — ambos usan Solidity y la EVM. La diferencia es la seguridad subyacente: los contratos de Rootstock están respaldados por mineros de Bitcoin, mientras que los contratos de Ethereum están asegurados por los validadores Proof of Stake de Ethereum. Rootstock también tiene tarifas de gas más bajas.'
		},
		{
			question: '¿Cuánto cuesta desplegar un contrato inteligente en Rootstock?',
			answer:
				'Los costos de despliegue varían según la complejidad del contrato, pero los gas fees de Rootstock son significativamente más bajos que Ethereum. Los despliegues de contratos simples típicamente cuestan menos de $0.10 en Rootstock, comparado con $50-500+ en Ethereum mainnet.'
		},
		{
			question: '¿El contrato de escrow de BitTasker está auditado?',
			answer:
				'Los contratos de escrow de BitTasker están construidos usando bibliotecas auditadas y siguen las mejores prácticas establecidas de seguridad de contratos inteligentes. El código del contrato es auditable en la blockchain de Rootstock, proporcionando transparencia total a todas las partes.'
		}
	],
	bitTaskerCta: {
		heading: 'Experimenta los contratos inteligentes de Bitcoin en acción',
		body: 'Los contratos de escrow de BitTasker en Rootstock demuestran que los contratos inteligentes de Bitcoin funcionan — auditable, seguro y sin necesidad de confianza. Pruébalo con tu próximo proyecto freelance.',
		buttonText: 'Inicia un Proyecto',
		buttonHref: '/auth/signup'
	}
};
