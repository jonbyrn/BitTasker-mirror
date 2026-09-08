import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Trabajo Resistente a la Censura: Freelancing Sin Prohibiciones',
		subtitle:
			'Por qué congelamientos de cuenta, retención de pagos y desplataforme hacen esencial el freelancing descentralizado.'
	},
	answerBlock:
		'Trabajo resistente a la censura significa que ninguna autoridad central puede congelar tus ganancias, prohibir tu cuenta o borrar tu reputación profesional. Los freelancers en plataformas centralizadas enfrentan riesgos reales: Upwork ha retenido pagos durante disputas, Fiverr ha prohibido cuentas sin advertencia y PayPal ha congelado fondos de freelancers por meses. Bitcoin y Nostr resuelven esto a nivel de infraestructura. Los pagos Lightning en Bitcoin no pueden ser revertidos ni congelados por ningún tercero. La identidad Nostr está controlada criptográficamente por ti — ninguna empresa puede deshabilitar tu perfil. BitTasker combina ambos para crear una plataforma de freelancing donde tu trabajo y tus ingresos genuinamente son tuyos.',
	sections: [
		{
			heading: '¿Por qué importa la resistencia a la censura para freelancers?',
			body: 'Cuando una plataforma controla tu cuenta, controla tu sustento. Upwork puede suspender tu cuenta durante una disputa — bloqueándote de contratos activos y reteniendo tu saldo ganado. Fiverr puede prohibir cuentas basándose en detección algorítmica o quejas de clientes, con un proceso de apelación limitado. PayPal ha congelado cuentas de freelancers sosteniendo miles de dólares durante extensas "revisiones de seguridad." Incluso bancos han cerrado cuentas de freelancers que reciben frecuentes transferencias internacionales, marcando ingresos legítimos como sospechosos. En cada caso, el freelancer no tenía recurso efectivo. La decisión de la plataforma era final.'
		},
		{
			heading: '¿Cuáles son ejemplos reales de desplataforme de freelancers?',
			body: 'Estos no son hipotéticos. Freelancers han sido prohibidos de Upwork por "actividad sospechosa" que resultó ser una falsa alarma — perdiendo años de reseñas y pagos pendientes. Fiverr ha eliminado vendedores por razones poco claras, con apelaciones que toman semanas. PayPal ha congelado cuentas sosteniendo miles de dólares durante extensas "revisiones de seguridad." Incluso bancos han cerrado cuentas de freelancers que reciben frecuentes transferencias internacionales, marcando ingresos legítimos como sospechosos. En cada caso, el freelancer no tenía recurso efectivo. La decisión de la plataforma era final.'
		},
		{
			heading: '¿Cómo previene la censura Bitcoin en los pagos?',
			body: 'Las transacciones de Bitcoin a través de la Red Lightning son transferencias entre pares directas entre dos billeteras. Ningún banco, procesador de pagos o plataforma puede revertir, congelar o confiscar un pago Lightning una vez confirmado. El freelancer recibe satoshis directamente en su billetera — ningún intermediario sostiene los fondos. Esto es fundamentalmente diferente al modelo de Upwork donde la plataforma sostiene tus ganancias en su sistema interno por 14+ días, o PayPal donde los fondos pueden ser congelados durante una revisión de cuenta. Con Bitcoin, si tienes la clave privada de tu billetera, controlas tu dinero — punto.'
		},
		{
			heading: '¿Cómo previene Nostr la censura de identidad?',
			body: 'Nostr te da una identidad criptográfica — un par de claves pública-privada que ninguna empresa emitió y que ninguna empresa puede revocar. Tu clave pública es tu identidad profesional. Cada reseña, finalización de trabajo y pieza de portafolio está firmada con tu clave privada y transmitida a relays distribuidos. Ninguna entidad puede borrar tu historial, deshabilitar tu perfil o impedirte usar tu identidad en otras plataformas. Incluso si BitTasker dejara de existir, tu identidad Nostr y todos los datos de reputación firmados persistirían en relays y podrían importarse en cualquier plataforma compatible. Tu carrera no es rehén de ninguna empresa.'
		},
		{
			heading: '¿Cuáles son las compensaciones del trabajo resistente a la censura?',
			body: 'La resistencia a la censura no es gratuita. Asumes más responsabilidad personal: asegurar tus claves privadas, gestionar tu propia billetera de Bitcoin y entender que no hay recuperación de "olvidé mi contraseña" a través de un equipo de soporte de plataforma. Si pierdes tu clave privada Nostr, pierdes tu identidad. Si pierdes la semilla de tu billetera Bitcoin, pierdes tus fondos. El panorama regulatorio también es incierto — algunas jurisdicciones pueden imponer requisitos de reporte sobre pagos en cripto. Y la experiencia de usuario todavía es menos pulida que las plataformas mainstream. Estas son compensaciones reales, pero para muchos freelancers, el riesgo de desplataforme supera la curva de aprendizaje.'
		},
		{
			heading: '¿Cómo se compromete BitTasker con la resistencia a la censura?',
			body: 'BitTasker está diseñado para que ningún punto de fallo pueda cerrar el trabajo de un freelancer. La identidad está basada en Nostr y es portable. Los pagos son Bitcoin Lightning — entre pares e irreversibles. El escrow son contratos inteligentes de RGB — en cadena y auditables. BitTasker proporciona la experiencia del mercado pero no sostiene tus fondos, no controla tu identidad y no posee tu reputación. La plataforma es una herramienta que usas, no un guardián del que dependes. Esto no es una afirmación de marketing — es un compromiso arquitectónico forjado por protocolos abiertos.'
		}
	],
	faq: [
		{
			question: '¿Upwork realmente puede congelar mis ganancias?',
			answer:
				'Sí. Upwork sostiene las ganancias en su sistema interno durante disputas y puede congelar fondos mientras investiga problemas de cuenta. Freelancers han reportado esperar semanas o meses para acceder a su propio dinero. Con los pagos Lightning en Bitcoin en BitTasker, los fondos llegan directamente a tu billetera — ninguna plataforma sostiene tus ganancias.'
		},
		{
			question: '¿Qué pasa si pierdo mi clave privada Nostr?',
			answer:
				'Si pierdes tu clave privada Nostr, pierdes la capacidad de firmar eventos con esa identidad. Sin embargo, puedes crear un nuevo par de claves y empezar a reconstruir tu reputación. Por eso el respaldo seguro de claves es crítico — escríbela, guárdala offline y nunca la compartas. A diferencia de cuentas centralizadas, no hay equipo de soporte que recupere tu clave, porque nadie más la tiene.'
		},
		{
			question: '¿La resistencia a la censura es solo para contenido controversial?',
			answer:
				'No. La resistencia a la censura protege a cualquier freelancer que dependa de una plataforma para sus ingresos. Es relevante siempre que una plataforma tenga el poder de congelar tus ganancias, prohibir tu cuenta o borrar tu reputación — lo cual aplica a todos los freelancers en todas las plataformas centralizadas. No necesitas trabajar en una industria controversial para beneficiarte de no ser desplataforme.'
		},
		{
			question: '¿Cómo sé que BitTasker no se convertirá en otra plataforma centralizada?',
			answer:
				'La arquitectura de BitTasker previene la centralización a nivel de infraestructura. La identidad es Nostr (protocolo descentralizado). Los pagos son Bitcoin Lightning (entre pares). El escrow son contratos inteligentes de RGB (en cadena). BitTasker controla la capa de UX pero no la identidad subyacente, los pagos ni el escrow. Incluso si la empresa de BitTasker desapareciera, tu identidad Nostr y tus fondos Bitcoin seguirían siendo accesibles.'
		},
		{
			question: '¿Hay riesgos legales de usar plataformas resistentes a la censura?',
			answer:
				'Recibir pagos en Bitcoin es legal en la mayoría de las jurisdicciones. El riesgo legal no está en usar la plataforma sino en no reportar ingresos para fines fiscales. Siempre consulta a un profesional fiscal en tu país. La resistencia a la censura protege tu capacidad de trabajar — no te exime de obligaciones legales.'
		},
		{
			question: '¿Cuál es la diferencia entre resistencia a la censura y privacidad?',
			answer:
				'La resistencia a la censura significa que nadie puede impedirte trabajar o recibir pago. La privacidad significa que nadie puede ver tu actividad. BitTasker se enfoca en resistencia a la censura — tu identidad es verificable (para que los clientes puedan confiar en tu reputación) y tus pagos son transparentes en la blockchain. No es una plataforma anónima; es una plataforma donde ninguna autoridad puede cerrarte.'
		}
	],
	bitTaskerCta: {
		heading: 'Trabaja sin miedo a ser cerrado.',
		body: 'La arquitectura descentralizada de BitTasker significa que ninguna plataforma puede congelar tus fondos, prohibir tu cuenta o borrar tu reputación. Tu trabajo está protegido por Bitcoin y Nostr — protocolos abiertos que ninguna empresa controla.',
		buttonText: 'Únete a BitTasker',
		buttonHref: '/auth/signup'
	}
};
