import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Guía de RBTC: Cómo Usar Rootstock Bitcoin',
		subtitle:
			'RBTC es Bitcoin en Rootstock. Aprende cómo obtenerlo, usarlo para gas fees y aprovecharlo en el sistema de escrow de BitTasker.'
	},
	answerBlock:
		'RBTC (Rootstock Bitcoin) es el token nativo de la red Rootstock, anclado 1:1 a Bitcoin. Usas RBTC para pagar gas fees al ejecutar contratos inteligentes en Rootstock — similar a como funciona ETH en Ethereum. RBTC se obtiene al hacer bridge de BTC desde la mainchain de Bitcoin a Rootstock a través de un bridge federado. Cada RBTC está respaldado por exactamente un BTC bloqueado en el bridge, manteniendo un anclaje estable 1:1. En BitTasker, RBTC potencia el sistema de escrow — los clientes financian proyectos con RBTC, los freelancers reciben RBTC, y todas las interacciones de contratos inteligentes se pagan con gas fees mínimas de RBTC (típicamente menos de $0.01).',
	sections: [
		{
			heading: '¿Qué es RBTC?',
			body: 'RBTC es un token en la sidechain de Rootstock que representa Bitcoin. Está anclado 1:1 a BTC, lo que significa que un RBTC siempre equivale a un Bitcoin. RBTC existe porque Rootstock es una red separada de Bitcoin — necesita su propio token nativo para pagar tarifas de transacción y ejecución de contratos inteligentes. Cuando haces bridge de BTC a Rootstock, recibes una cantidad equivalente de RBTC. Cuando haces bridge de vuelta a Bitcoin, RBTC se quema y BTC se desbloquea. RBTC no es una criptomoneda separada — es Bitcoin operando en la sidechain de Rootstock.'
		},
		{
			heading: '¿Cómo obtengo RBTC?',
			body: 'Obienes RBTC al hacer bridge de BTC desde la mainchain de Bitcoin a Rootstock. El método más común es usar el Rootstock Bridge — una interfaz web donde envías BTC a una dirección específica y recibes RBTC en Rootstock. El bridge es federado, lo que significa que una red de funcionarios independientes valida y procesa transferencias cross-chain. Servicios de terceros como Li.Fi y FastBTC también ofrecen bridge con diferentes opciones de UX. Una vez que tienes RBTC en una billetera compatible con Rootstock (como MetaMask configurado para Rootstock), puedes usarlo para gas fees, DeFi, escrow o cualquier aplicación de Rootstock.'
		},
		{
			heading: '¿Cómo uso RBTC para gas fees?',
			body: 'RBTC se usa para pagar cada transacción en Rootstock, igual que ETH en Ethereum. Cuando envías tokens, interactúas con un contrato inteligente o realizas cualquier acción en cadena en Rootstock, necesitas RBTC en tu billetera para cubrir el gas fee. La buena noticia es que los gas fees de Rootstock son extremadamente bajos — típicamente menos de $0.01 por transacción. Incluso las interacciones complejas de contratos inteligentes raramente cuestan más de unos centavos. Necesitas una pequeña cantidad de RBTC en tu billetera para operar en Rootstock, pero el costo es insignificante comparado con los gas fees de Ethereum.'
		},
		{
			heading: '¿Cómo funciona RBTC en BitTasker?',
			body: 'En BitTasker, RBTC es la moneda para escrow y pagos. Cuando un cliente financia un proyecto, deposita RBTC en el contrato inteligente de escrow en Rootstock. Cuando el proyecto se completa y aprueba, RBTC se libera al freelancer. Todas las interacciones de contratos inteligentes — financiamiento, entrega, aprobación, resolución de disputas — se pagan con gas fees de RBTC. El freelancer recibe RBTC que puede mantener, usar para otras aplicaciones de Rootstock o hacer bridge de vuelta a BTC en la mainchain de Bitcoin. Esto crea un flujo de pago fluido nativo de Bitcoin asegurado por los contratos inteligentes de Rootstock.'
		},
		{
			heading: '¿Qué es el anclaje de RBTC y cómo se mantiene?',
			body: 'El anclaje de RBTC lo mantiene el bridge federado de Rootstock. Cuando BTC se envía al bridge, se bloquea en una dirección multi-signature, y se acuña una cantidad equivalente de RBTC en Rootstock. Cuando RBTC se envía de vuelta al bridge, se quema, y se libera el BTC correspondiente. Este mecanismo de bloqueo-y-acuñación / quema-y-liberación mantiene RBTC anclado 1:1 a BTC. La federación consiste en funcionarios independientes que colectivamente controlan el bridge, requiriendo múltiples firmas para procesar transferencias. Este modelo federado ha estado operativo desde el lanzamiento de Rootstock en 2018 con un fuerte historial de seguridad.'
		},
		{
			heading: '¿Puedo convertir RBTC de vuelta a BTC?',
			body: 'Sí. Puedes hacer bridge de RBTC de vuelta a BTC en cualquier momento a través del Rootstock Bridge o servicios de terceros. El proceso quema tu RBTC en Rootstock y libera el BTC equivalente en la mainchain de Bitcoin. Hacer bridge de vuelta a Bitcoin típicamente toma 20-30 minutos dependiendo de los tiempos de confirmación de Bitcoin. Hay una pequeña tarifa de bridge para la conversión, y debes asegurarte de tener suficiente RBTC para cubrir tanto la transacción de bridge como cualquier gas fee restante.'
		}
	],
	faq: [
		{
			question: '¿RBTC es lo mismo que BTC?',
			answer:
				'RBTC está anclado 1:1 a BTC y está respaldado por Bitcoin bloqueado, pero opera en la sidechain de Rootstock, no en la mainchain de Bitcoin. RBTC se usa para interacciones de contratos inteligentes en Rootstock, mientras que BTC opera en la capa base de Bitcoin. Puedes convertir entre ellos a través del Rootstock Bridge.'
		},
		{
			question: '¿Cuánto RBTC necesito para usar Rootstock?',
			answer:
				'Necesitas una pequeña cantidad de RBTC para gas fees — típicamente $1-5 en valor es suficiente para docenas de transacciones. Para uso de escrow o DeFi, necesitas RBTC equivalente a la cantidad que quieres transaccionar. Los gas fees son mínimos (menos de $0.01 por transacción).'
		},
		{
			question: '¿Es seguro hacer bridge de BTC a RBTC?',
			answer:
				'El bridge federado de Rootstock ha estado operativo desde 2018 con miles de millones en transferencias procesadas y sin incidentes de seguridad. El bridge usa seguridad multi-signature con funcionarios independientes. Aunque ningún bridge es libre de riesgos, el bridge de Rootstock tiene uno de los historiales más fuertes de la industria.'
		},
		{
			question: '¿Cuánto tarda el bridge?',
			answer:
				'Hacer bridge de BTC a RBTC típicamente toma 10-30 minutos, dependiendo de los requisitos de confirmación de Bitcoin. Hacer bridge de RBTC de vuelta a BTC toma tiempo similar. Los servicios de bridge de terceros pueden ofrecer opciones más rápidas.'
		},
		{
			question: '¿Qué billeteras soportan RBTC?',
			answer:
				'Cualquier billetera compatible con Ethereum configurada para la red de Rootstock soporta RBTC. MetaMask es la opción más común — solo necesitas agregar la configuración de red de Rootstock. Billeteras hardware como Ledger y Trezor también soportan Rootstock a través de MetaMask.'
		},
		{
			question: '¿BitTasker cobra tarifas en RBTC?',
			answer:
				'La tarifa de servicio de BitTasker (5–10%) se deduce del pago de escrow. Los gas fees de interacciones de contratos inteligentes se pagan en RBTC y son típicamente menos de $0.01. No hay tarifas adicionales específicas de RBTC más allá de la tarifa de servicio estándar y el gas de red.'
		}
	],
	bitTaskerCta: {
		heading: 'Comienza a ganar en Bitcoin con BitTasker',
		body: 'Financia proyectos con RBTC, recibe pagos en RBTC y haz bridge de vuelta a BTC en cualquier momento. El escrow de Rootstock de BitTasker hace que los pagos en Bitcoin sean fluidos para freelancers en todo el mundo.',
		buttonText: 'Comienza Ahora',
		buttonHref: '/auth/signup'
	}
};
