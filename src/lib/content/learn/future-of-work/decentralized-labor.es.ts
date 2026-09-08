import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Trabajo Descentralizado: El Futuro Sin Jefes',
		subtitle:
			'Cómo Bitcoin y Nostr están habilitando una nueva economía donde los trabajadores poseen su identidad, pagos y reputación.'
	},
	answerBlock:
		'El trabajo descentralizado es labor donde ninguna autoridad central controla tu identidad, pagos o reputación profesional. En lugar de depender de plataformas como Upwork o Fiverr para guardar tus ganancias y avalar tus habilidades, el trabajo descentralizado usa Bitcoin para pagos instantáneos entre pares y Nostr para una identidad portable y resistente a la censura. Los contratos inteligentes en sidechains de Bitcoin como RGB reemplazan el escrow tradicional con acuerdos sin confianza y auditables. El resultado es un mercado laboral global donde freelancers en El Salvador, Nigeria o Argentina pueden trabajar para cualquiera, cobrar en segundos y nunca perder su reputación por una prohibición de plataforma.',
	sections: [
		{
			heading: '¿Qué es el trabajo descentralizado?',
			body: 'El trabajo descentralizado es freelancing sin un guardián central. En las plataformas tradicionales de gig, la empresa controla tu cuenta, guarda tu dinero en escrow, decide tu estructura de comisiones y puede prohibirte en cualquier momento. En un modelo descentralizado, los trabajadores usan claves criptográficas para identidad (Nostr), reciben pagos directamente a través de la Red Lightning de Bitcoin y participan en escrow basado en contratos inteligentes en sidechains como RGB. Ninguna entidad puede congelar tus ganancias, borrar tu reputación o sacarte del mercado.'
		},
		{
			heading: '¿Cómo funciona la identidad descentralizada para freelancers?',
			body: 'Nostr (Notes and Other Stuff Transmitted by Relays) le da a los freelancers una identidad criptográfica que ninguna plataforma posee. Tu clave pública es tu nombre de usuario en cada servicio compatible con Nostr. Tu reputación — reseñas, trabajos completados, portafolio — viaja contigo porque está firmada con tu clave privada, no almacenada en la base de datos de una empresa. Si BitTasker cerrara mañana, tu identidad Nostr y todos tus datos de reputación firmados seguirían existiendo en relays y podrían importarse en cualquier plataforma compatible. Esto es fundamentalmente diferente a Upwork, donde tus años de reseñas desaparecen en el momento en que tu cuenta es suspendida.'
		},
		{
			heading: '¿Cómo habilita Bitcoin los pagos descentralizados?',
			body: 'La Red Lightning de Bitcoin permite a los freelancers recibir pagos en segundos con comisiones casi nulas — sin cuenta bancaria, sin procesador de pagos, sin período de retención de 14 días. Un cliente en Nueva York paga a un desarrollador en San Salvador, y los satoshis llegan antes de que siquiera se lea el correo de confirmación de entrega. No hay intermediario que pueda congelar la transacción, revertirla o exigir una comisión más allá de lo que ambas partes acordaron. Para freelancers en países con controles de capital, monedas inestables o infraestructura bancaria limitada, los pagos Lightning no son solo convenientes — son transformadores.'
		},
		{
			heading: '¿Qué es el escrow sin confianza y por qué importa?',
			body: 'El escrow tradicional significa confiar en una plataforma para guardar tu dinero de manera justa. El escrow sin confianza usa contratos inteligentes en una sidechain de Bitcoin (como RGB) donde los fondos están bloqueados en código, no en la cuenta bancaria de una empresa. Tanto el freelancer como el cliente pueden verificar los términos del contrato en cadena. La resolución de disputas sigue reglas transparentes escritas en el contrato. Ninguna parte necesita confiar en BitTasker o en otra empresa — confían en código auditables. Esto elimina el riesgo de que una plataforma se incline arbitrariamente por una parte o retenga fondos durante una disputa.'
		},
		{
			heading: '¿Cuáles son los beneficios del trabajo descentralizado?',
			body: 'Los beneficios principales son: acceso global sin permisos (cualquier persona con conexión a internet puede participar), resistencia a la censura (ninguna plataforma puede desplataformarte), liquidación instantánea (pagos Lightning en segundos vs. 14 días de plazo), comisiones más bajas (5–10% en BitTasker vs. 20% en Upwork) y reputación portable (tu identidad Nostr viaja contigo entre plataformas). Para freelancers en mercados emergentes — América Latina, África, Sudeste Asiático — el trabajo descentralizado elimina la fricción bancaria y las altas comisiones de remesas que se comen las ganancias.'
		},
		{
			heading: '¿Cuáles son los desafíos del trabajo descentralizado?',
			body: 'El trabajo descentralizado tiene compensaciones reales. La volatilidad del precio de Bitcoin significa que tus ganancias pueden fluctuar en términos fiat — aunque los pagos Lightning en sats y los puentes de stablecoins reducen este riesgo. Hay una curva de aprendizaje: configurar una billetera Lightning, entender las claves Nostr y navegar contratos inteligentes requiere más conocimiento técnico que registrarse en Fiverr. La incertidumbre regulatoria persiste — algunas jurisdicciones no están claras sobre cómo se gravan los pagos en cripto. Y el ecosistema aún está madurando: menos clientes, mercados laborales más pequeños y una experiencia de usuario menos pulida comparada con plataformas establecidas.'
		},
		{
			heading: '¿Cómo implementa BitTasker el trabajo descentralizado?',
			body: 'BitTasker combina tres pilares del trabajo descentralizado en una sola plataforma. La identidad está construida sobre Nostr — tu clave pública es tu cuenta, y tu reputación está firmada criptográficamente y es portable. Los pagos funcionan con la Red Lightning de Bitcoin para una liquidación instantánea y de bajos costos. El escrow usa contratos inteligentes de RGB para acuerdos sin confianza y en cadena. BitTasker maneja la capa de experiencia de usuario — búsqueda de empleo, seguimiento de entregas, flujos de resolución de disputas — mientras mantiene la infraestructura subyacente descentralizada. El resultado es una plataforma que se siente tan fácil como Upwork pero te da la soberanía del trabajo entre pares.'
		}
	],
	faq: [
		{
			question: '¿El trabajo descentralizado es lo mismo que freelancing?',
			answer:
				'El trabajo descentralizado es un tipo de freelancing, pero la diferencia clave es quién controla la infraestructura. En el freelancing tradicional, plataformas como Upwork o Fiverr controlan tu identidad, guardan tu dinero y establecen las reglas. En el trabajo descentralizado, posees tu identidad a través de Nostr, recibes pagos en Bitcoin directamente vía Lightning y participas en escrow de contratos inteligentes sin confianza. El trabajo en sí — escribir código, diseñar logos, traducir documentos — es el mismo. La estructura de poder es diferente.'
		},
		{
			question: '¿Necesito entender de Bitcoin para hacer trabajo descentralizado?',
			answer:
				'Necesitas familiaridad básica: cómo configurar una billetera Lightning (toma unos 10 minutos), cómo recibir una factura Lightning y cómo respaldar tu clave privada Nostr. No necesitas entender minería, algoritmos de consenso o detalles técnicos del protocolo. Si puedes usar Venmo, puedes aprender pagos Lightning. BitTasker ofrece guías de incorporación para hacer la transición suave.'
		},
		{
			question: '¿Qué pasa con mi reputación si BitTasker cierra?',
			answer:
				'Debido a que BitTasker usa Nostr para identidad, tu reputación está firmada con tu clave privada y almacenada en relays descentralizados — no en la base de datos de BitTasker. Si BitTasker desapareciera mañana, tus datos de reputación seguirían existiendo en relays Nostr y podrían importarse en cualquier plataforma compatible. Esta es la ventaja fundamental de la identidad descentralizada sobre los perfiles bloqueados en plataformas.'
		},
		{
			question: '¿Puedo ganar en stablecoins en lugar de Bitcoin?',
			answer:
				'BitTasker se enfoca en pagos Bitcoin y Lightning. Si necesitas exposición a stablecoins, puedes recibir en sats y usar un servicio de intercambio para convertir. Algunos freelancers prefieren mantener sus ganancias en Bitcoin como estrategia de ahorro a largo plazo, mientras que otros convierten a la moneda local inmediatamente. La elección es tuya — el beneficio clave es que ningún intermediario controla cuándo o cómo accedes a tu dinero.'
		},
		{
			question: '¿Cómo funcionan las disputas sin una autoridad central?',
			answer:
				'BitTasker usa contratos inteligentes de RGB para el escrow. Cuando surge una disputa, ambas partes presentan evidencia dentro del flujo de trabajo de disputas de la plataforma. La resolución sigue reglas transparentes codificadas en el contrato inteligente. Los fondos nunca son retenidos por BitTasker — están bloqueados en el contrato hasta que ambas partes acuerden o el mecanismo de resolución del contrato resuelva el problema. Esto elimina el riesgo de parcialidad de la plataforma.'
		},
		{
			question: '¿Es legal el trabajo descentralizado?',
			answer:
				'Recibir pagos en Bitcoin es legal en la mayoría de las jurisdicciones. Sin embargo, las obligaciones fiscales siguen aplicando — debes reportar ingresos independientemente del método de pago. Algunos países tienen reglas fiscales específicas para cripto; otros tratan los pagos Bitcoin como cualquier otro ingreso. Siempre consulta a un profesional fiscal en tu jurisdicción. BitTasker no ofrece asesoría legal o fiscal.'
		}
	],
	bitTaskerCta: {
		heading: 'Posee tu trabajo. Posee tu identidad. Cobra en Bitcoin.',
		body: 'BitTasker es la plataforma de freelancing descentralizada construida con identidad Nostr, pagos Lightning en Bitcoin y contratos inteligentes de RGB. Sin guardianes, sin cuentas congeladas, sin pagos a 14 días. Tu reputación es tuya para siempre.',
		buttonText: 'Únete a BitTasker',
		buttonHref: '/auth/signup'
	}
};
