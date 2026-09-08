import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'El Futuro del Trabajo es Descentralizado',
		subtitle:
			'Trabajo descentralizado, economía gig, Nostr, resistencia a la censura y P2P — la revolución del trabajo explicada.'
	},
	answerBlock:
		'El futuro del trabajo es descentralizado, entre pares y resistente a la censura. En lugar de que las plataformas controlen tu identidad, guarden tus ganancias y decidan tu destino, el nuevo modelo le da soberanía a los trabajadores: Nostr para identidad portable, Bitcoin Lightning para pagos instantáneos y contratos inteligentes para acuerdos sin confianza. Esta guía cubre el panorama completo del trabajo descentralizado — desde la evolución de la economía gig hasta mercados impulsados por Nostr, desde trabajo resistente a la censura hasta la economía entre pares. Ya seas freelancer, gerente de contratación o simplemente curioso hacia dónde se dirige el trabajo, esta es tu referencia completa.',
	sections: [
		{
			heading: '¿Qué es el trabajo descentralizado?',
			body: 'El trabajo descentralizado es labor donde ninguna autoridad central controla tu identidad, pagos o reputación profesional. En lugar de depender de plataformas como Upwork o Fiverr para guardar tus ganancias y avalar tus habilidades, el trabajo descentralizado usa Bitcoin para pagos instantáneos entre pares y Nostr para identidad portable y resistente a la censura. Los contratos inteligentes en sidechains de Bitcoin como RGB reemplazan el escrow tradicional con acuerdos sin confianza y auditables. El resultado es un mercado laboral global donde freelancers en El Salvador, Nigeria o Argentina pueden trabajar para cualquiera, cobrar en segundos y nunca perder su reputación por una prohibición de plataforma.'
		},
		{
			heading: '¿Cómo está evolucionando la economía gig en 2026?',
			body: 'La economía gig se está dividiendo en dos pistas. Pista 1: plataformas centralizadas (Upwork, Fiverr, Uber) continúan extrayendo 10–20% en comisiones, retienen fondos de trabajadores por 14 días y controlan identidad y reputación. Pista 2: plataformas descentralizadas (BitTasker, mercados basados en Nostr) cobran 5% o menos, pagan instantáneamente vía Lightning y le dan a los trabajadores identidad portable a través de Nostr. La pista descentralizada está creciendo a medida que la adopción de Bitcoin se expande, Lightning madura y los trabajadores se dan cuenta de que pueden poseer su reputación profesional. En 2026, la economía gig ya no es solo sobre trabajo en plataformas — es sobre soberanía del trabajador.'
		},
		{
			heading: '¿Qué es el mercado Nostr?',
			body: 'El mercado Nostr es una red profesional descentralizada construida sobre el protocolo Nostr. En lugar de que una empresa controle tu perfil, reseñas y conexiones, tu identidad es un par de claves criptográficas que posees. Tu reputación viaja contigo en cada plataforma compatible. Los mercados construidos sobre Nostr — como BitTasker para freelancing — te permiten encontrar trabajo, completar proyectos y construir una reputación que ninguna empresa puede quitarte. El mercado Nostr es resistente a la censura: ninguna plataforma puede desplataformarte, congelar tu cuenta o borrar tus años de reseñas. Es la red profesional equivalente a poseer tus propios datos.'
		},
		{
			heading: '¿Qué es el trabajo resistente a la censura?',
			body: 'El trabajo resistente a la censura significa que ninguna plataforma puede impedirte ganar, conectarte con clientes o construir tu reputación profesional. Las plataformas tradicionales pueden suspender tu cuenta, congelar tus fondos o prohibirte por razones que no puedes apelar. El trabajo descentralizado usa Nostr para identidad (sin base de datos central que hackear o censurar), Bitcoin Lightning para pagos (sin intermediario que congele transacciones) y contratos inteligentes para acuerdos (sin empresa que imponga términos unilateralmente). Para freelancers en países con controles de capital, inestabilidad política o gobiernos autoritarios, la resistencia a la censura no es una función — es una necesidad.'
		},
		{
			heading: '¿Qué es la economía entre pares?',
			body: 'La economía entre pares es actividad económica entre individuos sin intermediarios. En freelancing, esto significa que un cliente en Nueva York paga directamente a un desarrollador en Buenos Aires — sin banco, sin procesador de pagos, sin plataforma llevándose una comisión. La Lightning Network de Bitcoin hace los pagos P2P instantáneos y casi gratuitos. Los contratos inteligentes en RGB hacen los acuerdos P2P sin confianza y auditables. Nostr hace la identidad P2P portable y resistente a la censura. La economía P2P no es teórica — está operando a escala en El Salvador, en toda América Latina y en comunidades nativas de cripto en todo el mundo. La infraestructura existe; la adopción está acelerándose.'
		},
		{
			heading: '¿Cómo se integra BitTasker en el futuro del trabajo?',
			body: 'BitTasker combina los tres pilares del trabajo descentralizado en una sola plataforma. Identidad: par de claves Nostr — tu clave pública es tu cuenta, tu reputación está firmada criptográficamente y es portable. Pagos: Bitcoin Lightning — liquidación instantánea y de bajos costos, sin banco requerido. Escrow: contratos inteligentes de RGB — acuerdos sin confianza y en cadena asegurados por la tasa de hash de Bitcoin. BitTasker maneja la capa de UX — búsqueda de empleo, seguimiento de entregas, flujos de resolución de disputas — mientras mantiene la infraestructura subyacente descentralizada. El resultado es una plataforma que se siente tan fácil como Upwork pero te da la soberanía del trabajo entre pares.'
		}
	],
	faq: [
		{
			question: '¿El trabajo descentralizado es lo mismo que freelancing?',
			answer:
				'El trabajo descentralizado es un tipo de freelancing donde posees tu identidad, pagos y reputación. El freelancing tradicional tiene plataformas controlándolo todo. El trabajo descentralizado usa Nostr, Bitcoin Lightning y contratos inteligentes para dar soberanía a los trabajadores.'
		},
		{
			question: '¿Necesito entender de Bitcoin para trabajo descentralizado?',
			answer:
				'Necesitas familiaridad básica: configurar una billetera Lightning (10 minutos), recibir una factura Lightning y respaldar tu clave privada Nostr. No necesitas entender minería, consenso o detalles del protocolo.'
		},
		{
			question: '¿Qué pasa con mi reputación si una plataforma cierra?',
			answer:
				'Con identidad Nostr, tu reputación está firmada con tu clave privada y almacenada en relays descentralizados. Si alguna plataforma desaparece, tus datos de reputación persisten y pueden importarse en cualquier plataforma compatible.'
		},
		{
			question: '¿Es legal el trabajo descentralizado?',
			answer:
				'Recibir pagos en Bitcoin es legal en la mayoría de las jurisdicciones. Las obligaciones fiscales aplican — debes reportar ingresos independientemente del método de pago. Consulta a un profesional fiscal en tu jurisdicción.'
		},
		{
			question: '¿Cómo funcionan las disputas sin autoridad central?',
			answer:
				'BitTasker usa contratos inteligentes de RGB para escrow. Las disputas siguen reglas transparentes codificadas en el contrato. Los fondos están bloqueados en código, no retenidos por BitTasker. La resolución se determina por la lógica predefinida del contrato.'
		},
		{
			question: '¿Puedo ganar en stablecoins en lugar de Bitcoin?',
			answer:
				'BitTasker se enfoca en pagos Bitcoin y Lightning. Puedes recibir en sats y convertir a stablecoins a través de funciones de intercambio integradas. Algunos freelancers mantienen BTC como ahorro a largo plazo mientras convierten el resto.'
		},
		{
			question: '¿Cuáles son los riesgos del trabajo descentralizado?',
			answer:
				'Volatilidad del precio de Bitcoin, curva de aprendizaje para billeteras y Nostr, incertidumbre regulatoria en algunas jurisdicciones y un mercado laboral más pequeño comparado con plataformas tradicionales. Son manejables con preparación adecuada.'
		}
	],
	bitTaskerCta: {
		heading: 'Posee Tu Trabajo. Posee Tu Identidad. Cobra en Bitcoin.',
		body: 'BitTasker es la plataforma de freelancing descentralizada construida con identidad Nostr, pagos Lightning en Bitcoin y contratos inteligentes de RGB. Sin guardianes, sin cuentas congeladas, sin pagos a 14 días.',
		buttonText: 'Únete a BitTasker',
		buttonHref: '/auth/signup'
	}
};
