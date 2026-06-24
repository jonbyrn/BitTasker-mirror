import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker vs Fiverr: Comparativa de Plataformas de Freelancing',
		subtitle:
			'Fiverr te cobra el 20% y retiene tu dinero 14 días. BitTasker ofrece tarifas bajas y pagos instantáneos en Bitcoin.'
	},
	answerBlock:
		'BitTasker es una plataforma de freelancing nativa de Bitcoin con tarifas escalonadas desde un 5%, comparado con la comisión plana del 20% de Fiverr en cada transacción. Fiverr retiene las ganancias completadas durante 14 días antes de liberarlas, mientras BitTasker liquida al instante a través de la Red Lightning. Los freelancers en BitTasker poseen su identidad a través de protocolos Nostr, haciendo su reputación portable y resistente a la censura — a diferencia del sistema centralizado de cuentas de Fiverr. Para freelancers que quieren costos más bajos, pagos más rápidos y posesión real de su historial de trabajo, BitTasker supera a Fiverr en cada métrica que importa.',
	sections: [
		{
			heading: '¿Cómo se comparan las comisiones de BitTasker y Fiverr?',
			body: 'Fiverr toma el 20% de cada transacción — tanto de lo que paga el comprador como de las ganancias del vendedor. Un trabajo de $100 en Fiverr te deja $80 antes de siquiera contar las tarifas de procesamiento. El modelo escalonado de BitTasker comienza alrededor del 10% para nuevos usuarios y baja al 5% para freelancers establecidos con buenos antecedentes. En ese mismo proyecto de $100, te quedas con $90–$95 en BitTasker. A lo largo de docenas de proyectos, la diferencia se convierte en miles de dólares en ganancias retenidas.'
		},
		{
			heading: '¿Por qué Fiverr retiene las ganancias durante 14 días?',
			body: 'Fiverr implementa un período de liquidación de 14 días después de la finalización del pedido antes de que los fondos estén disponibles para retiro. Esta política existe para cubrir contracargos y disputas — pero penaliza a todos los vendedores por igual, incluso a aquellos con años de historial impecable. Los freelancers que trabajan proyecto a proyecto sienten esto agudamente: un proyecto completado el lunes no es accesible hasta dos lunes después. BitTasker elimina esto por completo. Los pagos a través de la Red Lightning llegan en el momento en que el cliente confirma la entrega, dándote acceso inmediato a tus ganancias.'
		},
		{
			heading: '¿Cómo difiere el modelo de gigs de Fiverr de BitTasker?',
			body: 'Fiverr está estructurado como un mercado de gigs — los vendedores crean listados predefinidos de servicios ("gigs") con precios fijos y niveles. Esto funciona bien para servicios estandarizados como diseño de logos o trabajos de doblaje, pero obliga a los freelancers a estructuras de precios rígidas. BitTasker soporta tanto listados estilo gig estructurados como propuestas de proyecto personalizadas. Los freelancers pueden fijar precios por hora, por hito o como contratos de precio fijo. Esta flexibilidad sirve mejor a proyectos complejos como desarrollo de software, consultoría o trabajos creativos multifase.'
		},
		{
			heading: '¿Qué pasa con la identidad y posesión de cuenta?',
			body: 'Fiverr es dueño de tu perfil, reseñas y reputación como vendedor. Si Fiverr suspende tu cuenta — lo cual sucede frecuentemente con vendedores que violan sus términos de servicio en evolución — pierdes todo instantáneamente. Años de reseneas de cinco estrellas, tu base de seguidores y tu nivel de estatus desaparecen. BitTasker usa identidad basada en Nostr, lo que significa que tu reputación está ligada a un par de claves criptográficas que tú controlas. Ninguna plataforma puede confiscar tu historial. Tu trayectoria viaja contigo, no con la plataforma.'
		},
		{
			heading: 'Tabla comparativa BitTasker vs Fiverr',
			body: '| Característica | BitTasker | Fiverr |\n| --- | --- | --- |\n| Tarifa de servicio | 5–10% (escalonada) | 20% fija |\n| Retención de pago | Ninguna — instantáneo | 14 días de liquidación |\n| Método de pago | Bitcoin Lightning | Transferencia bancaria / PayPal |\n| Identidad | Nostr (soberana) | Cuenta centralizada |\n| Modelo de precios | Flexible (hora, fijo, hito) | Niveles de gig rígidos |\n| Portabilidad de cuenta | Total — reputación portable | Bloqueada en la plataforma |\n| Resolución de disputas | Contratos inteligentes en cadena | Equipo de soporte de Fiverr |\n| Acceso global | Sin permisos | Países restringidos |'
		},
		{
			heading: '¿Cuándo es Fiverr la mejor opción?',
			body: 'Fiverr sobresale para freelancers que venden servicios estandarizados y repetibles — paquetes de logos, gráficos de redes sociales, ediciones de video cortas. Su modelo de gigs y algoritmo de búsqueda de compradores tienen tráfico masivo. Si eres principiante construyendo un portafolio y prefieres la simplicidad de pagos en fiat a una cuenta bancaria, la barrera de entrada más baja de Fiverr y su base de compradores establecida pueden ayudarte a conseguir tus primeros clientes rápidamente.'
		},
		{
			heading: '¿Cuándo es BitTasker la mejor opción?',
			body: 'BitTasker es la mejor opción para freelancers cansados de perder el 20% de cada sueldo en comisiones de plataforma. Está construido para trabajadores remotos en América Latina, África y el Sudeste Asiático donde el acceso bancario es limitado y las comisiones de remesas se comen las ganancias. Es ideal para desarrolladores, consultores y profesionales creativos que necesitan estructuras de proyecto flexibles. Y es la plataforma para cualquiera que valore la posesión real — freelancers que han sido afectados por suspensiones de plataformas centralizadas o que quieren una reputación portable y resistente a la censura.'
		}
	],
	faq: [
		{
			question: '¿BitTasker realmente es más barato que Fiverr?',
			answer:
				'Sí. Las comisiones de BitTasker van del 5 al 10% comparado con el 20% fijo de Fiverr. En un proyecto de $500, ahorras entre $50 y $75 por trabajo. Para freelancers con trabajo constante, los ahorros anuales son sustanciales.'
		},
		{
			question: '¿Puedo listar servicios en BitTasker como gigs de Fiverr?',
			answer:
				'BitTasker soporta tanto listados de servicios estilo gig estructurados como propuestas de proyecto personalizadas. Puedes crear paquetes de precio fijo similares a los gigs de Fiverr, o establecer tarifas por hora y contratos basados en hitos para trabajo más complejo.'
		},
		{
			question: '¿Qué tan rápido recibo el pago en BitTasker?',
			answer:
				'Instantáneamente. BitTasker usa la Red Lightning para pagos. En el momento en que un cliente marca tu trabajo como entregado y aprobado, los satoshis llegan a tu billetera. Sin período de espera de 14 días, sin demoras de procesamiento bancario.'
		},
		{
			question: '¿Qué pasa si Fiverr suspende mi cuenta — puedo mudarme a BitTasker?',
			answer:
				'Sí. Aunque tus reseñas de Fiverr no se pueden transferir directamente, puedes hacer referencia a tu portafolio de Fiverr al crear tu perfil de BitTasker. Tu nueva reputación basada en Nostr crecerá desde tu primer proyecto completado, y esta vez, ninguna plataforma puede quitártela.'
		},
		{
			question: '¿BitTasker cubre las mismas categorías de servicio que Fiverr?',
			answer:
				'BitTasker cubre las principales categorías de freelancing: desarrollo, diseño, escritura, traducción, marketing y consultoría. Aunque Fiverr tiene más categorías de micro-gigs de nicho, BitTasker se enfoca en servicios profesionales de calidad donde las tarifas bajas y los pagos más rápidos tienen mayor impacto.'
		},
		{
			question: '¿Necesito una billetera de Bitcoin para usar BitTasker?',
			answer:
				'Sí. Necesitas una billetera de Bitcoin compatible con Lightning para recibir pagos. Opciones populares incluyen Aqua Wallet, Blink Wallet y Wallet of Satoshi. La configuración toma unos 10 minutos, y BitTasker ofrece guías paso a paso.'
		}
	],
	bitTaskerCta: {
		heading: 'Deja de dar el 20% de tus ganancias en comisiones de plataforma',
		body: 'Las tarifas escalonadas de BitTasker y los pagos instantáneos por Lightning te permiten quedarte con más de lo que ganas. Únete a los freelancers que han migrado de Fiverr a una plataforma construida para la economía Bitcoin.',
		buttonText: 'Empieza a Freelancear en BitTasker',
		buttonHref: '/auth/signup'
	}
};
