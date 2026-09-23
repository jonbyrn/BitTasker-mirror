import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Mercado Nostr: Comercio Descentralizado para Freelancers',
		subtitle:
			'Cómo el protocolo Nostr habilita mercados resistentes a la censura con identidad y reputación portables.'
	},
	answerBlock:
		'Un mercado Nostr es una plataforma de freelancing construida sobre el protocolo Nostr — un estándar abierto y descentralizado para identidad y comunicación. En lugar de registrar cuentas en el servidor de una empresa, los freelancers usan pares de claves criptográficas como identidad. Las publicaciones, reseñas y datos de reputación son eventos Nostr firmados con tu clave privada y transmitidos a través de relays distribuidos. Ninguna empresa controla el mercado, puede prohibir tu cuenta o borrar tu reputación. BitTasker usa Nostr como capa de identidad, dando a los freelancers una presencia profesional portable y resistente a la censura que funciona en cualquier plataforma compatible.',
	sections: [
		{
			heading: '¿Qué es Nostr y cómo funciona?',
			body: 'Nostr (Notes and Other Stuff Transmitted by Relays) es un protocolo minimalista y abierto para comunicación resistente a la censura. Cada usuario tiene una clave pública (su identidad) y una clave privada (su credencial). Los mensajes son eventos firmados transmitidos a múltiples relays — servidores independientes que almacenan y reenvían datos. Ningún relay es autoridad; si uno cae, otros todavía tienen tus datos. No hay servidor central para hackear, no hay empresa que aplique políticas de contenido, y no hay cuenta que deshabilitar. Esto hace a Nostr fundamentalmente diferente de Twitter, LinkedIn o cualquier red social o profesional centralizada.'
		},
		{
			heading: '¿Cómo habilita Nostr un mercado de freelancing?',
			body: 'Nostr habilita mercados a través de tipos de eventos específicos (NIPs — Nostr Implementation Possibilities). El perfil de un freelancer es un evento Nostr firmado que contiene sus habilidades, portafolio y tarifas. Las publicaciones de trabajo se publican como eventos Nostr que cualquier relay puede alojar. Las propuestas, contratos y reseñas también son eventos firmados. Debido a que cada interacción está firmada criptográficamente, la reputación no puede ser falsificada o forjada. El mercado se vuelve una capa de eventos interoperables — cualquiera puede construir un cliente (aplicación) que lea estos eventos, lo que significa que tu perfil de freelancing funciona en múltiples plataformas simultáneamente.'
		},
		{
			heading: '¿Qué es la identidad basada en Nostr para freelancers?',
			body: 'Tu identidad Nostr es un par de claves pública-privada. Tu clave pública es tu nombre de usuario universal — en BitTasker, en cualquier cliente social Nostr y en cualquier futuro mercado compatible con Nostr. Tu clave privada firma cada acción: solicitudes de trabajo, confirmaciones de entrega y reseñas. Esto significa que tu reputación no está almacenada en la base de datos de una empresa — está distribuida en relays y es verificable por cualquiera. Si BitTasker cerrara, tu identidad Nostr y todos los datos de reputación firmados sobrevivirían y podrían importarse en cualquier plataforma compatible. Esta es la ventaja fundamental sobre los perfiles centralizados de freelancing.'
		},
		{
			heading: '¿Cómo funcionan las reseñas y reputación en Nostr?',
			body: 'Las reseñas en Nostr son eventos firmados con una estructura de etiquetas específica. Después de completar un trabajo, el cliente publica un evento de reseña firmado con su clave privada. Esta reseña está vinculada a la clave pública del freelancer y al evento específico del trabajo. Debido a que está firmada criptográficamente, la reseña no puede ser alterada o forjada después de su publicación. También es permanente — ningún moderador de plataforma puede eliminar una reseña legítima. Con el tiempo, un freelancer acumula un historial verificable de reseñas firmadas que cualquier plataforma puede mostrar. Esto crea un sistema de reputación más confiable que las plataformas de reseñas centralizadas, donde las reseñas pueden ser eliminadas o manipuladas selectivamente.'
		},
		{
			heading: '¿Cómo usa BitTasker Nostr?',
			body: 'BitTasker usa Nostr como capa de identidad y reputación. Cuando creas una cuenta en BitTasker, generas un par de claves Nostr (o importas uno existente). Tu perfil, historial de trabajo, reseñas y portafolio son todos eventos Nostr. Los pagos corren sobre Bitcoin Lightning (separado de Nostr, pero complementario). El escrow usa contratos inteligentes de RGB. BitTasker proporciona la experiencia de usuario — búsqueda, emparejamiento, seguimiento de entregas, resolución de disputas — mientras Nostr asegura que tu identidad y reputación sean portables y resistentes a la censura. La plataforma maneja la UX; Nostr maneja la soberanía.'
		},
		{
			heading: '¿Cuál es el futuro del comercio Nostr?',
			body: 'El comercio Nostr se está expandiendo más allá de las redes sociales hacia actividad económica real. Mercados de servicios freelance (BitTasker), bienes digitales, préstamos entre pares y comercio local están todos emergiendo en Nostr. La simplicidad y naturaleza abierta del protocolo significan que los desarrolladores pueden construir clientes especializados sin permiso. A medida que más usuarios adoptan identidades Nostr para interacción social, el costo marginal de usar la misma identidad para comercio cae a cero. La visión a largo plazo es una identidad profesional unificada — una clave Nostr que funciona para redes sociales, freelancing, pagos y reputación — todo sin pedir permiso a ninguna empresa.'
		}
	],
	faq: [
		{
			question: '¿Nostr es lo mismo que Bitcoin?',
			answer:
				'No. Nostr es un protocolo abierto de comunicación para identidad y mensajes; Bitcoin es una red monetaria para pagos. Se complementan: Nostr maneja tu identidad y reputación, mientras Bitcoin (vía Lightning) maneja los pagos. BitTasker usa ambos — Nostr para identidad, Bitcoin Lightning para pagos.'
		},
		{
			question: '¿Necesito saber programar para usar un mercado Nostr?',
			answer:
				'No. Usar un mercado Nostr como BitTasker es similar a usar cualquier plataforma de freelancing — creas un perfil, buscas trabajos, envías propuestas y rastreastre entregas. La infraestructura Nostr funciona debajo. Solo necesitas entender que tu identidad es un par de claves y que debes respaldar tu clave privada de forma segura.'
		},
		{
			question: '¿Qué pasa si un relay Nostr se desconecta?',
			answer:
				'Tus datos sobreviven porque están distribuidos en múltiples relays. Ningún relay es autoridad. Si un relay cae, tus eventos todavía están almacenados en otros. También puedes publicar en relays adicionales en cualquier momento para redundancia. Esto es fundamentalmente diferente de una plataforma centralizada donde una interrupción del servidor puede bloquearte completamente.'
		},
		{
			question: '¿Puedo usar la misma identidad Nostr en diferentes plataformas?',
			answer:
				'Sí. Tu clave pública Nostr es tu identidad en todas partes. Cualquier plataforma compatible con Nostr — clientes sociales, mercados, foros — puede leer tus eventos firmados. Esto significa que tu perfil de freelancing en BitTasker puede ser verificado por cualquier otra aplicación Nostr, creando una identidad profesional portable que ninguna empresa controla.'
		},
		{
			question: '¿Las reseñas Nostr son más confiables que las de plataformas centralizadas?',
			answer:
				'Sí, por dos razones. Primero, las reseñas Nostr están firmadas criptográficamente por el revisor, por lo que no pueden ser falsificadas. Segundo, no pueden ser eliminadas selectivamente por un moderador de plataforma. Esto crea un sistema de reseñas más confiable e inmune a manipulación comparado con plataformas centralizadas donde las reseñas pueden ser manipuladas o eliminadas.'
		},
		{
			question: '¿Cómo empiezo con Nostr para freelancing?',
			answer:
				'Regístrate en BitTasker, que te guiará a través de crear o importar un par de claves Nostr. Tu clave pública se convierte en tu identidad. Desde ahí, la experiencia es similar a cualquier plataforma de freelancing — buscar trabajos, aplicar, entregar trabajo y cobrar en Bitcoin. La capa Nostr funciona detrás de escena para mantener tu identidad portable y tu reputación segura.'
		}
	],
	bitTaskerCta: {
		heading: 'Tu identidad. Tu reputación. Sin necesidad de permiso.',
		body: 'BitTasker está construido sobre Nostr — dándote una identidad de freelancing portable y resistente a la censura que ninguna plataforma puede revocar. Tu reputación te sigue a todas partes.',
		buttonText: 'Únete a BitTasker',
		buttonHref: '/auth/signup'
	}
};
