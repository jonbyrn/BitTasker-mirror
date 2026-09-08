import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Economía Par a Par: Trabajo Directo Sin Intermediarios',
		subtitle:
			'Cómo Bitcoin y las plataformas descentralizadas están eliminando intermediarios de la contratación, pagos y escrow.'
	},
	answerBlock:
		'La economía par a par (P2P) es un sistema donde los individuos transaccionan directamente entre sí — sin bancos, procesadores de pagos o intermediarios de plataforma extrayendo comisiones y controlando acceso. Bitcoin es dinero P2P: los pagos van directamente de la billetera del cliente a la billetera del freelancer a través de la Red Lightning en segundos. Plataformas como BitTasker agregan infraestructura P2P para emparejamiento de trabajo y escrow de contratos inteligentes en RGB, mientras mantienen la transacción central entre pares. El resultado: los freelancers conservan más de sus ganancias (5–10% vs. 20%), cobran instantáneamente y llegan a clientes globalmente sin permiso de ningún intermediario.',
	sections: [
		{
			heading: '¿Qué es la economía par a par?',
			body: 'La economía par a par es actividad económica entre individuos sin intermediarios centralizados. En modelos tradicionales, un banco procesa tu pago, una plataforma te empareja con un cliente y toma una comisión, y un procesador de pagos maneja la liquidación. Cada intermediario agrega comisiones, demoras y puntos de control. En un modelo P2P, el freelancer y el cliente se conectan directamente, acuerdan términos y transaccionan usando Bitcoin. Sin demoras bancarias, sin plataforma sosteniendo tu dinero, sin procesador de pagos tomando un 3%. La economía P2P no es nueva — Craigslist, mercados locales y transacciones en efectivo siempre han sido entre pares. Bitcoin formaliza esto a escala global con garantías criptográficas.'
		},
		{
			heading: '¿Cómo habilita Bitcoin el trabajo entre pares?',
			body: 'Bitcoin fue diseñado como efectivo electrónico entre pares. La Red Lightning extiende esto a microtransacciones instantáneas y de bajas comisiones ideales para freelancing. Un cliente en Berlín paga a un desarrollador en Buenos Aires directamente — los satoshis llegan a la billetera Lightning del freelancer en segundos. Ningún banco procesa la transferencia. Ninguna pasarela de pago sostiene los fondos. Ninguna plataforma retrasa el pago por 14 días. La transacción es entre dos billeteras, verificada por la red Bitcoin. Esto es lo que Satoshi Nakamoto describió en el whitepaper de 2008: efectivo electrónico sin terceros de confianza.'
		},
		{
			heading: '¿Qué son los mercados P2P y cómo funcionan?',
			body: 'Los mercados P2P son plataformas que facilitan transacciones directas entre usuarios sin controlar la capa de fondos o identidad. BitTasker es un mercado freelance P2P: ayuda a freelancers y clientes a encontrarse, proporciona escrow de contratos inteligentes en RGB y soporta seguimiento de entregas y resolución de disputas. Pero no sostiene tu dinero (los pagos son Lightning), no posee tu identidad (está basada en Nostr) y no bloquea tu reputación en sus servidores. Comparado con Upwork, que sostiene fondos en su sistema interno, posee tu cuenta y puede deshabilitar tu perfil en cualquier momento. Un mercado P2P es un facilitador, no un guardián.'
		},
		{
			heading: '¿Cuáles son los beneficios del freelancing P2P?',
			body: 'Comisiones más bajas: las plataformas P2P cobran 5–10% versus 20% en plataformas tradicionales. Liquidación más rápida: los pagos Lightning llegan en segundos, no en 14+ días. Alcance global: cualquier persona con conexión a internet y una billetera Lightning puede participar, sin importar la infraestructura bancaria. Sin riesgo de desplataforme: la identidad Nostr y los pagos Bitcoin son controlados por ti, no por una empresa. Soberanía de moneda: recibes Bitcoin y decides cuándo y cómo convertir, evitando tipos de cambio desfavorables impuestos por plataformas. Para freelancers en El Salvador, Argentina, Nigeria o Filipinas, estos beneficios se traducen directamente en ganancias efectivas más altas.'
		},
		{
			heading: '¿Qué otras plataformas P2P existen además de BitTasker?',
			body: 'La economía P2P se extiende más allá del freelancing. Bisq es un exchange de Bitcoin P2P sin autoridad central. HodlHodl es una plataforma de préstamos de Bitcoin entre pares. HodlHodl y Peach Bitcoin habilitan compras de Bitcoin entre pares. Nostr misma es una red de comunicación P2P. En el espacio de gigs, BitTasker está entre los primeros en combinar identidad Nostr, pagos Lightning en Bitcoin y escrow de contratos inteligentes en una experiencia completa de freelancing. A medida que el ecosistema P2P madure, esperamos interoperabilidad: tu identidad Nostr de BitTasker funciona en aplicaciones sociales, otros mercados y futuros servicios P2P.'
		},
		{
			heading: '¿Cómo habilita BitTasker la economía P2P para el trabajo?',
			body: 'BitTasker elimina los intermediarios que imponen las plataformas tradicionales. La identidad es tuya (Nostr). Los pagos son directos (Lightning). El escrow es sin confianza (contratos inteligentes de RGB). La plataforma proporciona las herramientas — publicaciones de trabajo, búsqueda, flujos de entrega, resolución de disputas — pero no se interpone entre tú y tu dinero. Cuando un cliente paga a un freelancer en BitTasker, el Bitcoin se mueve de una billetera a otra. Sin saldo de cuenta de plataforma. Sin solicitud de retención. Sin espera de 14 días. Esto es la economía P2P aplicada al trabajo profesional: directo, rápido y controlado por los participantes, no por la plataforma.'
		},
		{
			heading: '¿Cuáles son los desafíos de la economía P2P?',
			body: 'La economía P2P enfrenta desafíos reales. Fricción de UX: configurar billeteras, gestionar claves y entender Bitcoin es más difícil que hacer clic en "Registrarse con Google." Descubrimiento: sin una plataforma centralizada controlando el mercado, conectar con clientes requiere más esfuerzo (aunque BitTasker maneja esto). Incertidumbre regulatoria: algunos gobiernos todavía están determinando cómo se gravan y regulan las transacciones P2P en cripto. Volatilidad: las fluctuaciones del precio de Bitcoin afectan el valor fiat de las ganancias, aunque los micropagos Lightning y los puentes de stablecoins reducen este impacto. Estos desafíos son reales pero disminuyen a medida que las herramientas maduran y la adopción de usuarios crece.'
		}
	],
	faq: [
		{
			question: '¿Qué significa par a par para freelancers?',
			answer:
				'Par a par significa que transaccionas directamente con tu cliente sin una plataforma sosteniendo tu dinero o controlando tu identidad. En BitTasker, el Bitcoin del cliente va directamente a tu billetera Lightning. Ningún intermediario retrasa el pago o toma una comisión adicional más allá de la tarifa de la plataforma.'
		},
		{
			question: '¿Cómo es diferente un mercado P2P de Upwork o Fiverr?',
			answer:
				'Upwork y Fiverr son plataformas centralizadas que controlan tu cuenta, sostienen tus ganancias y establecen las reglas. Un mercado P2P como BitTasker facilita la conexión pero usa infraestructura descentralizada — Nostr para identidad, Bitcoin Lightning para pagos y contratos inteligentes para escrow. La plataforma no sostiene tus fondos ni posee tu reputación.'
		},
		{
			question: '¿Las plataformas P2P tienen soporte al cliente?',
			answer:
				'BitTasker proporciona resolución de disputas y flujos de soporte mientras mantiene la infraestructura subyacente descentralizada. Tienes acceso a ayuda cuando la necesitas, pero tus fondos e identidad no dependen de la disponibilidad del equipo de soporte. Este es el equilibrio: usabilidad sin custodia.'
		},
		{
			question: '¿Es segura la economía P2P?',
			answer:
				'La seguridad en la economía P2P viene de garantías criptográficas en lugar de confianza corporativa. Los pagos Bitcoin son irreversibles y verificables en cadena. La identidad Nostr está firmada con tu clave privada. Los contratos de escrow de RGB son auditables. El riesgo se traslada de "confiar en una empresa" a "asegurar tus propias claves" — un tipo diferente de responsabilidad, pero una que te da más control.'
		},
		{
			question: '¿Puedo ganar en moneda fiat en una plataforma P2P?',
			answer:
				'BitTasker paga en Bitcoin vía Lightning. Puedes convertir a fiat al instante usando exchanges o servicios de pago. Muchos freelancers en América Latina prefieren recibir Bitcoin porque evita las transferencias bancarias costosas y los tipos de cambio desfavorables. La elección de cuándo y cómo convertir es tuya — no de una plataforma.'
		},
		{
			question: '¿Cómo empiezo con la economía P2P como freelancer?',
			answer:
				'Configura una billetera Lightning (Aqua, Blink o Wallet of Satoshi), crea una cuenta en BitTasker con una identidad Nostr y empieza a navegar o publicar trabajos. La barrera técnica es más baja de lo que parece — si puedes usar Venmo, puedes aprender pagos Lightning en unos 10 minutos.'
		}
	],
	bitTaskerCta: {
		heading: 'Elimina intermediarios. Conserva tus ganancias.',
		body: 'BitTasker es la plataforma de freelancing par a par donde transaccionas directamente con clientes usando Bitcoin Lightning. Sin custodia de plataforma, sin pagos retrasados, sin guardianes.',
		buttonText: 'Únete a BitTasker',
		buttonHref: '/auth/signup'
	}
};
