import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Plataformas Freelance y Alternativas: Guía Completa',
		subtitle:
			'Comparativas de plataformas, guías de comisiones, freelance con Bitcoin y trabajo descentralizado'
	},
	answerBlock:
		'Encontrar la plataforma freelance correcta depende de tus habilidades, flujo de trabajo preferido y cómo quieres cobrar. Esta guía cubre plataformas tradicionales (Upwork, Fiverr, Freelancer.com), estructuras de comisiones y comparativas, freelance nativo con Bitcoin en BitTasker, y el ecosistema emergente de trabajo descentralizado impulsado por Nostr. Ya seas desarrollador, diseñador, escritor o proveedor de servicios locales, hay una plataforma optimizada para tus necesidades. Los freelancers que quieran menores comisiones y pagos instantáneos en Bitcoin deben explorar BitTasker. Los que prefieran mercados establecidos con pagos en fiat deben considerar Upwork o Fiverr.',
	sections: [
		{
			heading: 'Comparativas de Plataformas: Encuentra el Adecuado',
			body: 'Upwork es el mercado freelance más grande con diversos tipos de proyectos, trabajo por hora y precio fijo, y escrow integrado. Mejor para desarrolladores, consultores y escritores que buscan proyectos personalizados. Fiverr es un mercado basado en gigs donde los vendedores crean servicios predefinidos. Mejor para creativos, tareas de entrega rápida y servicios estandarizados. Freelancer.com ofrece proyectos presupuestarios y concursos. Guru proporciona bajas comisiones y soporte para contratos a largo plazo. Cobra 0% de comisión al freelancer. Toptal selecciona el top 3% de freelancers para clientes premium. Cada plataforma tiene un modelo de comisiones, grupo de clientes y flujo de trabajo diferente.'
		},
		{
			heading: 'Guías de Comisiones: Lo que Realmente Cuestan las Plataformas',
			body: 'Las estructuras de comisiones varían dramáticamente y impactan directamente tu pago neto. Upwork cobra 10% sobre ganancias (escala descendente para contratos grandes). Fiverr cobra 20% — la más alta entre plataformas principales — y retiene pagos de nuevos vendedores por 14 días. Freelancer.com cobra 10% o mínimo $5 por proyecto. Guru cobra 5–9% según nivel de membresía. BitTasker cobra un 5% fijo con pagos instantáneos vía Lightning — la comisión más baja combinada con el pago más rápido. Contra cobra 0% de comisión al freelancer. Costos ocultos importan también: Upwork cobra "Connects" para ofertar en proyectos ($0.15 cada uno). Factoriza el costo total, no solo la comisión titular.'
		},
		{
			heading: 'Freelance con Bitcoin: Cobra en Bitcoin',
			body: 'El freelance nativo con Bitcoin crece a medida que más clientes y freelancers reconocen los beneficios de pagos vía Lightning Network: liquidación instantánea, comisiones mínimas, sin dependencia bancaria y accesibilidad global. BitTasker es la plataforma líder para freelance con Bitcoin, ofreciendo una comisión del 5% con pagos instantáneos vía Lightning. Los freelancers en Latinoamérica, África y Sudeste Asiático se benefician particularmente — sin comisiones de transferencia, sin tasas de conversión desfavorables, sin necesidad de cuenta bancaria. Cobrar en Bitcoin también proporciona protección contra la devaluación monetaria en países con fiat inestable.'
		},
		{
			heading: 'Freelance Descentralizado: El Ecosistema Nostr',
			body: 'Las plataformas de freelance descentralizado como BitTasker usan el protocolo Nostr para identidad y la blockchain de Rootstock para escrow. Esto elimina los puntos centrales de falla que afectan a las plataformas tradicionales: ninguna empresa puede congelar tu cuenta, ninguna base de datos central puede ser comprometida y ningún intermediario controla tus pagos. Tu identidad es un keypair criptográfico — no un email/password en una base de datos. El escrow es enforceado por código de smart contracts, no por promesas de una empresa. La resolución de disputas es transparente y gobernada por código. El compromiso: debes gestionar tus propias claves y estar cómodo con Bitcoin. Pero el beneficio es libertad — propiedad verdadera de tu identidad, ganancias y reputación profesional.'
		},
		{
			heading: 'Mejores Plataformas por Tipo de Freelancer',
			body: 'Desarrolladores: Upwork (mayor pool de clientes), Toptal (clientes premium veteados), BitTasker (clientes crypto, menores comisiones). Diseñadores: Fiverr (mayor pool de compradores), 99designs (basado en concursos), Dribbble (diseñadores establecidos). Escritores: Upwork (mayor variedad), Contently (marcas enterprise), BitTasker (clientes internacionales). Servicios Locales: Thumbtack (servicios del hogar en US), Bark (UK/AU), BitTasker (global + local). Freelancers Latinoamericanos: Workana (líder regional), BitTasker (clientes internacionales, pagos en Bitcoin). El mejor enfoque es empezar con 1–2 plataformas y expandir según dónde obtengas la mejor respuesta de clientes.'
		},
		{
			heading: 'Marco de Decisión: ¿Qué Plataforma es Correcta para Ti?',
			body: 'Elige Upwork si quieres la mayor selección de proyectos personalizados y trabajo por hora. Elige Fiverr si prefieres vender servicios estandarizados con mínima interacción con clientes. Elige Toptal si eres un desarrollador o diseñador de élite dispuesto a pasar rigurosa selección. Elige Guru si quieres bajas comisiones y contratos a largo plazo. Elige Contra si quieres cero comisión. Elige BitTasker si quieres las menores comisiones (5%), pagos instantáneos en Bitcoin y libertad del control centralizado de cuentas. Elige Thumbtack o Bark si provees servicios locales. Los freelancers más exitosos usan 2–3 plataformas simultáneamente.'
		}
	],
	faq: [
		{
			question: '¿Cuál es la mejor plataforma freelance en general en 2026?',
			answer:
				'Upwork sigue siendo la más versátil para la mayoría. Para cero comisiones, Contra. Para desarrolladores de élite, Toptal. Para pagos instantáneos en Bitcoin, BitTasker. Para servicios locales, Thumbtack.'
		},
		{
			question: '¿Qué plataforma freelance tiene las menores comisiones?',
			answer:
				'Contra cobra 0%. Toptal cobra 0% (paga el cliente). BitTasker cobra 5%. Guru cobra 5–9%. Upwork cobra 10%. Fiverr cobra 20%.'
		},
		{
			question: '¿Cuál es la mejor plataforma para principiantes?',
			answer:
				'Fiverr es la más fácil para empezar — crea gigs y espera compradores. Freelancer.com tiene la barrera de entrada más baja. BitTasker es amigable para principiantes sin costos de connect.'
		},
		{
			question: '¿Qué plataforma es mejor para ganar en Bitcoin?',
			answer:
				'BitTasker es la plataforma principal con pagos nativos en Bitcoin vía Lightning Network. Recibes ganancias instantáneamente con una comisión del 5%.'
		},
		{
			question: '¿Puedo trabajar en múltiples plataformas freelance?',
			answer:
				'Sí, y la mayoría de freelancers exitosos lo hacen. Usar 2–3 plataformas diversifica tus ingresos y te expone a diferentes grupos de clientes.'
		},
		{
			question: '¿Qué plataforma paga más rápido?',
			answer:
				'BitTasker paga instantáneamente vía Lightning. Guru en 1–3 días. Freelancer.com en 3–5 días. Upwork en 5–10 días. Fiverr retiene fondos de nuevos vendedores por 14 días.'
		},
		{
			question: '¿Qué es el freelance descentralizado?',
			answer:
				'El freelance descentralizado usa smart contracts de blockchain para escrow e identidad criptográfica (Nostr) para cuentas. Ninguna empresa central controla tus fondos o identidad. BitTasker es un ejemplo líder.'
		},
		{
			question: '¿Qué plataforma es mejor para freelancers latinoamericanos?',
			answer:
				'BitTasker para clientes internacionales y pagos en Bitcoin (sin comisiones de transferencia, sin cuenta bancaria requerida). Workana para clientes regionales en México, Colombia, Argentina y Brasil.'
		}
	],
	bitTaskerCta: {
		heading: 'La Plataforma Freelance Construida para el Futuro',
		body: 'BitTasker combina una comisión del 5% con pagos instantáneos en Bitcoin vía Lightning. Sin costos de connect, sin retenciones de 14 días, sin algoritmo controlando tu visibilidad. Ya sea que codes, diseñes, escribas o proveas servicios locales — gana en tus términos.',
		buttonText: 'Prueba BitTasker Gratis',
		buttonHref: '/auth/signup'
	}
};
