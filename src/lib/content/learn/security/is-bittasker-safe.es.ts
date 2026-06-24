import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: '¿Es BitTasker Seguro? Seguridad y Confianza Explicadas',
		subtitle:
			'Cómo contratos inteligentes auditados, identidad Nostr y autocustodia protegen tus ganancias'
	},
	answerBlock:
		'BitTasker está construido sobre contratos inteligentes Rootstock auditados, identidad descentralizada basada en Nostr y pagos de autocustodia Bitcoin/Lightning — lo que significa que la plataforma nunca mantiene tu dinero. El escrow es ejecutado por código en la blockchain Rootstock, no por la cuenta bancaria de una empresa. Tu identidad es un par de claves Nostr que controlas, no un email/contraseña atado a una base de datos central. Los pagos fluyen directamente entre clientes y freelancers vía Lightning Network, sin intermediario fiduciario. Esto es fundamentalmente más seguro que plataformas tradicionales (Upwork, Fiverr) donde la empresa custodia fondos y controla el acceso a cuentas. Sin embargo, BitTasker tiene riesgos específicos de crypto: volatilidad del Bitcoin, riesgo de ejecución de contratos inteligentes e irreversibilidad de transacciones.',
	sections: [
		{
			heading: '¿Cómo protege BitTasker tus ganancias?',
			body: 'BitTasker usa un modelo de seguridad de tres capas. Capa 1: Escrow por contrato inteligente Rootstock. Cuando un cliente te contrata y financia una tarea, el Bitcoin se bloquea en un contrato inteligente auditado en la blockchain Rootstock — no en la cuenta bancaria de BitTasker. El contrato aplica los términos acordados: los fondos se liberan al freelancer cuando se aprueba el trabajo, o se devuelven al cliente si la tarea se cancela. Ninguna parte (incluyendo BitTasker) puede mover los fondos en escrow unilateralmente. Capa 2: Identidad Nostr. Tu cuenta es un par de claves criptográficas, no un email/contraseña almacenado en una base de datos central. No hay base de datos central que hackear. Capa 3: Pagos Lightning Network. Cuando el cliente libera el pago, el Bitcoin fluye directamente a tu wallet vía Lightning — liquidándose en segundos.'
		},
		{
			heading: '¿El contrato inteligente de BitTasker está auditado?',
			body: 'Sí, los contratos de escrow Rootstock de BitTasker han sido auditados por firmas de seguridad independientes. Las auditorías examinan la lógica del contrato buscando vulnerabilidades incluyendo ataques de reentrancy, desbordamiento de enteros, retiro no autorizado de fondos y casos extremos del ciclo de vida del escrow. Los reportes de auditoría se publican por transparencia. Rootstock mismo es una sidechain de Bitcoin asegurada por merged mining con mineros de Bitcoin, heredando el modelo de seguridad de Bitcoin.'
		},
		{
			heading: '¿Cómo se compara BitTasker con Upwork y Fiverr?',
			body: 'La diferencia fundamental es la custodia. Upwork y Fiverr mantienen tus ganancias en cuentas controladas por la empresa. Pueden congelar tu cuenta, retrasar retiros, imponer períodos obligatorios de retención y cobrar 10–20% en comisiones. Si la empresa tiene problemas financieros, tus ganancias podrían estar en riesgo. BitTasker usa escrow descentralizado — tus ganancias están bloqueadas en un contrato inteligente, no en una cuenta bancaria. La plataforma cobra 5% (la mitad de Upwork). Los pagos llegan en segundos vía Lightning. Tu identidad es un par de claves Nostr — ninguna empresa puede suspender tu cuenta sin tu consentimiento criptográfico.'
		},
		{
			heading: '¿Cuáles son los riesgos de usar BitTasker?',
			body: 'BitTasker tiene riesgos específicos que las plataformas tradicionales no tienen. Primero, volatilidad del Bitcoin: tus ganancias están en Bitcoin, que puede fluctuar significativamente en valor. Puedes mitigar esto convirtiendo a stablecoins o fiat inmediatamente después de recibir el pago. Segundo, riesgo de contrato inteligente: aunque auditado, los contratos pueden tener vulnerabilidades no descubiertas. Tercero, transacciones irreversibles: las transacciones de Bitcoin no se pueden revertir. Cuarto, responsabilidad de autocustodia: si pierdes tu seed phrase, no hay recuperación de cuenta. Estos riesgos son manejables con prácticas de seguridad adecuadas.'
		},
		{
			heading: '¿Cómo hace la identidad Nostr a BitTasker más seguro?',
			body: 'Las plataformas tradicionales usan autenticación email/contraseña atada a una base de datos central. Si esa base de datos es filtrada (común — LinkedIn, Adobe, Dropbox han sido filtrados), tus credenciales están comprometidas. BitTasker usa pares de claves Nostr — identidades criptográficas que generas localmente en tu dispositivo. Tu clave privada nunca toca los servidores de BitTasker. No hay base de datos central de contraseñas que hackear. La autenticación es criptográfica: firmas mensajes con tu clave privada, y la plataforma verifica con tu clave pública. Es el mismo modelo de seguridad que usa Bitcoin mismo.'
		},
		{
			heading: '¿Cómo se manejan las disputas en BitTasker?',
			body: 'Las disputas se resuelven a través del mecanismo de escrow incorporado en el contrato inteligente. Cuando se crea una tarea, ambas partes acuerdan términos que se codifican en el contrato. Si el cliente aprueba el trabajo, los fondos se liberan al freelancer. Si hay un desacuerdo, el contrato soporta un proceso de resolución de disputas. A diferencia de Upwork, donde la resolución involucra árbitros de la empresa que pueden tardar semanas, el proceso de BitTasker es transparente y gobernado por código en la blockchain Rootstock.'
		},
		{
			heading: '¿Mis datos personales están seguros en BitTasker?',
			body: 'BitTasker recopila datos personales mínimos por diseño. Tu identidad es un par de claves Nostr — no se requiere email para funcionalidad básica. El historial de pagos es on-chain (pseudónimo por diseño en Bitcoin/Rootstock). La plataforma no almacena tus claves privadas, seed phrases o credenciales financieras. No se requiere KYC para uso básico de la plataforma. Esto es una ventaja de privacidad sobre plataformas tradicionales que recopilan información personal extensa.'
		}
	],
	faq: [
		{
			question: '¿Es BitTasker legítimo?',
			answer:
				'Sí, BitTasker es una plataforma de freelance real construida sobre Bitcoin, contratos inteligentes Rootstock y el protocolo Nostr. Cobra 5% y usa escrow descentralizado para proteger a freelancers y clientes.'
		},
		{
			question: '¿BitTasker puede congelar mi cuenta?',
			answer:
				'No, BitTasker no puede congelar tu identidad Nostr ni impedirte recibir pagos. Tu identidad es un par de claves criptográficas que tú controlas.'
		},
		{
			question: '¿Qué pasa si BitTasker cierra?',
			answer:
				'Tu Bitcoin está seguro. Los fondos en escrow están bloqueados en contratos inteligentes Rootstock, no en cuentas bancarias de BitTasker. Los contratos continúan operando en la blockchain Rootstock.'
		},
		{
			question: '¿Necesito saber de Bitcoin para usar BitTasker?',
			answer:
				'Necesitas un conocimiento básico de wallets Bitcoin y pagos Lightning. BitTasker te guía en la configuración, pero eres responsable de gestionar tus propias claves.'
		},
		{
			question: '¿Cuánto cobra BitTasker?',
			answer:
				'BitTasker cobra una tarifa plana de 5% — la mitad de Upwork. No hay tarifas de conexión, costos de oferta ni cargos ocultos.'
		},
		{
			question: '¿Mi dinero está seguro en el escrow de BitTasker?',
			answer:
				'Los fondos en escrow están bloqueados en contratos inteligentes Rootstock auditados y asegurados por merged mining de Bitcoin. Ninguna parte puede mover los fondos unilateralmente.'
		},
		{
			question: '¿Qué pasa si un cliente no libera el pago?',
			answer:
				'El contrato inteligente aplica los términos del escrow. Si el cliente financió el escrow y completaste el trabajo, el contrato proporciona un mecanismo para la liberación del pago.'
		}
	],
	bitTaskerCta: {
		heading: 'Freelance con Confianza en BitTasker',
		body: 'Contratos inteligentes auditados, identidad Nostr y pagos de autocustodia protegen tus ganancias. Ninguna autoridad central controla tu dinero o identidad.',
		buttonText: 'Únete a BitTasker',
		buttonHref: '/auth/signup'
	}
};
