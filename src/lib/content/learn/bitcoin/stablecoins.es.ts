import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Stablecoins Explicados: Guía de USDT, USDC y DAI',
		subtitle:
			'Qué son los stablecoins, cómo mantienen su paridad, y por qué importan para freelancers en 2026.'
	},
	answerBlock:
		'Los stablecoins son criptomonedas diseñadas para mantener un valor estable, típicamente ancladas 1:1 al dólar estadounidense. Los tres tipos principales son respaldados por fiat (USDT, USDC — reservas mantenidas en bancos), colateralizados con cripto (DAI — sobre-colateralizados con ETH en MakerDAO), y algorítmicos (suministro ajustado por código, aunque muchos han fallado). Para freelancers, los stablecoins ofrecen la velocidad y accesibilidad global de las cripto sin la volatilidad de Bitcoin o Ethereum. Puedes recibir un pago en USDC, mantenerlo sin riesgo de precio, y convertirlo a moneda local cuando lo necesites. BitTasker acepta pagos en stablecoins junto con Bitcoin y Lightning, dando a los freelancers la flexibilidad de elegir su denominación preferida.',
	sections: [
		{
			heading: '¿Qué son los stablecoins y por qué existen?',
			body: 'Los stablecoins resuelven un problema fundamental en cripto: la volatilidad. El precio de Bitcoin puede fluctuar 5-10% en un día, haciéndolo impráctico para fijar precios de bienes, pagar renta o dirigir un negocio. Los stablecoins anclan su valor a un activo estable — usualmente el dólar estadounidense — combinando los beneficios de las cripto (transferencias rápidas, accesibilidad global, programabilidad) con la estabilidad del fiat. Para freelancers, esto significa que puedes recibir $500 en USDC y saber que seguirán valiendo $500 mañana. Los stablecoins también son esenciales para DeFi: los protocolos de préstamos, DEXs y granjas de rendimiento todos operan en pools de liquidez denominados en stablecoins. La capitalización de mercado total de stablecoins supera los $150 mil millones, convirtiéndolos en uno de los casos de uso más adoptados de las cripto.'
		},
		{
			heading: '¿Cómo mantienen su paridad los stablecoins?',
			body: 'Los stablecoins respaldados por fiat (USDT, USDC) mantienen su paridad sosteniendo reservas equivalentes al suministro total. Tether (USDT) afirma mantener Tesorerías de EE.UU., efectivo y otros activos respaldando cada token. Circle (USDC) publica atestaciones mensuales mostrando reservas en bonos gubernamentales de corto plazo y efectivo de EE.UU. Si la demanda aumenta, se acuñan nuevos tokens y las reservas aumentan. Si la demanda disminuye, los tokens se queman y las reservas disminuyen. Los stablecoins colateralizados con cripto (DAI) funcionan diferente: los usuarios depositan ETH (u otro cripto) como colateral al 150%+ del valor del stablecoin, creando un colchón contra caídas de precio. Si el colateral cae por debajo del ratio requerido, se liquida. Los stablecoins algorítmicos intentan mantener la paridad a través de manipulación de suministro — acuñando cuando están por encima de la paridad, quemando cuando están por debajo — pero muchos (como TerraUSD) han fallado catastróficamente.'
		},
		{
			heading: 'USDT vs USDC vs DAI: ¿cuál deberías usar?',
			body: 'USDT (Tether) es el stablecoin más grande por capitalización de mercado y volumen de trading, ofreciendo la liquidez más profunda entre exchanges. Sin embargo, la transparencia de sus reservas ha sido cuestionada históricamente, aunque auditorías recientes han mejorado la confianza. USDC (Circle) es el stablecoin más transparente, con atestaciones mensuales de reservas y cumplimiento regulatorio en EE.UU. Es preferido por instituciones y plataformas reguladas. DAI (MakerDAO) es completamente descentralizado — ninguna empresa lo controla y las reservas son transparentes en cadena. Sin embargo, DAI requiere sobre-colateralización (150%+), haciendo que la eficiencia de capital sea menor. Para freelancers: USDC ofrece el mejor equilibrio de transparencia y liquidez. USDT es ampliamente aceptado pero menos transparente. DAI es completamente descentralizado pero requiere más bloqueo de capital.'
		},
		{
			heading: 'Stablecoins para remesas y pagos transfronterizos',
			body: 'Los stablecoins se han convertido en el método preferido para pagos transfronterizos, especialmente en América Latina. Los servicios tradicionales de remesas (Western Union, MoneyGram) cobran comisiones del 5-10% y toman 3-5 días hábiles. Las transferencias de stablecoins se liquidan en minutos por menos de $1 en comisiones. En países como Argentina, Venezuela y Colombia, los stablecoins sirven como un punto de acceso práctico al dólar — los ciudadanos pueden recibir USDC del exterior y mantener valor en un activo equivalente al dólar sin necesitar una cuenta bancaria en EE.UU. Para freelancers en América Latina, los stablecoins resuelven dos problemas: recibir pagos de clientes internacionales sin demoras de transferencias bancarias, y preservar ganancias contra la devaluación de la moneda local. BitTasker acepta pagos en USDC junto con Bitcoin, dando a los freelancers la flexibilidad de elegir según sus necesidades.'
		},
		{
			heading: 'Stablecoins en Bitcoin: Liquid USDt',
			body: 'Aunque la mayoría de stablecoins funcionan en Ethereum o Tron, Tether (USDT) también está disponible en la Liquid Network — una sidechain de Bitcoin desarrollada por Blockstream. Liquid USDt ofrece la misma paridad 1:1 con el USD que USDT ERC-20 pero funciona en una red asegurada por Bitcoin con tiempos de bloque más rápidos (1 minuto vs 12+ minutos) y transacciones confidenciales. Para el ecosistema Bitcoin, Liquid USDt trae la utilidad de stablecoins sin salir del modelo de seguridad de Bitcoin. La integración de BitTasker con sidechains de Bitcoin significa que los freelancers pueden potencialmente recibir pagos en stablecoins en redes aseguradas por Bitcoin, combinando la estabilidad de activos anclados al dólar con las garantías de seguridad de Bitcoin.'
		},
		{
			heading: 'Riesgos: desanclaje, regulatorio y contraparte',
			body: 'Los stablecoins conllevan riesgos reales. El desanclaje ocurre cuando un stablecoin se comercializa por debajo de su paridad deseada — USDC se desancló brevemente a $0.87 durante la crisis del Silicon Valley Bank en marzo de 2023 debido a que $3.3B en reservas estaban en el banco fallido. Los stablecoins algorítmicos son los más vulnerables: el colapso de TerraUSD en mayo de 2022 borró $40B en valor. El riesgo regulatorio está aumentando: el marco MiCA de la UE impone requisitos estrictos a los emisores de stablecoins, y las regulaciones de EE.UU. continúan evolucionando. El riesgo de contraparte aplica a stablecoins respaldados por fiat — estás confiando en que el emisor mantenga reservas adecuadas. Para freelancers, el riesgo práctico es relativamente bajo con stablecoins mayores (USDC, USDT) para tenencia a corto-mediano plazo, pero la tenencia a largo plazo introduce incertidumbre regulatoria y de contraparte. La diversificación entre stablecoins y mantener exposición a BTC es una estrategia común de mitigación de riesgo.'
		},
		{
			heading: 'Cómo BitTasker soporta pagos en stablecoins',
			body: 'BitTasker acepta pagos en stablecoins junto con Bitcoin y Lightning, dando flexibilidad a freelancers y clientes en cómo transaccionan. Los clientes pueden fondar escrow en USDC u otros stablecoins compatibles, proporcionando predecibilidad de precio para presupuestos de proyectos. Los freelancers pueden elegir recibir pagos en stablecoins para evitar la volatilidad de Bitcoin, o en BTC para beneficiarse de potencial apreciación. Los contratos inteligentes de escrow en RGB soportan múltiples tipos de activo, significando que el mismo mecanismo de escrow sin necesidad de confianza funciona tanto si mantienes BTC, BTC o stablecoins. Para freelancers en economías volátiles, la opción de recibir pagos en un activo anclado al dólar mientras aún se benefician de escrow basado en blockchain y liquidación instantánea es una combinación poderosa.'
		}
	],
	faq: [
		{
			question: '¿Son seguros los stablecoins?',
			answer:
				'Los stablecoins mayores como USDC y USDT generalmente se consideran seguros para tenencia a corto-mediano plazo. Están respaldados por reservas (bonos gubernamentales de EE.UU., efectivo) y han mantenido su paridad a través de estrés del mercado. Sin embargo, conllevan riesgo de contraparte (confiar en el emisor) y riesgo regulatorio. DAI es descentralizado pero requiere sobre-colateralización. Ningún stablecoin es libre de riesgo — intercambian estabilidad por la conveniencia de cripto anclada al dólar.'
		},
		{
			question: '¿Puedo recibir pagos freelance en stablecoins?',
			answer:
				'Sí. BitTasker acepta pagos en stablecoins, permitiendo a los clientes fondar escrow y a los freelancers recibir pagos en USDC u otros stablecoins compatibles. Esto es útil para freelancers que quieren evitar la volatilidad de Bitcoin mientras aún se benefician de pagos basados en blockchain.'
		},
		{
			question: '¿Qué pasa si un stablecoin pierde su paridad?',
			answer:
				'Si un stablecoin se desancla, su valor cae por debajo de $1 temporalmente (o permanentemente en casos extremos como TerraUSD). Para freelancers, esto significa que el poder adquisitivo de tus ganancias disminuye. Mitigación de riesgo: convertir a moneda local rápidamente, diversificar entre stablecoins, o mantener algo de BTC. Los stablecoins mayores (USDC, USDT) se han recuperado de desanclajes breves, pero un desanclaje prolongado es posible.'
		},
		{
			question: '¿Están regulados los stablecoins?',
			answer:
				'La regulación varía por jurisdicción. El marco MiCA de la UE (vigente desde 2024) impone requisitos estrictos de reservas y divulgación a los emisores de stablecoins. La regulación de EE.UU. está evolucionando, con la SEC y CFTC ambas reclamando jurisdicción. Algunos países (El Salvador, UAE) son más amigables con las cripto. Para freelancers, usar stablecoins de emisores regulados (Circle, Tether) proporciona la mayor claridad legal.'
		},
		{
			question: '¿Los stablecoins tienen comisiones?',
			answer:
				'Las comisiones de transacción de stablecoins dependen de la red. Las transferencias de USDC en Ethereum cuestan $0.50-5+ en comisiones de gas. Las transferencias de USDT en Tron cuestan menos de $1. BitTasker usa RGB para contratos inteligentes, donde las comisiones de transacción son menores a $0.01. Típicamente no hay comisiones por recibir stablecoins, aunque convertir a moneda local puede involucrar comisiones de cambio.'
		},
		{
			question: '¿Cuál es el mejor stablecoin para freelancers?',
			answer:
				'USDC generalmente se recomienda para freelancers debido a su transparencia, cumplimiento regulatorio y fuerte liquidez. Es ampliamente aceptado en exchanges y plataformas. Para freelancers en regiones con acceso limitado a exchanges, USDT en Tron ofrece la mayor aceptación de comerciantes. DAI funciona para quienes priorizan la descentralización sobre la conveniencia.'
		}
	],
	bitTaskerCta: {
		heading: 'Recibe pagos en stablecoins o Bitcoin — tú eliges',
		body: 'BitTasker acepta pagos en stablecoins junto con Bitcoin y Lightning. Elige la moneda que funcione para tu situación — ya sea estabilidad en dólares vía USDC o el potencial de crecimiento de Bitcoin.',
		buttonText: 'Empieza a Recibir Pagos',
		buttonHref: '/auth/signup'
	}
};
