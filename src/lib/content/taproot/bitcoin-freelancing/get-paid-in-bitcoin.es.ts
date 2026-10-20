import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Recibe Pagos en Bitcoin: Guía Completa para Freelancers',
		subtitle:
			'Aprende cómo los freelancers ganan $500–$1,500/mes en Bitcoin con pagos Lightning, configuración de billetera y consejos fiscales.'
	},
	answerBlock:
		'Los freelancers pueden recibir pagos en Bitcoin al instante a través de la Red Lightning por trabajo en plataformas como BitTasker, LaborX y otros mercados nativos de cripto. Para comenzar necesitas configurar una billetera compatible con Lightning (como Aqua, Blink o Wallet of Satoshi), completar trabajo freelance y recibir satoshis directamente en tu billetera. Puedes guardar Bitcoin como ahorro, convertir a tu moneda local a través de exchanges o gastarlo directamente en comercios que acepten BTC. Las ganancias típicas van de $500 a $1,500/mes para freelancers a tiempo parcial haciendo desarrollo, diseño, escritura o traducción.',
	sections: [
		{
			heading: '¿Cómo reciben los freelancers pagos en Bitcoin?',
			body: 'Las plataformas de freelancing en Bitcoin como BitTasker pagan a través de la Red Lightning — una solución de Capa 2 construida sobre Bitcoin que permite transacciones instantáneas y de bajo costo. Cuando completas un proyecto y el cliente aprueba la entrega, los satoshis se envían directamente a tu billetera Lightning. El proceso funciona como recibir cualquier pago digital: generas una factura (o proporcionas tu dirección Lightning), el cliente paga, y los fondos llegan en segundos. No hay intermediario bancario, sin demora de procesamiento de 3–5 días, y las tarifas de transacción son típicamente menos de un centavo.'
		},
		{
			heading: '¿Qué billetera Lightning deben usar los freelancers?',
			body: 'Para freelancers que reciben pagos regulares en Bitcoin, una billetera Lightning móvil es el punto de partida práctico. Aqua Wallet ofrece una interfaz limpia con soporte tanto para Lightning como Bitcoin en cadena, haciéndola ideal para freelancers latinoamericanos que también necesitan opciones denominadas en dólares. Blink Wallet es popular en El Salvador y Latinoamérica con fuerte soporte en español. Wallet of Satoshi es la opción más simple para principiantes — funciona como una billetera Lightning custodial sin complejidad de configuración. Para cantidades mayores o ahorro a largo plazo, mueve Bitcoin de tu billetera Lightning a una billetera de hardware como Coldcard o Trezor.'
		},
		{
			heading: '¿Cómo convierto Bitcoin a mi moneda local?',
			body: 'Varios servicios de acceso te permiten convertir Bitcoin a tu moneda local. En América Latina, plataformas como Relai (disponible en México y otros países de LATAM) y Strike te permiten vender Bitcoin y recibir pesos directamente en tu cuenta bancaria. En El Salvador, Chivo Wallet e IBEX Pay proporcionan conversión fluida de BTC a dólares. Para otras regiones, exchanges peer-to-peer como Bisq o Hodl Hodl te permiten vender Bitcoin por transferencias bancarias locales. Algunos freelancers mantienen una parte de sus ganancias en Bitcoin como ahorro y solo convierten lo que necesitan para gastos mensuales.'
		},
		{
			heading: '¿Cuáles son las implicaciones fiscales de ganar Bitcoin?',
			body: 'En la mayoría de jurisdicciones, recibir Bitcoin como pago por servicios se trata como ingreso ordinario, valorado al precio de mercado justo en el momento de la recepción. Si posteriormente vendes ese Bitcoin a un precio más alto, podrías adeudar impuesto sobre ganancias de capital sobre la diferencia. Las reglas fiscales varían significativamente por país — El Salvador ha convertido a Bitcoin en moneda de curso legal con disposiciones fiscales específicas, mientras que Estados Unidos, la UE y otros países tienen sus propios marcos. Este artículo proporciona información general, no asesoría fiscal. Consulta a un profesional fiscal calificado en tu jurisdicción para orientación específica a tu situación.'
		},
		{
			heading: '¿Cuánto pueden ganar los freelancers en Bitcoin?',
			body: 'Las ganancias varían ampliamente por habilidad, experiencia y horas trabajadas. Los freelancers a tiempo parcial típicamente ganan $500–$1,500/mes. Los freelancers a tiempo completo en campos de alta demanda como desarrollo de software pueden ganar $3,000–$8,000/mes o más. La economía nativa de Bitcoin paga tarifas competitivas porque los empleadores ahorran en tarifas bancarias tradicionales, transferencias internacionales y comisiones de plataforma. Desarrolladores y diseñadores con experiencia en Lightning u Nostr obtienen tarifas premium de $75–$150/hora en plataformas nativas de cripto.'
		},
		{
			heading: '¿Qué tipos de trabajo pagan en Bitcoin?',
			body: 'Las categorías de trabajo freelance más comunes que pagan en Bitcoin incluyen: desarrollo de software (web, móvil, contratos inteligentes), diseño UI/UX, redacción y copywriting, servicios de traducción, marketing digital, edición de video y asistencia virtual. BitTasker también ofrece tareas locales — servicios físicos como entrega, limpieza o trabajos de mantenimiento que pueden pagarse en Bitcoin. A medida que crece la adopción de Bitcoin, más categorías de servicios tradicionales están disponibles en plataformas nativas de cripto.'
		},
		{
			heading: 'Plataformas que pagan a freelancers en Bitcoin',
			body: 'El ecosistema de freelancing en Bitcoin incluye varias plataformas que sirven diferentes nichos. En BitTasker, quien contrata bloquea Bitcoin, USDT en RGB o un pago Lightning en la billetera que abre con una llave de acceso. Después de aprobar el trabajo, paga la factura. Los mensajes se abren cuando la garantía está formada y las reseñas solo después de ese pago. LaborX ofrece un mercado amplio para trabajos pagados en Bitcoin en desarrollo, diseño y trabajo creativo. CryptoJobsList agrega ofertas de trabajo remoto en cripto. AngelList aloja roles de startups que a veces pagan en Bitcoin. Bitwage te permite recibir cualquier salario en Bitcoin, incluso de empleadores tradicionales. Para la mejor combinación de tarifas bajas, pagos rápidos e identidad descentralizada, BitTasker está diseñado específicamente para el freelancing en Bitcoin.'
		}
	],
	faq: [
		{
			question: '¿Es seguro recibir Bitcoin como pago por trabajo freelance?',
			answer:
				'Sí, recibir Bitcoin a través de plataformas establecidas y billeteras Lightning es seguro. Usa billeteras de buena reputación, mantén tu frase semilla de recuperación segura, y comienza con cantidades más pequeñas hasta que te sientas cómodo con el proceso. Las transacciones de la Red Lightning son finales e irreversibles una vez confirmadas.'
		},
		{
			question: '¿Debo declarar las ganancias en Bitcoin en mis impuestos?',
			answer:
				'En la mayoría de países, sí. Bitcoin recibido como pago se trata típicamente como ingreso gravable a su valor de mercado cuando se recibió. Consulta a un profesional fiscal para tu jurisdicción específica. El Salvador tiene disposiciones especiales ya que Bitcoin es moneda de curso legal ahí.'
		},
		{
			question: '¿Qué pasa si el precio de Bitcoin baja después de que me pagan?',
			answer:
				'El precio de Bitcoin puede ser volátil. Para mitigar esto, puedes convertir a stablecoins (como USDT o USDC) o a tu moneda local inmediatamente después de recibir el pago. Algunos freelancers mantienen un porcentaje en Bitcoin como estrategia de ahorro a largo plazo mientras convierten el resto.'
		},
		{
			question: '¿Puedo recibir pagos en Bitcoin de un empleador tradicional?',
			answer:
				'Sí. Servicios como Bitwage te permiten recibir una porción o todo tu salario en Bitcoin, incluso si tu empleador paga en fiat. El servicio maneja la conversión y envía Bitcoin a tu billetera. Algunos empleadores en el espacio de Bitcoin también pagan directamente en BTC.'
		},
		{
			question: '¿Qué comisiones pago para recibir Bitcoin?',
			answer:
				'Las tarifas de la Red Lightning son extremadamente bajas — típicamente menos de 1 centavo por transacción. Las transacciones en cadena de Bitcoin cuestan más ($0.50–$5 dependiendo de la congestión de la red) pero rara vez se necesitan para pagos de freelancing. La tarifa de servicio de BitTasker (5–10%) es separada de las tarifas de red.'
		},
		{
			question: '¿Cómo configuro una billetera Lightning como principiante?',
			answer:
				'Descarga una aplicación de billetera Lightning (Blink, Aqua o Wallet of Satoshi son amigables para principiantes). Sigue la configuración dentro de la app — toma unos 10 minutos. Escribe tu frase semilla de recuperación en papel y guárdala de forma segura. Estás listo para recibir pagos Lightning inmediatamente después de la configuración.'
		}
	],
	bitTaskerCta: {
		heading: 'Empieza a ganar Bitcoin por tu trabajo freelance',
		body: 'BitTasker te conecta con clientes que pagan al instante a través de la Red Lightning. Tarifas más bajas que Upwork o Fiverr, pagos más rápidos, y posees tu identidad a través de Nostr.',
		buttonText: 'Regístrate Gratis',
		buttonHref: '/auth/signup'
	}
};
