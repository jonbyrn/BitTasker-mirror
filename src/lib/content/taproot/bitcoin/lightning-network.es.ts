import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Red Lightning: La Capa de Pagos de Bitcoin',
		subtitle:
			'Cómo la Capa 2 de Bitcoin habilita pagos instantáneos con comisiones casi nulas para freelancers y uso cotidiano.'
	},
	answerBlock:
		'La Red Lightning Network es un protocolo de pago de Capa 2 construido sobre Bitcoin que permite transacciones instantáneas con comisiones casi nulas. En lugar de liquidar cada pago en la cadena principal de Bitcoin — que toma más de 10 minutos y cuesta comisiones variables — Lightning crea canales de pago fuera de la cadena entre los participantes. Los pagos se enrutan a través de una red de estos canales, llegando en milisegundos por fracciones de centavo. Para freelancers, esto significa que puedes recibir el pago en el momento en que se aprueba el trabajo, sin esperar confirmaciones de la blockchain ni pagar comisiones que se comen las transacciones pequeñas. Lightning ha demostrado su viabilidad a escala nacional en El Salvador y ahora es el estándar para micropagos en Bitcoin en todo el mundo.',
	sections: [
		{
			heading: '¿Qué es la Red Lightning?',
			body: 'La Red Lightning Network es un protocolo de pago descentralizado que opera como una segunda capa sobre la blockchain principal de Bitcoin. Creada por Joseph Poon y Thaddeus Dryja en 2015 y lanzada en 2018, resuelve las limitaciones de escalabilidad de Bitcoin al permitir que dos partes abran un canal de pago, realicen transacciones entre sí un número ilimitado de veces de forma instantánea y con costo mínimo, y luego liquiden el saldo final en la cadena principal de Bitcoin. Piensa en ello como abrir una pestaña en un bar: abres un canal (abres una pestaña), haces todas las transacciones que quieras (pides bebidas), y solo liquidas al final (cierras la pestaña y pagas el monto final). La idea clave es que la mayoría de las transacciones no necesitan registrarse individualmente en la blockchain — solo importan los saldos de apertura y cierre.'
		},
		{
			heading: '¿Cómo habilita Lightning los pagos instantáneos?',
			body: 'Las transacciones tradicionales de Bitcoin requieren confirmación de bloque — los mineros deben incluir tu transacción en un bloque, lo cual ocurre aproximadamente cada 10 minutos. Para transacciones de alto valor, esperar 3-6 confirmaciones (30-60 minutos) es la práctica estándar. Lightning evita esto por completo. Cuando dos partes tienen un canal de pago abierto, pueden intercambiar transacciones firmadas entre sí sin transmitir nada a la blockchain. Estas transacciones fuera de la cadena son instantáneas porque simplemente son intercambios de compromisos criptográficos entre dos billeteras — sin mineros, sin espera, sin competencia por espacio en bloques. Cuando el canal se cierra, solo se liquida el saldo neto en la cadena. Esta arquitectura permite finalidad de pago en menos de un segundo con comisiones típicamente menores a $0.01, sin importar el monto de la transacción.'
		},
		{
			heading: '¿Cómo funcionan los canales y el enrutamiento de Lightning?',
			body: 'Un canal Lightning es una dirección multisig de dos de dos de Bitcoin financiada por dos partes. Una vez abierto, cualquiera de las partes puede actualizar la distribución del saldo del canal intercambiando transacciones firmadas. La innovación crítica es el enrutamiento: si Alice tiene un canal con Bob, y Bob tiene un canal con Charlie, Alice puede pagar a Charlie a través de Bob sin que Alice y Charlie tengan un canal directo. Bob actúa como nodo de enrutamiento, reenviando el pago y ganando una pequeña comisión por el servicio. Esto crea un efecto de red — a medida que se abren más canales, las rutas de pago se multiplican. Los nodos de enrutamiento se seleccionan según su capacidad (cuánto Bitcoin tienen en canales) y su fiabilidad. La red actualmente tiene miles de nodos de enrutamiento con capacidad combinada en los cientos de millones de dólares.'
		},
		{
			heading: '¿Qué son las billeteras Lightning y cuál deberías usar?',
			body: 'Las billeteras Lightning vienen en varias formas. Las billeteras móviles no custodias como Wallet of Satoshi, Phoenix y Blink te dan control total de tus llaves mientras gestionan los canales automáticamente. Las billeteras custodias como Strike o la billetera integrada de BitTasker ofrecen conveniencia a cambio de confiar tus fondos a un tercero. Las billeteras de hardware como Coldcard y Foundation Passport pueden conectarse a Lightning a través de aplicaciones complementarias para máxima seguridad. Para freelancers que reciben pagos, las billeteras no custodias como Phoenix o Blink ofrecen el mejor equilibrio entre seguridad y usabilidad — eres dueño de tus fondos, los canales se gestionan automáticamente, y los pagos llegan instantáneamente. La elección entre billeteras depende de tu nivel de comodidad técnico y cuánto priorizas la autocustodia versus la conveniencia.'
		},
		{
			heading: 'El Salvador y la adopción de Lightning',
			body: 'El Salvador se convirtió en el primer país en adoptar Bitcoin como moneda de curso legal en septiembre de 2021, con la Red Lightning Network como su infraestructura principal de pagos. Bitcoin Beach, una iniciativa de base popular en la ciudad costera de El Zonte, fue pionera en pagos con Lightning en una comunidad real antes del lanzamiento nacional. La billetera Chivo del gobierno procesó millones en transacciones Lightning en su primer año. Aunque Chivo fue eventualmente descontinuado, el ecosistema Lightning en El Salvador continuó creciendo a través de la adopción comercial y el turismo. Hoy, miles de negocios en todo El Salvador aceptan pagos Lightning, desde vendedores callejeros hasta grandes comercios. Esta prueba práctica a nivel real demostró que Lightning puede manejar comercio a escala nacional — procesando miles de transacciones por segundo a un costo insignificante.'
		},
		{
			heading: 'Limitaciones y riesgos de la Red Lightning',
			body: 'Lightning no está exento de desafíos. La capacidad del canal limita cuánto puedes recibir en un solo pago — si un canal tiene capacidad de 0.01 BTC, no puedes recibir más que eso sin capacidad entrante adicional. La gestión de liquidez requiere cierto entendimiento de cómo funcionan los canales, aunque las billeteras modernas automatizan gran parte de esto. Los fallos de enrutamiento pueden ocurrir cuando las rutas entre emisor y receptor son insuficientes, aunque la red ha mejorado significativamente en fiabilidad. También existe el riesgo de tener que monitorear tus canales en cadena para evitar que una contraparte transmita un estado antiguo (intento de fraude). La mayoría de las billeteras modernas manejan esta vigilancia automáticamente. Finalmente, Lightning está diseñado para pagos más pequeños y frecuentes — para transacciones muy grandes, la liquidación en cadena sigue siendo más práctica.'
		},
		{
			heading: 'Cómo BitTasker usa Lightning para pagos instantáneos de tareas',
			body: 'BitTasker integra la Red Lightning Network como método de pago predeterminado para pagos de tareas freelance. Cuando un cliente aprueba el trabajo completado, el pago se enruta a través de Lightning y llega a la billetera del freelancer en segundos — no horas ni días. No hay montos mínimos de retiro, no hay períodos de espera, ni procesamiento por lotes. Esto significa que un freelancer en América Latina puede completar una tarea a las 2 PM y tener Bitcoin gastable en su billetera a las 2:01 PM, listo para pagar bienes y servicios localmente. Lightning también elimina las comisiones altas que hacen que los micropagos sean impracticables en rieles de pago tradicionales, haciendo económicamente viable pagar por tareas pequeñas sin que las comisiones consuman un porcentaje significativo del pago.'
		}
	],
	faq: [
		{
			question: '¿Es segura la Red Lightning para recibir pagos?',
			answer:
				'Sí. Los pagos Lightning están asegurados por las garantías criptográficas de Bitcoin. Cuando recibes un pago, obtienes una transacción firmada que puedes transmitir en cadena para reclamar tus fondos. Las billeteras modernas manejan la seguridad automáticamente, incluyendo la vigilancia de intentos de cierre fraudulento de canales. El riesgo principal es operativo — perder acceso a tu billetera podría bloquear fondos en canales — por lo que las copias de seguridad regulares son esenciales.'
		},
		{
			question: '¿Cuánto cuestan las comisiones de la Red Lightning?',
			answer:
				'Las comisiones de Lightning son típicamente menores a $0.01 por transacción, sin importar el monto del pago. La comisión se divide entre los nodos de enrutamiento que reenvían tu pago. Algunos proveedores de servicios Lightning cobran pequeñas comisiones por gestión de canales o liquidez, pero estas suelen ser mínimas. Para freelancers, esto significa conservar casi el 100% de tus ganancias comparado con las comisiones del 5-20% que cobran las plataformas tradicionales.'
		},
		{
			question: '¿Puedo recibir pagos grandes en Lightning?',
			answer:
				'Lightning puede manejar pagos de cualquier tamaño, pero la capacidad de tu canal determina cuánto puedes recibir a la vez. Si necesitas recibir un pago mayor a la capacidad de tu canal, puede que necesites abrir canales adicionales o esperar a que canales existentes tengan capacidad disponible. Para la mayoría del trabajo freelance, las capacidades típicas de canal (0.001-0.1 BTC) son más que suficientes.'
		},
		{
			question: '¿Necesito estar en línea para recibir pagos Lightning?',
			answer:
				'No necesariamente. Las billeteras Lightning modernas usan watchtowers — servicios de terceros que monitorean tus canales en cadena y pueden actuar en tu nombre si una contraparte intenta engañarte. Muchas billeteras incluyen soporte integrado de watchtowers. Sin embargo, estar desconectado por períodos extendidos (semanas o meses) no es recomendable, ya que podrías perder oportunidades de gestión de canales.'
		},
		{
			question: '¿Cómo difiere Lightning de una transacción regular de Bitcoin?',
			answer:
				'Las transacciones regulares de Bitcoin se liquidan en cadena, tomando más de 10 minutos para confirmación y costando comisiones según la congestión de la red. Las transacciones Lightning ocurren fuera de la cadena, liquidándose instantáneamente a costo casi nulo. Lightning es ideal para pagos frecuentes y más pequeños; en cadena es mejor para liquidaciones grandes e infrecuentes. Ambas usan Bitcoin — Lightning simplemente es una capa más rápida y barata encima.'
		},
		{
			question: '¿Puedo convertir pagos Lightning a mi moneda local?',
			answer:
				'Sí. Puedes usar exchanges, plataformas peer-to-peer o servicios habilitados con Lightning para convertir BTC a tu moneda local. En El Salvador, muchos comerciantes aceptan BTC con Lightning directamente, reduciendo la necesidad de conversión. Servicios como Strike permiten conversión instantánea a USD en países compatibles.'
		}
	],
	bitTaskerCta: {
		heading: 'Recibe pagos instantáneos con Lightning en BitTasker',
		body: 'BitTasker enruta todos los pagos freelance a través de la Red Lightning, para que tus ganancias lleguen en segundos con comisiones mínimas. Sin períodos de espera, sin procesamiento por lotes — solo Bitcoin instantáneo en tu billetera.',
		buttonText: 'Empieza a Ganar en BitTasker',
		buttonHref: '/auth/signup'
	}
};
