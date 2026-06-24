import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker vs Upwork: Comparativa de Freelancing con Bitcoin',
		subtitle:
			'Compara BitTasker con Upwork en comisiones, velocidad de pago, identidad y libertad para freelancers.'
	},
	answerBlock:
		'BitTasker es una plataforma de freelancing nativa de Bitcoin que cobra comisiones escalonadas desde un 5% — comparado con la tarifa plana del 20% de Upwork. Los pagos se liquidan al instante a través de la Red Lightning en lugar del ciclo de pago Net-14 de Upwork. Los freelancers poseen su identidad a través de protocolos Nostr en lugar de confiar en una plataforma centralizada que puede congelar cuentas o retener fondos. Si quieres pagos más rápidos, costos más bajos y trabajo resistente a la censura, BitTasker es la mejor opción.',
	sections: [
		{
			heading: '¿Cómo se comparan las comisiones de BitTasker y Upwork?',
			body: 'Upwork cobra una tarifa de servicio fija del 20% en cada factura — la misma tasa ya ganes $500 o $50,000 al mes. BitTasker usa una estructura de tarifas escalonada que recompensa la lealtad: los nuevos usuarios comienzan alrededor del 10%, y los freelancers a largo plazo con buenas tasas de completado pueden bajar al 5% o menos. En un proyecto de $1,000, te quedas con $950 en BitTasker versus $800 en Upwork. Esa diferencia de $150 se acumula rápidamente durante meses de trabajo constante.'
		},
		{
			heading: '¿Cuál es la diferencia en velocidad de pago?',
			body: 'Upwork retiene los pagos completados durante un período obligatorio de 14 días de liquidación (Net-14) antes de que los fondos lleguen a tu banco — y luego tu banco agrega de 1 a 3 días hábiles más. Tiempo total de la entrega al dinero en tus manos: mínimo 15-17 días. BitTasker liquida los pagos al instante a través de la Red Lightning. En el momento en que un cliente confirma la entrega, los satoshis llegan a tu billetera. Sin períodos de retención, sin demoras bancarias, sin intermediarios tocando tu dinero.'
		},
		{
			heading: '¿Cómo se compara la identidad y seguridad de cuenta?',
			body: 'En Upwork, tu reputación, portafilio y relaciones con clientes están bloqueados en una cuenta centralizada. Upwork puede suspender o banear tu cuenta en cualquier momento — y pierdes todo: años de reseñas, historial de propuestas y conexiones con clientes. BitTasker usa identidad descentralizada basada en Nostr. Tu reputación es portable y resistente a la censura. Ninguna autoridad central puede borrar tu historial de trabajo o congelar tus ganancias. Tú posees tu identidad de la misma forma en que posees tu Bitcoin.'
		},
		{
			heading: '¿Qué pasa con el escrow y la protección de pagos?',
			body: 'Ambas plataformas ofrecen escrow para proteger a freelancers y clientes. El escrow de Upwork está completamente controlado por sus sistemas internos — las disputas pasan por su equipo de soporte, y los tiempos de resolución pueden extenderse durante semanas. BitTasker usa contratos inteligentes en Rootstock (una sidechain de Bitcoin) para el escrow. Los fondos se bloquean en contratos inteligentes auditables, y la resolución de disputas sigue reglas transparentes en cadena. No tienes que confiar en una empresa — confías en código.'
		},
		{
			heading: 'Tabla comparativa BitTasker vs Upwork',
			body: '| Característica | BitTasker | Upwork |\n| --- | --- | --- |\n| Tarifa de servicio | 5–10% (escalonada) | 20% fija |\n| Velocidad de pago | Instantáneo (Lightning) | Net-14 + transferencia bancaria |\n| Identidad | Nostr (descentralizada) | Cuenta centralizada |\n| Escrow | Contratos inteligentes Rootstock | Sistemas internos |\n| Portabilidad de cuenta | Total — posees tus datos | Bloqueada en la plataforma |\n| Pagos en cripto | BTC nativo + Lightning | No soportado |\n| Restricciones geográficas | Global, sin permisos | Restringido en algunos países |'
		},
		{
			heading: '¿Cuándo es Upwork la mejor opción?',
			body: 'Upwork todavía tiene ventajas en ciertos escenarios. Si necesitas acceso a su enorme base de clientes empresariales (empresas como Microsoft, Airbnb y Automattic publican trabajos ahí), el alcance de Upwork es inigualable. Si prefieres recibir pagos en fiat a una cuenta bancaria tradicional sin gestionar una billetera de Bitcoin, el proceso de Upwork es más simple. Si ya estás establecido en Upwork con un alto Job Success Score y un portafolio fuerte, los costos de cambio pueden superar los beneficios de las tarifas más bajas.'
		},
		{
			heading: '¿Cuándo es BitTasker la mejor opción?',
			body: 'BitTasker es ideal para freelancers que quieren quedarse con más de sus ganancias, cobrar instantáneamente y poseer su identidad profesional. Es perfecto para trabajadores remotos en América Latina, África y el Sudeste Asiático que enfrentan fricciones bancarias y altas comisiones de remesas. Está construido para desarrolladores, diseñadores, escritores y traductores cómodos con billeteras de Bitcoin. Y es la opción correcta para cualquiera que valore la resistencia a la censura — freelancers que han sido desplataformados o que trabajan en industrias donde las plataformas centralizadas imponen restricciones arbitrarias.'
		}
	],
	faq: [
		{
			question: '¿BitTasker realmente es más barato que Upwork?',
			answer:
				'Sí. Las comisiones escalonadas de BitTasker van del 5 al 10%, comparado con el 20% fijo de Upwork. En un proyecto de $2,000, ahorras entre $200 y $300 por trabajo. A lo largo de un año de freelancing constante, eso puede significar miles de dólares más en tu bolsillo.'
		},
		{
			question: '¿Cómo recibo pagos en Bitcoin de BitTasker?',
			answer:
				'BitTasker paga a través de la Red Lightning — la forma más rápida y barata de transacciones de Bitcoin. Necesitas una billetera compatible con Lightning (como Aqua, Blink o Wallet of Satoshi). Los pagos llegan al instante cuando el cliente confirma la entrega.'
		},
		{
			question: '¿Puedo usar BitTasker y Upwork al mismo tiempo?',
			answer:
				'Absolutamente. Muchos freelancers usan ambas plataformas simultáneamente. Comienza probando BitTasker con algunos proyectos para construir tu reputación ahí mientras mantienes tu flujo de ingresos de Upwork.'
		},
		{
			question: '¿Qué pasa si hay una disputa en BitTasker?',
			answer:
				'BitTasker usa contratos inteligentes de Rootstock para el escrow. Si surge una disputa, ambas partes presentan evidencia y la resolución sigue reglas transparentes en cadena. Los fondos nunca son retenidos por BitTasker — están bloqueados en el contrato inteligente hasta que ambas partes acuerden o se alcance una resolución.'
		},
		{
			question: '¿Mi reputación de Upwork se puede transferir a BitTasker?',
			answer:
				'No directamente — las reseñas de Upwork están aisladas en su plataforma. Sin embargo, puedes hacer referencia a tu portafilio de Upwork al configurar tu perfil de BitTasker. Con el tiempo, tu reputación basada en Nostr en BitTasker se convierte en tu credencial portable y resistente a la censura.'
		},
		{
			question: '¿Necesito saber de Bitcoin para usar BitTasker?',
			answer:
				'Necesitas familiaridad básica con billeteras de Bitcoin y la Red Lightning. Configurar una billetera toma unos 10 minutos, y recibir pagos Lightning es tan simple como compartir una factura. BitTasker ofrece guías para comenzar.'
		}
	],
	bitTaskerCta: {
		heading: 'Haz freelance de forma más inteligente con tarifas bajas y pagos instantáneos',
		body: 'BitTasker te ofrece lo que Upwork no puede: tarifas que disminuyen con la lealtad, pagos que llegan en segundos e una identidad que realmente posees. Únete a la comunidad creciente de freelancers que eligen el trabajo nativo en Bitcoin.',
		buttonText: 'Crea Tu Cuenta Gratis',
		buttonHref: '/auth/signup'
	}
};
