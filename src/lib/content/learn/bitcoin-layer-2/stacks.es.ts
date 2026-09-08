import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Stacks: Bitcoin Layer 2 para Smart Contracts y DeFi',
		subtitle:
			'Lenguaje Clarity, consenso Proof of Transfer, sBTC. Descubre cómo Stacks trae finanzas programables a Bitcoin.'
	},
	answerBlock:
		'Stacks es un Bitcoin Layer 2 que habilita contratos inteligentes, DeFi y dApps anclados a la seguridad de Bitcoin. A diferencia de las sidechains que corren en paralelo a Bitcoin, Stacks liquida sus transacciones en la misma blockchain de Bitcoin — cada bloque de Stacks se ancla a un bloque de Bitcoin. Stacks usa Clarity, un lenguaje de contratos inteligentes decidible que previene clases completas de errores, y Proof of Transfer (PoX) como consenso que recicla BTC como columna vertebral económica. La actualización Nakamoto trae tiempos de bloque drásticamente más rápidos y sBTC — un token descentralizado vinculado a BTC que habilita Bitcoin programable completo en contratos inteligentes.',
	sections: [
		{
			heading: '¿Qué es Stacks?',
			body: 'Stacks es una red Layer 2 que extiende la funcionalidad de Bitcoin al habilitar contratos inteligentes y aplicaciones descentralizadas. A diferencia de las Layer 2 tradicionales que procesan transacciones fuera de la cadena y las agrupan en la capa base, las transacciones de Stacks se liquidan en la misma blockchain de Bitcoin. Cada bloque de Stacks incluye un hash del bloque de Bitcoin correspondiente, creando un ancla criptográfica. Esto significa que Stacks hereda la seguridad de Bitcoin para la finalidad de transacciones — una vez que una transacción de Stacks está confirmada y su ancla de Bitcoin está enterrada bajo suficientes bloques, tiene la misma seguridad que una transacción de Bitcoin. Stacks lanzó su mainnet en enero de 2021 y ha crecido para soportar una variedad de protocolos DeFi, plataformas NFT y DAOs.'
		},
		{
			heading: '¿Qué es Clarity y por qué importa?',
			body: 'Clarity es el lenguaje de contratos inteligentes usado en Stacks, diseñado específicamente para seguridad y previsibilidad. A diferencia de Solidity (usado en Ethereum y RGB), Clarity es decidible — el lenguaje garantiza que cualquier ruta de ejecución de un contrato pueda determinarse en tiempo de compilación sin ejecutarlo. Esto elimina categorías completas de errores como ataques de reentrancia, desbordamiento de enteros y bucles ilimitados que plagan los contratos Solidity. Clarity también es interpretado en lugar de compilado, lo que significa que el código fuente se almacena en la cadena y es auditable por cualquiera. Para aplicaciones financieras donde los errores pueden significar pérdida de fondos, las garantías de seguridad de Clarity proporcionan reducción significativa de riesgo.'
		},
		{
			heading: '¿Qué es Proof of Transfer (PoX)?',
			body: 'Proof of Transfer es el mecanismo de consenso de Stacks, único en el espacio blockchain. Los mineros comprometen BTC para participar en la producción de bloques — envían BTC a holders existentes de STX como costo de participación. Esto crea un vínculo económico directo entre Stacks y Bitcoin: los mineros gastan BTC real para ganar el derecho de minar bloques STX y colectar tarifas de transacción. Los holders de STX que reciben estas recompensas de BTC se llaman Stackers, y pueden bloquear sus STX para participar en el consenso y ganar rendimiento en Bitcoin. PoX se considera una evolución del Proof of Work — en lugar de quemar electricidad, los mineros queman un asset ya asegurado (BTC), haciendo el mecanismo de consenso económicamente eficiente.'
		},
		{
			heading: '¿Qué es la actualización Nakamoto?',
			body: 'La actualización Nakamoto es la mejora más significativa de Stacks desde su lanzamiento. Introduce varios cambios críticos: tiempos de bloque más rápidos (de ~10 minutos a segundos), garantías de finalidad de Bitcoin más fuertes e infraestructura para sBTC. Antes de Nakamoto, la producción de bloques de Stacks dependía del intervalo de 10 minutos de bloques de Bitcoin. Después de Nakamoto, Stacks procesa bloques independientemente y solo se ancla a Bitcoin para finalidad, mejorando dramáticamente la velocidad de transacción. La actualización también trae independencia del minero — la producción de bloques ya no se detiene cuando los bloques de Bitcoin se retrasan. Nakamoto se implementó en etapas durante 2024, con la activación completa completada a finales de 2024.'
		},
		{
			heading: '¿Qué es sBTC?',
			body: 'sBTC es un token descentralizado y programable vinculado 1:1 a BTC, construido en el Layer 2 de Stacks. A diferencia del Bitcoin envuelto en Ethereum (WBTC), que depende de custodios centralizados, sBTC está respaldado por una red descentralizada de firmantes y asegurado por Bitcoin a través del protocolo Stacks. sBTC habilita que Bitcoin se use directamente en contratos inteligentes en Stacks — para DeFi de préstamos, AMMs, compras de NFTs y cualquier aplicación que necesite BTC programable. El bridge de sBTC es abierto y descentralizado, lo que significa que cualquiera puede acuñar o canjear sBTC sin depender de una empresa. Esto es un avance fundamental para la programabilidad de Bitcoin.'
		},
		{
			heading: '¿Qué puedes construir en Stacks?',
			body: 'Stacks soporta un ecosistema creciente de aplicaciones descentralizadas. Plataformas DeFi como ALEX y Arkadiko ofrecen préstamos, empréstitos y trading AMM. El ecosistema NFT en Stacks incluye marketplaces como Gamma y HeyAlfred. Las DAOs usan Stacks para gobernanza y gestión de tesorería. Dado que Stacks liquidan en Bitcoin, todas estas aplicaciones se benefician del modelo de seguridad de Bitcoin. El lenguaje Clarity hace que Stacks sea particularmente adecuado para aplicaciones financieras donde la corrección del contrato es crítica. La combinación de seguridad de Bitcoin, seguridad de Clarity y programabilidad de sBTC crea una propuesta de valor única para construir en Bitcoin.'
		},
		{
			heading: 'Stacks vs RGB para smart contracts en Bitcoin',
			body: 'Tanto Stacks como RGB traen contratos inteligentes a Bitcoin, pero con diferentes enfoques. Stacks liquidan transacciones directamente en Bitcoin y usa su propio lenguaje (Clarity) diseñado para seguridad. RGB corre como una sidechain paralela con compatibilidad EVM y merged mining. Stacks tiene la actualización Nakamoto para bloques más rápidos y sBTC para Bitcoin programable. RGB tiene herramientas EVM y un TVL existente más grande. Para desarrolladores, la elección a menudo se reduce a preferencia de lenguaje (Clarity vs Solidity), modelo de consenso (PoX vs merged mining) y necesidades específicas de funcionalidades como sBTC.'
		}
	],
	faq: [
		{
			question: '¿Qué es el token STX?',
			answer:
				'STX (Stacks) es el token nativo de la red Layer 2 de Stacks. Se usa para tarifas de gas, despliegue de contratos inteligentes y participación en el consenso Proof of Transfer. Los holders de STX pueden bloquear sus tokens para ganar rendimiento en Bitcoin a través del mecanismo PoX.'
		},
		{
			question: '¿Qué tan rápidas son las transacciones de Stacks después de Nakamoto?',
			answer:
				'Después de la actualización Nakamoto, los bloques de Stacks se producen en segundos en lugar de los intervalos anteriores de ~10 minutos vinculados a bloques de Bitcoin. Aunque la finalidad aún depende de las confirmaciones de bloques de Bitcoin, la experiencia del usuario es drásticamente más rápida para transacciones cotidianas.'
		},
		{
			question: '¿sBTC es lo mismo que WBTC?',
			answer:
				'No. WBTC (Bitcoin envuelto en Ethereum) está bajo custodia de BitGo y depende de un bridge centralizado. sBTC es un token descentralizado a nivel de protocolo asegurado por la red Stacks y Bitcoin. sBTC puede ser acuñado y canjeado por cualquiera a través de la red descentralizada de firmantes.'
		},
		{
			question: '¿Cómo previene Clarity los errores en contratos inteligentes?',
			answer:
				'Clarity es decidible — el compilador puede determinar todas las posibles rutas de ejecución sin ejecutar el contrato. Esto previene bucles ilimitados, ataques de reentrancia y errores de desbordamiento de enteros. También es interpretado, así que el código fuente se almacena en la cadena y es completamente auditable.'
		},
		{
			question: '¿Puedo usar Stacks para DeFi?',
			answer:
				'Sí. Stacks tiene un ecosistema DeFi en crecimiento que incluye protocolos de préstamos (Arkadiko), AMMs (ALEX) y plataformas de stablecoins. sBTC habilita DeFi respaldado por Bitcoin donde los usuarios pueden prestar, pedir prestado y comerciar usando BTC programáticamente.'
		},
		{
			question: '¿Cómo funciona Proof of Transfer?',
			answer:
				'Los mineros comprometen BTC para participar en la producción de bloques. El BTC se envía a los holders de STX que están haciendo stacking (bloqueando) sus tokens. Esto crea un vínculo económico directo entre Stacks y Bitcoin — los mineros gastan BTC real y los holders de STX ganan rendimiento en Bitcoin.'
		},
		{
			question: '¿Es segura Stacks?',
			answer:
				'Stacks liquidan en Bitcoin, lo que significa que la finalidad de transacciones está anclada a la blockchain de Bitcoin. Una vez que el ancla de Bitcoin de una transacción de Stacks está confirmada bajo suficientes bloques, tiene la misma seguridad que una transacción de Bitcoin. La actualización Nakamoto fortaleció estas garantías de finalidad.'
		}
	],
	bitTaskerCta: {
		heading: 'Construye freelancing descentralizado en Bitcoin con Stacks',
		body: 'BitTasker explora Stacks para escrow potenciado por DeFi y pagos programables anclados directamente a Bitcoin. El modelo de seguridad de Clarity asegura contratos inteligentes confiables para trabajo freelance.',
		buttonText: 'Empieza a Construir',
		buttonHref: '/auth/signup'
	}
};
