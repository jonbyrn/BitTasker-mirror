import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Freelancing Descentralizado: El Futuro del Trabajo P2P',
		subtitle:
			'Ninguna autoridad central controla tu identidad, pagos o reputación. Esto es freelancing sin intermediarios.'
	},
	answerBlock:
		'El freelancing descentralizado elimina al intermediario de la ecuación. En lugar de confiar en plataformas centralizadas como Upwork o Fiverr para controlar tu identidad, retener tus ganancias y mediar disputas, el freelancing descentralizado usa protocolos abiertos — Nostr para identidad y Bitcoin para pagos — para que poseas tu reputación y cobres de forma peer-to-peer. BitTasker es la plataforma líder de freelancing descentralizado, combinando identidad basada en Nostr con pagos Bitcoin Lightning y escrow mediante contratos inteligentes de Rootstock para crear un mercado donde ninguna entidad puede censurar, desplataformar o congelar financieramente a un participante.',
	sections: [
		{
			heading: '¿Qué es el freelancing descentralizado?',
			body: 'El freelancing descentralizado es un modelo de trabajo donde freelancers y clientes se conectan, negocian y transaccionan sin un intermediario centralizado que controle el proceso. La identidad se gestiona a través de protocolos abiertos (como Nostr) en lugar de bases de datos corporativas. Los pagos fluyen peer-to-peer a través de Bitcoin o la Red Lightning. El escrow se maneja mediante contratos inteligentes en blockchains públicas en lugar de los sistemas internos de una empresa. El resultado: sin punto único de fallo, sin puerta de entrada, sin términos de servicio que pueden cambiar de la noche a la mañana y destruir tu sustento.'
		},
		{
			heading: '¿Cómo funciona la identidad basada en Nostr para freelancers?',
			body: 'Nostr (Notes and Other Stuff Transmitted by Relays) es un protocolo simple y abierto para comunicación resistente a la censura. En freelancing, Nostr te da un par de claves criptográficas que representan tu identidad. Tu clave pública es tu nombre de usuario en cualquier plataforma compatible con Nostr. Tu reputación — reseñas, trabajos completados, calificaciones de clientes — se almacena como eventos firmados en la red Nostr. Si BitTasker desaparece mañana, tu reputación sobrevive porque vive en la red descentralizada, no en los servidores de BitTasker. Puedes llevar tu identidad y trayectoria a cualquier otro mercado compatible con Nostr al instante.'
		},
		{
			heading: '¿Por qué las plataformas tradicionales de freelancing son centralizadas?',
			body: 'Las plataformas tradicionales como Upwork, Fiverr y Freelancer.com están construidas en arquitecturas centralizadas. Controlan cuentas de usuarios, procesamiento de pagos, resolución de disputas y sus términos de servicio. Esto crea varios problemas: la plataforma puede congelar tu cuenta sin advertencia, retener tus ganancias por períodos prolongados, cambiar estructuras de comisiones unilateralmente y restringir el acceso según la geografía. Su modelo de negocio depende de ser el intermediario de confianza — lo que significa que se benefician de la asimetría de información entre freelancers y clientes.'
		},
		{
			heading: '¿Cómo funciona el escrow de Bitcoin en el freelancing descentralizado?',
			body: 'En las plataformas tradicionales, el escrow es gestionado por la empresa que retiene fondos en sus cuentas bancarias. En el freelancing descentralizado, el escrow es gestionado por contratos inteligentes en blockchains públicas. En BitTasker, el escrow usa contratos inteligentes de Rootstock (una sidechain de Bitcoin). Cuando comienza un proyecto, el cliente deposita Bitcoin en un contrato inteligente auditable. Los fondos se bloquean hasta que ambas partes confirmen la finalización, o hasta que un proceso de resolución de disputas determine el resultado. El código es de fuente abierta y verificable — no tienes que confiar en BitTasker, confías en el protocolo.'
		},
		{
			heading: '¿Qué significa la resistencia a la censura para los freelancers?',
			body: 'La resistencia a la censura significa que ninguna plataforma puede unilateralmente impedirte trabajar, recibir pagamento o mantener tu reputación profesional. En plataformas centralizadas, las cuentas se suspenden por razones opacas — cambios en algoritmos, disputas de pago o simplemente operar desde un país "restringido". Freelancers en Venezuela, Nigeria y Afganistán han perdido acceso a plataformas que eran sus fuentes de ingresos principales. El freelancing descentralizado asegura que tu capacidad de trabajar y ganar no esté sujeta a las políticas de ninguna empresa, presiones políticas o decisiones algorítmicas.'
		},
		{
			heading: '¿Cuáles son los desafíos del freelancing descentralizado?',
			body: 'El freelancing descentralizado no está exento de compensaciones. La volatilidad de Bitcoin puede afectar las ganancias (aunque los pagos Lightning llegan al instante y puedes convertir inmediatamente). La experiencia de usuario es menos pulida que las plataformas establecidas — la configuración de billeteras, gestión de claves e interacciones en cadena tienen una curva de aprendizaje. La base de clientes es más pequeña, aunque creciente. La resolución de disputas mediante contratos inteligentes es más lenta que un ticket de soporte cuando ambas partes cooperan. BitTasker está trabajando activamente para minimizar estos puntos de fricción mientras preserva los beneficios centrales de la descentralización.'
		},
		{
			heading: '¿Cómo implementa BitTasker la descentralización?',
			body: 'BitTasker combina tres primitivas descentralizadas en una plataforma de freelancing cohesiva. Nostr maneja identidad y reputación — tu perfil y reseñas son portables a través de la red. Bitcoin Lightning maneja pagos — transferencias peer-to-peer instantáneas y de bajo costo sin intermediarios. Los contratos inteligentes de Rootstock manejan escrow — bloqueo de fondos y resolución de disputas auditable y sin necesidad de confianza. BitTasker sirve como capa de coordinación, proporcionando la interfaz de usuario y funciones de descubrimiento mientras los protocolos subyacentes manejan las funciones críticas.'
		},
		{
			heading: 'El futuro del trabajo peer-to-peer',
			body: 'La economía gig se está moviendo hacia la descentralización a medida que los freelancers reconocen los riesgos de depender de plataformas. Protocolos abiertos como Nostr y Bitcoin hacen técnicamente posible construir mercados sin control centralizado. A medida que la experiencia de usuario de las billeteras mejora y la adopción de Bitcoin crece — especialmente en América Latina donde El Salvador ha adoptado Bitcoin como moneda de curso legal — el freelancing descentralizado se convertirá en el estándar para trabajadores remotos que valoran la soberanía financiera. BitTasker está construyendo la infraestructura para este futuro hoy.'
		}
	],
	faq: [
		{
			question: '¿Es legal el freelancing descentralizado?',
			answer:
				'Sí. Freelancear a través de plataformas descentralizadas es legal en la mayoría de jurisdicciones. Estás proporcionando servicios y recibiendo pago — el método de pago (Bitcoin) y la arquitectura de la plataforma (descentralizada) no cambian la naturaleza legal del trabajo. Consulta a un profesional fiscal local para los requisitos de declaración en tu país.'
		},
		{
			question: '¿Cómo protejo mis ganancias de la volatilidad del precio de Bitcoin?',
			answer:
				'Puedes convertir Bitcoin a tu moneda local inmediatamente después de recibir el pago a través de servicios de exchange. Los pagos Lightning llegan al instante, así que no hay demora entre ganar y convertir. Muchos freelancers mantienen una parte en Bitcoin y convierten el resto a stablecoins o fiat según sea necesario.'
		},
		{
			question: '¿Qué pasa si BitTasker cierra?',
			answer:
				'Tu identidad y reputación de Nostr están almacenadas en la red descentralizada de Nostr, no en los servidores de BitTasker. Tu reputación, historial de trabajo completado e identidad sobreviven. Puedes llevar tu perfil a cualquier otro mercado compatible con Nostr. Los fondos de escrow en contratos inteligentes de Rootstock permanecen accesibles a través de la blockchain.'
		},
		{
			question: '¿Cómo se resuelven las disputas sin una autoridad central?',
			answer:
				'BitTasker usa contratos inteligentes de Rootstock con resolución de disputas integrada. Ambas partes presentan evidencia, y el contrato sigue reglas predefinidas para determinar el resultado. Esto es más lento que un equipo de soporte de una empresa cuando ambas partes cooperan, pero es transparente, auditable y no está sujeto a sesgo o corrupción.'
		},
		{
			question:
				'¿Los clientes de cualquier país pueden usar plataformas de freelancing descentralizado?',
			answer:
				'Sí. Las plataformas descentralizadas son permisivas por diseño. No hay restricciones geográficas — cualquiera con una conexión a internet y una billetera de Bitcoin puede participar. Esto es especialmente valioso para freelancers en países con acceso limitado a banca tradicional o plataformas de freelancing.'
		},
		{
			question: '¿Qué habilidades tienen demanda en plataformas de freelancing descentralizado?',
			answer:
				'Las habilidades de mayor demanda reflejan el freelancing tradicional: desarrollo de software, diseño UI/UX, redacción de contenido, traducción, marketing y consultoría. Las habilidades nativas de Bitcoin como desarrollo Lightning, trabajo con el protocolo Nostr y desarrollo de contratos inteligentes obtienen tarifas premium en plataformas descentralizadas.'
		}
	],
	bitTaskerCta: {
		heading: 'Únete a la revolución del freelancing descentralizado',
		body: 'BitTasker te ofrece lo que las plataformas centralizadas nunca podrán: posesión real de tu identidad, pagos instantáneos en Bitcoin y trabajo resistente a la censura. Tu reputación es tuya para conservar, pase lo que pase con cualquier plataforma.',
		buttonText: 'Empieza a Freelancear Descentralizado',
		buttonHref: '/auth/signup'
	}
};
