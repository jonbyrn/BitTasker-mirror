import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Pagos Bitcoin en BitTasker: Cómo Cobran los Freelancers',
		subtitle:
			'BTC, Lightning, BTC y stablecoins — pagos instantáneos con protección de escrow de RGB.'
	},
	answerBlock:
		'BitTasker paga a freelancers en Bitcoin usando un sistema de pagos multi-moneda construido para la economía global de freelancing. Las monedas soportadas incluyen BTC on-chain, Red Lightning para pagos instantáneos, BTC en RGB para escrow con contratos inteligentes y stablecoins (USDC) para pagos denominados en dólares. Cuando un cliente aprueba el trabajo completado, los fondos se liberan de un contrato inteligente de RGB y llegan a tu billetera vía Lightning en segundos. La protección de escrow está enforceada por contratos inteligentes auditables minados junto con Bitcoin. Las comisiones son escalonadas según lealtad — cuantos más proyectos completes, menos pagas. Cada pago es de autocustodia: conectas tu propia billetera y BitTasker nunca retiene tus fondos.',
	sections: [
		{
			heading: '¿Cómo funcionan los pagos en Bitcoin en BitTasker?',
			body: 'BitTasker usa un flujo de pago de tres pasos. Paso 1: El cliente financia un proyecto depositando criptomonedas en un contrato inteligente de escrow en RGB. El contrato especifica las condiciones de liberación — típicamente aprobación de hitos por parte del cliente. Paso 2: El freelancer completa el trabajo y lo envía para revisión. Paso 3: Cuando el cliente aprueba, el contrato inteligente libera el pago automáticamente a la billetera conectada del freelancer vía Red Lightning. Todo el flujo — desde la aprobación hasta que los fondos llegan a la billetera del freelancer — toma segundos. No hay horarios de procesamiento por lotes, no hay montos mínimos de retiro y no hay demoras de retiro. El contrato inteligente aplica los términos de forma transparente: ni BitTasker, ni el cliente, ni el freelancer pueden mover unilateralmente los fondos en escrow.'
		},
		{
			heading: '¿Qué monedas acepta BitTasker?',
			body: 'BitTasker acepta y paga en múltiples criptomonedas. Bitcoin (BTC) es el activo principal — los clientes fondan escrow en BTC y los freelancers reciben en BTC. La Red Lightning maneja transferencias instantáneas con bajas comisiones para todos los pagos. RGB Bitcoin (BTC) se usa para interacciones con contratos inteligentes en la sidechain de RGB. Los stablecoins (USDC) se aceptan para clientes que quieren escrow denominado en dólares — útil para predecibilidad de presupuesto. El enfoque multi-activo significa que un cliente en EE.UU. puede fondar escrow en USDC mientras un freelancer en El Salvador recibe el pago en BTC vía Lightning. El contrato inteligente maneja la lógica de conversión entre monedas soportadas.'
		},
		{
			heading: '¿Cómo protege el escrow de RGB mis ganancias?',
			body: 'Cada proyecto en BitTasker está protegido por contratos inteligentes de RGB. Cuando un cliente financia un proyecto, el pago va a un contrato inteligente en la blockchain de RGB — no a la cuenta bancaria de BitTasker. RGB se mina junto con Bitcoin, significando que estos contratos de escrow se benefician de la misma tasa de hash que asegura el propio Bitcoin. El contrato aplica los términos acordados: los fondos se retienen hasta que se aprueben los hitos, y las disputas siguen reglas transparentes de resolución. Ninguna entidad — incluyendo BitTasker — puede congelar, redirigir o manipular los fondos. Si BitTasker se desconectara, los contratos de escrow seguirían siendo funcionales y accesibles en la blockchain de RGB. Los clientes obtienen prueba de que sus fondos están seguros; los freelancers obtienen prueba de que el pago llegará cuando entreguen.'
		},
		{
			heading: '¿Cuál es la estructura de comisiones de BitTasker?',
			body: 'BitTasker cobra una tarifa de servicio del 5–10% dependiendo del tipo de proyecto y tu nivel de lealtad. Los niveles de lealtad reducen tu tarifa a medida que completas más proyectos en la plataforma. No hay cargos ocultos: la tarifa de servicio cubre gestión de escrow, interacciones con contratos inteligentes, pagos por Lightning y uso de la plataforma. Las tarifas de red de RGB para interacciones con contratos inteligentes son mínimas (menores a $0.01). Las tarifas de transacción de Lightning son igualmente insignificantes. Comparado con plataformas tradicionales que cobran 10–20% y deducen tarifas de retiro adicionales, la estructura transparente y escalonada de BitTasker significa que los freelancers conservan más de sus ganancias. El modelo de lealtad crea un ciclo de incentivos positivo.'
		},
		{
			heading: '¿Qué tan rápidos son los pagos de BitTasker?',
			body: 'BitTasker paga instantáneamente vía Red Lightning. Cuando un cliente aprueba tu trabajo completado, el pago se enruta a través de Lightning y llega a tu billetera conectada en segundos — sin importar tu país, banco o zona horaria. No hay monto mínimo de pago, no hay horario de procesamiento por lotes y no hay demoras de retiro. Para freelancers que dependen de pagos oportunos para gestionar el flujo de caja, esto es transformador. Un freelancer en Argentina puede completar trabajo a las 3 PM y tener Bitcoin gastable en su billetera a las 3:01 PM. La liquidación instantánea elimina la "ansiedad de pago" que plaga las relaciones freelance tradicionales, donde períodos de retención de 14 días y pagos retrasados son la norma.'
		},
		{
			heading: '¿Cómo conecto mi billetera a BitTasker?',
			body: 'BitTasker soporta conexiones de billeteras de autocustodia a través de Nostr Wallet Connect (NWC). Vinculas tu billetera Lightning — como Aqua, Blink, Phoenix o cualquier billetera compatible con NWC — a tu cuenta de BitTasker. Una vez conectada, los pagos se enrutan directamente a tu billetera sin que BitTasker retenga fondos. En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o un pago Lightning en la billetera que abre con una llave de acceso. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago. El modelo de autocustodia significa que siempre mantienes el control de tus claves privadas. BitTasker no puede acceder, congelar o mover tus fondos. Si quieres cambiar de billetera en cualquier momento, simplemente desconectas la anterior y conectas una nueva — tus ganancias y reputación permanecen intactas.'
		},
		{
			heading: 'BitTasker vs. pagos en plataformas tradicionales',
			body: 'Las plataformas tradicionales de freelancing (Upwork, Fiverr) operan sistemas de pago centralizados: retienen tus fondos en sus cuentas bancarias, procesan pagos semanal o mensualmente y cobran comisiones por retiros, conversión de moneda y pagos acelerados. BitTasker es fundamentalmente diferente. El escrow existe en cadena en contratos inteligentes, no en cuentas bancarias corporativas. Los pagos se enrutan vía Lightning, no a través de redes de transferencia bancaria. Las comisiones son transparentes y escalonadas, no capas con cargos ocultos. Y como los pagos son nativos de cripto, no hay márgenes de conversión de moneda — recibes exactamente lo que se acordó. El resultado: pagos más rápidos (segundos vs. 14 días), comisiones más bajas (5–10% vs. 10–20%) y ningún intermediario que pueda congelar tus ganancias.'
		}
	],
	faq: [
		{
			question: '¿Qué tan rápido recibo mi pago en BitTasker?',
			answer:
				'Instantáneamente vía Red Lightning. Cuando un cliente aprueba tu trabajo, el pago llega a tu billetera conectada en segundos. No hay períodos de espera, procesamiento por lotes ni demoras de transferencia bancaria.'
		},
		{
			question: '¿Cuáles son las comisiones de BitTasker?',
			answer:
				'BitTasker cobra 5–10% dependiendo del tipo de proyecto y nivel de lealtad. Esto cubre gestión de escrow, interacciones con contratos inteligentes, pagos por Lightning y uso de la plataforma. Sin tarifas de retiro, sin cargos ocultos, sin márgenes de conversión de moneda. Los niveles de lealtad reducen comisiones a medida que completas más proyectos.'
		},
		{
			question: '¿Puedo recibir pagos en stablecoins?',
			answer:
				'Sí. BitTasker soporta USDC para clientes que quieren escrow denominado en dólares. Los freelancers pueden recibir en BTC vía Lightning o elegir pagos en stablecoins. El contrato inteligente maneja la lógica de conversión entre monedas soportadas.'
		},
		{
			question: '¿Qué pasa si hay una disputa de pago?',
			answer:
				'Las disputas son manejadas por el contrato inteligente de escrow de RGB. Ambas partes presentan evidencia a través de la plataforma, y el contrato ejecuta la resolución basándose en reglas predefinidas. Ni BitTasker ni una sola parte controla el resultado — el código del contrato inteligente determina el resultado de forma transparente.'
		},
		{
			question: '¿Están seguros mis fondos de escrow?',
			answer:
				'Sí. Los fondos de escrow están bloqueados en un contrato inteligente de RGB minado junto con Bitcoin para seguridad. No son retenidos por BitTasker ni por ninguna empresa. El código del contrato es auditable en la blockchain, e incluso si BitTasker se desconecta, tus fondos permanecen accesibles a través de la red RGB.'
		},
		{
			question: '¿Qué billeteras funcionan con BitTasker?',
			answer:
				'Los pagos usan la billetera de BitTasker que abres con tu llave de acceso. Guarda Bitcoin y USDT en RGB, y puede pagar por Lightning. No conectas otra app de billetera.'
		},
		{
			question: '¿Puedo elegir en qué criptomoneda recibir?',
			answer:
				'Sí. BitTasker soporta BTC (vía Lightning) y stablecoins. Tú eliges tu moneda preferida al configurar tu billetera. Los clientes pueden fondar escrow en diferentes monedas, y el contrato inteligente maneja la lógica de liberación y conversión.'
		}
	],
	bitTaskerCta: {
		heading: 'Cobra en Bitcoin — Instantáneamente',
		body: 'BitTasker paga a freelancers instantáneamente vía Red Lightning. El escrow está protegido por contratos inteligentes asegurados por Bitcoin. Sin períodos de espera, sin comisiones ocultas, sin demoras bancarias.',
		buttonText: 'Regístrate Gratis',
		buttonHref: '/auth/signup'
	}
};
