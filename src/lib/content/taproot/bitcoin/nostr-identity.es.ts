import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Identidad Nostr: Login Descentralizado Sin Email',
		subtitle:
			'Cómo los pares de llaves pública/privada reemplazan contraseñas y te dan propiedad real de tu identidad digital.'
	},
	answerBlock:
		'Nostr es un protocolo de comunicación descentralizado que reemplaza el login tradicional de email/contraseña con autenticación basada en pares de llaves pública/privada. En lugar de crear cuentas en plataformas centralizadas que pueden ser prohibidas, censuradas o eliminadas, Nostr te da una identidad criptográfica — una llave pública que actúa como tu nombre de usuario en todas partes y una llave privada que solo tú controlas. Ninguna empresa, gobierno o plataforma puede revocar tu identidad o bloquearte. Para freelancers, esto significa que tu reputación, historial e identidad viajan contigo entre plataformas sin ser propiedad de ningún servicio. BitTasker usa Nostr como su capa de identidad, por lo que registrarse requiere solo un par de llaves — sin email, sin número de teléfono, sin autoridad central que pueda decir no.',
	sections: [
		{
			heading: '¿Qué es Nostr?',
			body: 'Nostr significa "Notes and Other Stuff Transmitted by Relays" (Notas y Otras Cosas Transmitidas por Relays) — un protocolo minimalista para comunicación descentralizada. A diferencia de las redes sociales tradicionales donde una empresa controla los servidores, datos y cuentas, Nostr separa estas preocupaciones. Los clientes crean mensajes firmados (eventos), y los relays los almacenan y reenvían. Tu identidad es un par de llaves criptográficas — no una cuenta en el servidor de alguien. Cualquiera puede ejecutar un relay, cualquiera puede escribir un cliente, y no existe un punto único de fallo. Nostr ganó atención mainstream a través de Damus (cliente iOS) e integración con la Red Lightning para zaps (micropagos). La simplicidad del protocolo — cabe en un solo documento de especificación — es su mayor fortaleza. No hay blockchain compleja, no hay economía de tokens, no hay minería. Solo mensajes firmados moviéndose a través de una red descentralizada de relays.'
		},
		{
			heading: '¿Cómo reemplaza Nostr el login con email y contraseña?',
			body: 'El login tradicional requiere un email, contraseña y confianza en que la plataforma no será vulnerada, censurada o cerrada. Nostr reemplaza esto con un par de llaves: tu llave pública es tu identidad (como un nombre de usuario), y tu llave privada es tu autenticación (como una contraseña, pero matemática). Cuando te registras en un servicio compatible con Nostr, generas un par de llaves localmente en tu dispositivo. Tu llave pública se comparte abiertamente; tu llave privada nunca sale de tu dispositivo. La autenticación ocurre a través de firmas criptográficas — el servidor verifica que posees la llave privada sin nunca verla. Sin verificación de email, sin recuperación de contraseña, sin recuperación de cuenta a través de soporte al cliente. Esta es tanto la fortaleza del protocolo (resistencia a la censura, portabilidad) como su desafío (pierdes tu llave privada, pierdes tu identidad para siempre).'
		},
		{
			heading: 'Pares de llaves pública y privada explicados',
			body: 'Un par de llaves Nostr consiste en dos valores matemáticamente vinculados. La llave privada (nsec) es un número aleatorio que generas y mantienes en secreto — es la única forma de probar que posees tu identidad. La llave pública (npub) se deriva de la llave privada y puede compartirse libremente — es cómo otros te identifican y se comunican contigo. Piensa en la llave privada como la llave maestra de tu identidad digital y en la llave pública como la dirección de tu buzón. Cualquiera puede enviarte un mensaje (usando tu llave pública), pero solo tú puedes firmar respuestas (usando tu llave privada). En la práctica, los pares de llaves se representan como cadenas alfanuméricas: tu llave pública comienza con "npub1..." y tu llave privada con "nsec1...". La gestión de llaves es crítica — si tu llave privada se compromete, alguien más puede suplantarte. Si se pierde, no hay mecanismo de recuperación.'
		},
		{
			heading: '¿Qué son los NIPs (Nostr Implementation Possibilities)?',
			body: 'Los NIPs son los documentos de especificación que extienden la funcionalidad central de Nostr. El protocolo base (NIP-01) define notas de texto simples y comunicación básica de relays. NIPs subsecuentes agregan funcionalidades: NIP-04 habilita mensajes directos cifrados, NIP-05 vincula llaves Nostr a identificadores basados en dominios (como nombre@ejemplo.com), NIP-06 habilita la delegación de firma de eventos, y NIP-07 implementa zaps de Lightning. Cada NIP es una propuesta de la comunidad que pasa por discusión, implementación y adopción. Esta extensibilidad es lo que permite a Nostr evolucionar más allá de la red social simple hacia identidad, pagos, mercados y más. Para plataformas como BitTasker, los NIPs proporcionan los bloques de construcción para identidad descentralizada, comunicación cifrada e integrales de pagos con Lightning — todo dentro de un solo protocolo.'
		},
		{
			heading: 'Cómo BitTasker usa Nostr para identidad',
			body: 'BitTasker usa Nostr como su capa de identidad, lo que significa que tu cuenta ES tu par de llaves Nostr — no una dirección de email o nombre de usuario almacenado en una base de datos de una empresa. Cuando te registras, generas un par de llaves en tu navegador o aplicación de billetera. Tu llave pública se convierte en tu identidad de BitTasker, visible para clientes y freelancers. Tu llave privada firma transacciones, entregas de trabajo y attestaciones de reputación. Como Nostr es un protocolo (no una plataforma), tu identidad de BitTasker también puede usarse en cualquier otro servicio compatible con Nostr — Damus, Primal, Amethyst o aplicaciones personalizadas. No necesitas una cuenta separada para cada servicio. Esta portabilidad significa que tu reputación se construye en todo el ecosistema Nostr, no solo dentro del jardín amurallado de una empresa. Si BitTasker se desconectara, tu identidad y datos de reputación seguirían existiendo en los relays Nostr.'
		},
		{
			heading: 'Beneficios: resistencia a la censura y portabilidad',
			body: 'Los dos mayores beneficios de Nostr para freelancers son la resistencia a la censura y la portabilidad de identidad. La resistencia a la censura significa que ninguna plataforma puede prohibirte, eliminar tu cuenta o desplataformarte por razones políticas, comerciales o arbitrarias. Tu identidad existe en un protocolo, no en el servidor de una empresa. La portabilidad significa que puedes usar la misma identidad en múltiples plataformas simultáneamente — tu reputación en BitTasker, tu presencia social en Damus, tus pagos en cualquier servicio habilitado con Lightning, todo bajo un solo par de llaves. Esto es fundamentalmente diferente del modelo web2 donde cada plataforma posee tu identidad y datos. Para freelancers en regiones con inestabilidad política, censura o infraestructura financiera poco confiable, la identidad Nostr proporciona una presencia digital estable y portable que ningún gobierno o corporación puede quitarte.'
		},
		{
			heading: 'Riesgos y consideraciones de la identidad Nostr',
			body: 'La identidad Nostr tiene compromisos reales. El más crítico es la gestión de llaves: pierdes tu llave privada y pierdes tu identidad para siempre — no hay flujo de "olvidé mi contraseña". Esto hace que el almacenamiento seguro de llaves sea esencial, ya sea a través de billeteras de hardware, copias de seguridad encriptadas o esquemas de recuperación social. También está el problema de la introducción: como la identidad Nostr es nueva, la mayoría de las personas aún no tienen llaves Nostr, por lo que la incorporación requiere educación. La fiabilidad de los relays varía — algunos relays se desconectan, perdiendo potencialmente mensajes. Las estrategias multi-relay mitigan esto. Finalmente, la naturaleza pseudónima de las llaves Nostr significa que construir confianza requiere mecanismos adicionales (red de confianza, sistemas de reputación, identificadores verificados a través de NIP-05). BitTasker aborda muchos de estos desafíos a través de su gestión integrada de llaves y sistema de reputación, pero los usuarios deben entender el compromiso fundamental: la máxima libertad viene con la máxima responsabilidad personal.'
		}
	],
	faq: [
		{
			question: '¿Necesito un email para registrarme en BitTasker?',
			answer:
				'No. BitTasker usa pares de llaves Nostr para identidad — generas un par de llaves pública/privada y eso se convierte en tu cuenta. Sin email, sin número de teléfono, sin información personal requerida. Tu llave pública es tu identidad; tu llave privada es tu login.'
		},
		{
			question: '¿Qué pasa si pierdo mi llave privada?',
			answer:
				'Desafortunadamente, no hay mecanismo de recuperación para llaves privadas Nostr perdidas — esto es por diseño para resistencia a la censura. Si pierdes tu llave privada, pierdes acceso a tu identidad permanentemente. Por eso el respaldo seguro de tu nsec es esencial. BitTasker recomienda copias de seguridad digitales encriptadas más un respaldo físico almacenado de forma segura.'
		},
		{
			question: '¿La identidad Nostr es lo mismo que una billetera de Bitcoin?',
			answer:
				'La identidad Nostr y las billeteras de Bitcoin son sistemas separados. Nostr usa su propio formato de par de llaves (npub/nsec), mientras Bitcoin usa formatos de llave diferentes. Sin embargo, muchos clientes y servicios Nostr (incluyendo BitTasker) integran pagos con Lightning, por lo que tu identidad Nostr puede vincularse a pagos en Bitcoin.'
		},
		{
			question: '¿Alguien puede ver lo que hago con mi identidad Nostr?',
			answer:
				'Tu llave pública y los eventos que publicas en relays son visibles para los operadores de relays y cualquiera que monitoree esos relays. Sin embargo, tu llave privada nunca se transmite. Los mensajes directos cifrados (NIP-04) solo son legibles por el destinatario. El nivel de privacidad depende de qué relays uses y si empleas medidas adicionales de privacidad.'
		},
		{
			question: '¿Cómo se compara la identidad Nostr con iniciar sesión con Google o Apple?',
			answer:
				'El login con Google/Apple depende de proveedores centralizados que pueden revocar tu acceso, rastrear tu actividad y requerir información personal. La identidad Nostr es descentralizada — ningún proveedor puede revocarla, no se requiere información personal, y tu identidad es portable en cualquier servicio compatible con Nostr. El compromiso es que cargas con la responsabilidad completa de la gestión de llaves.'
		},
		{
			question: '¿Puedo usar la misma identidad Nostr en diferentes plataformas?',
			answer:
				'Sí. Esa es una de las características centrales de Nostr. Tu llave pública funciona en cualquier servicio compatible con Nostr — BitTasker, Damus, Primal, Amethyst y cientos más. Tu identidad, reputación y conexiones sociales viajan contigo sin ser propiedad de ninguna plataforma.'
		}
	],
	bitTaskerCta: {
		heading: 'Posee tu identidad con Nostr en BitTasker',
		body: 'BitTasker usa Nostr para identidad, para que seas dueño de tu cuenta — no una empresa. Sin email requerido, sin autoridad central que pueda prohibirte, y tu identidad es portable en toda la web descentralizada.',
		buttonText: 'Crea Tu Identidad Nostr',
		buttonHref: '/auth/signup'
	}
};
