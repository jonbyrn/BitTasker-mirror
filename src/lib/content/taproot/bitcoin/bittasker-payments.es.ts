import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Pagos en BitTasker: Cómo Cobran los Freelancers',
		subtitle:
			'Bitcoin, Lightning, BTC y stablecoins — pagos instantáneos con protección de escrow sin necesidad de confianza.'
	},
	answerBlock:
		'BitTasker acepta múltiples métodos de pago diseñados para la economía global de freelancing: Bitcoin para almacenamiento seguro de valor, Red Lightning para pagos instantáneos con bajas comisiones, RGB (BTC) para escrow con contratos inteligentes, y stablecoins para pagos denominados en dólares. Cuando un cliente aprueba el trabajo completado, los fondos se liberan de un contrato inteligente de escrow en RGB y se enrutan a la billetera del freelancer vía Lightning — llegando en segundos. No hay demoras de procesamiento por lotes, no hay períodos de espera, y no hay montos mínimos de retiro. La estructura de comisiones escalonada de BitTasker recompensa la lealtad con tarifas más bajas, y cada transacción está protegida por contratos inteligentes auditable en el modelo de seguridad de Bitcoin.',
	sections: [
		{
			heading: '¿Cómo funcionan los pagos en BitTasker?',
			body: 'El flujo de pagos de BitTasker está diseñado para transparencia y velocidad. Cuando un cliente publica una tarea, fondan un contrato inteligente de escrow en RGB con el monto acordado — en BTC, BTC, USDC u otro activo compatible. El contrato inteligente bloquea los fondos y especifica las condiciones de liberación: típicamente, aprobación de hitos por parte del cliente. Cuando el freelancer completa el trabajo y el cliente aprueba, el contrato inteligente libera el pago automáticamente. El freelancer recibe los fondos vía Red Lightning, llegando a su billetera en segundos. Si hay una disputa, el contrato inteligente sigue reglas predefinidas de resolución. En ningún momento BitTasker retiene o controla los fondos de escrow — existen en código auditable en la blockchain de RGB.'
		},
		{
			heading: 'Métodos de pago aceptados',
			body: 'BitTasker acepta y paga en múltiples criptomonedas. Bitcoin (BTC) es el activo principal — los clientes pueden fondar escrow en BTC, y los freelancers pueden recibir pagos en BTC. La Red Lightning maneja transferencias instantáneas con bajas comisiones para pagos. RGB Bitcoin (BTC) se usa para interacciones con contratos inteligentes en la sidechain de RGB. Los stablecoins (USDC, y potencialmente otros) se aceptan para clientes que quieren escrow denominado en dólares — útil para predecibilidad de presupuesto. El enfoque multi-activo significa que clientes y freelancers no están atrapados en una sola moneda. Un cliente en EE.UU. puede fondar escrow en USDC, mientras un freelancer en El Salvador recibe el pago en BTC vía Lightning — el contrato inteligente maneja la lógica de conversión.'
		},
		{
			heading: 'Protección de escrow vía contratos inteligentes de RGB',
			body: 'Cada proyecto en BitTasker está protegido por contratos inteligentes de RGB. Cuando un cliente financia un proyecto, el pago va a un contrato inteligente — no a la cuenta bancaria de BitTasker. El contrato aplica los términos acordados: el pago se retiene hasta que se aprueben los hitos, y las disputas siguen reglas transparentes de resolución. RGB se mina junto con Bitcoin, significando que estos contratos de escrow se benefician de la misma tasa de hash que asegura el propio Bitcoin. La ventaja clave sobre el escrow tradicional de plataformas: ninguna entidad puede congelar, redirigir o manipular los fondos. Incluso si BitTasker se desconectara, los contratos de escrow seguirían siendo funcionales y accesibles en la blockchain de RGB. Los clientes obtienen prueba de que sus fondos están seguros; los freelancers obtienen prueba de que el pago llegará cuando entreguen.'
		},
		{
			heading: 'Funciones de compra, venta e intercambio',
			body: 'BitTasker incluye funciones de exchange integradas para que los freelancers puedan convertir entre criptomonedas sin salir de la plataforma. ¿Necesitas convertir ganancias en BTC a USDC para una compra local? Usa la función de intercambio. ¿Quieres vender BTC por tu moneda local? El exchange integrado se conecta a proveedores de liquidez para tarifas competitivas. Esto elimina la fricción de mover fondos a exchanges externos, convertir y transferir de vuelta — un proceso que puede tomar horas y generar múltiples comisiones. Para freelancers en América Latina, donde el acceso a exchanges puede ser limitado, tener funcionalidad de intercambio integrada en la plataforma de pagos es particularmente valioso.'
		},
		{
			heading: 'Estructura de comisiones: escalonada y basada en lealtad',
			body: 'La estructura de comisiones de BitTasker está diseñada para recompensar el uso consistente de la plataforma. Las tarifas de servicio varían del 5-10% dependiendo del tipo de proyecto y tu nivel de lealtad — los freelancers que completan más proyectos en BitTasker desbloquean tarifas más bajas. No hay cargos ocultos: la tarifa de servicio cubre gestión de escrow, interacciones con contratos inteligentes, pagos por Lightning y uso de la plataforma. Las tarifas de red de RGB para interacciones con contratos inteligentes son mínimas (menores a $0.01). Las tarifas de transacción de Lightning son igualmente insignificantes. Comparado con plataformas tradicionales que cobran 10-20% y deducen tarifas de retiro adicionales, la estructura transparente y escalonada de BitTasker significa que los freelancers conservan más de sus ganancias. El modelo de lealtad crea un ciclo de incentivos positivo: más trabajas en BitTasker, menos pagas en comisiones.'
		},
		{
			heading: 'Velocidad de pago: instantáneo vía Lightning',
			body: 'Las plataformas tradicionales de freelancing pagan semanal o mensualmente, a menudo con demoras de 3-5 días para transferencias bancarias. BitTasker paga instantáneamente vía Red Lightning. Cuando un cliente aprueba el trabajo, el pago se enruta a través de Lightning y llega a la billetera del freelancer en segundos — sin importar su país, banco o zona horaria. No hay monto mínimo de retiro, no hay horario de procesamiento por lotes, y no hay demoras de retiro. Para freelancers que dependen de pagos oportunos para gestionar el flujo de caja, esto es transformador. Un freelancer en Argentina puede completar trabajo a las 3 PM y tener Bitcoin gastable en su billetera a las 3:01 PM, listo para pagar servicios localmente vía comerciantes Lightning. La liquidación instantánea elimina la "ansiedad de pago" que plaga las relaciones freelance tradicionales.'
		},
		{
			heading: 'Por qué los pagos de BitTasker difieren de las plataformas tradicionales',
			body: 'Las plataformas tradicionales de freelancing (Upwork, Fiverr, Freelancer.com) operan sistemas de pago centralizados: retienen tus fondos en sus cuentas bancarias, procesan pagos en horarios fijos, y cobran comisiones por retiros, conversión de moneda y pagos acelerados. El enfoque de BitTasker es fundamentalmente diferente. El escrow existe en cadena en contratos inteligentes, no en cuentas bancarias corporativas. Los pagos se enrutan vía Lightning, no a través de redes de transferencia bancaria. Las comisiones son transparentes y escalonadas, no capas con cargos ocultos. Y como los pagos son nativos de cripto, no hay márgenes de conversión de moneda — recibes exactamente lo que se acordó. El resultado es un sistema de pagos más rápido, más barato y más transparente que cualquier cosa que ofrezcan las plataformas tradicionales.'
		}
	],
	faq: [
		{
			question: '¿Qué tan rápido recibo mi pago en BitTasker?',
			answer:
				'Instantáneamente. Cuando un cliente aprueba tu trabajo completado, el pago se enruta a través de la Red Lightning y llega a tu billetera en segundos. No hay períodos de espera, procesamiento por lotes ni demoras de transferencia bancaria. Tus ganancias están disponibles inmediatamente.'
		},
		{
			question: '¿Cuáles son las comisiones de BitTasker?',
			answer:
				'BitTasker cobra una tarifa de servicio del 5-10% dependiendo del tipo de proyecto y tu nivel de lealtad. Esto cubre gestión de escrow, interacciones con contratos inteligentes, pagos por Lightning y uso de la plataforma. No hay tarifas de retiro, no hay cargos ocultos, y no hay márgenes de conversión de moneda. Los niveles de lealtad reducen tu tarifa a medida que completas más proyectos.'
		},
		{
			question: '¿Puedo recibir pagos en mi moneda local?',
			answer:
				'BitTasker paga en criptomonedas (BTC, Lightning o stablecoins). Puedes convertir a tu moneda local a través de funciones de intercambio integradas o exchanges externos. En regiones con adopción de comerciantes Lightning (como El Salvador), puedes gastar BTC directamente sin conversión.'
		},
		{
			question: '¿Qué pasa si hay una disputa de pago?',
			answer:
				'Las disputas son manejadas por el contrato inteligente de escrow de RGB. Ambas partes presentan evidencia a través de la plataforma, y el contrato ejecuta la resolución basándose en reglas predefinidas. Ni BitTasker ni una sola parte controla el resultado — el código del contrato inteligente determina el resultado de forma transparente.'
		},
		{
			question: '¿Están seguros mis fondos de escrow?',
			answer:
				'Sí. Los fondos de escrow están bloqueados en un contrato inteligente de RGB — minado junto con Bitcoin para seguridad. No son retenidos por BitTasker ni por ninguna empresa. El código del contrato es auditable en la blockchain, y puedes verificar las condiciones de escrow antes de acordirlas. Incluso si BitTasker se desconecta, tus fondos permanecen accesibles a través de la red RGB.'
		},
		{
			question: '¿Puedo elegir en qué criptomoneda recibir?',
			answer:
				'Sí. BitTasker soporta múltiples monedas de pago incluyendo BTC (vía Lightning) y stablecoins (como USDC). Tú eliges tu moneda preferida al configurar tu billetera. Los clientes pueden fondar escrow en diferentes monedas, y el contrato inteligente maneja la lógica de liberación y conversión.'
		}
	],
	bitTaskerCta: {
		heading: 'Empieza a ganar con pagos instantáneos en Bitcoin',
		body: 'BitTasker paga a freelancers instantáneamente vía Red Lightning. El escrow está protegido por contratos inteligentes asegurados por Bitcoin. Sin períodos de espera, sin comisiones ocultas, sin demoras bancarias.',
		buttonText: 'Únete a BitTasker Ahora',
		buttonHref: '/auth/signup'
	}
};
