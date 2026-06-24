import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Freelancer.com vs Upwork: ¿Cuál Gana?',
		subtitle:
			'Comparación honesta de las dos plataformas freelance veteranas — comisiones, escrow, disputas y calidad de talento'
	},
	answerBlock:
		'Freelancer.com y Upwork son dos de las plataformas freelance más antiguas, pero sirven a mercados diferentes. Upwork cobra una comisión de servicio plana del 10% y se enfoca en proyectos más altos y verificados con escrow por hitos. Freelancer.com cobra 10% o $5 (lo que sea mayor) y es conocida por su modelo de concursos y proyectos de menor presupuesto. Upwork generalmente atrae mejores clientes y tarifas más altas, mientras Freelancer.com tiene menores barreras de entrada y opciones más accesibles para compradores con presupuesto limitado. Para freelancers que quieren comisiones aún más bajas y pagos instantáneos, BitTasker cobra solo el 5% con pagos Lightning en Bitcoin.',
	sections: [
		{
			heading: 'Freelancer.com vs Upwork: Comparación Lado a Lado',
			body: '| Característica | Freelancer.com | Upwork | BitTasker |\n|---|---|---|---|\n| Comisión Freelancer | 10% o $5 mínimo | 10% plano | 5% plano |\n| Tarifa de Retiro | $0–$30 (según método) | $0–$2 (según método) | Casi cero (Lightning) |\n| Modelo de Proyecto | Pujas + Concursos | Pujas + Propuestas | Basado en tareas |\n| Escrow | Sí (por hitos) | Sí (por hitos) | Sí (escrow Bitcoin) |\n| Soporte por Hora | Sí | Sí (con rastreador de tiempo) | Sí |\n| Modelo de Concurso | Sí (concursos de diseño) | No | No |\n| Velocidad de Pago | 3–5 días | 5–10 días | Instantáneo |\n| Calidad de Talento | Mixta | Promedio más alto | Variable |\n| Calidad de Clientes | Enfocado en presupuesto | Medio a empresarial | Nativo de cripto |\n| Miembros Gratis | Sí (pujas limitadas) | No (costo de connects) | Sí (gratis para pujar) |'
		},
		{
			heading: 'Estructura de Comisiones: Freelancer.com vs Upwork',
			body: 'Freelancer.com cobra 10% o $5, lo que sea mayor. En un proyecto de $30, pierdes $5 (16.7%). En un proyecto de $500, pierdes $50 (10%). Upwork cobra un 10% plano en todas las ganancias — $3 en un proyecto de $30, $50 en un proyecto de $500. La diferencia clave está en proyectos pequeños: el mínimo de $5 de Freelancer.com significa comisiones porcentuales más altas en trabajo de bajo valor. Ambas plataformas cobran tarifas de retiro que varían por método. La comisión plana del 5% de BitTasker significa $2.50 en un proyecto de $50 y $25 en un proyecto de $500 — consistentemente la mitad de ambas.'
		},
		{
			heading: 'Modelo de Concurso: La Característica Única de Freelancer.com',
			body: 'El modelo de concursos de Freelancer.com permite a los clientes publicar un brief (logo, diseño, concepto de app) y múltiples freelancers envían propuestas. El cliente elige al ganador y paga solo a ese freelancer. Esto crea competencia que puede beneficiar a clientes con costos más bajos pero presiona a freelancers a hacer trabajo especulativo no remunerado. Upwork no tiene concursos — pujas en proyectos definidos. Si eres diseñador que prospera con la competencia, los concursos de Freelancer.com pueden atraerte. Si prefieres pago garantizado por propuestas, el modelo de Upwork es mejor. BitTasker usa un modelo basado en tareas donde cobras al completar — sin trabajo especulativo.'
		},
		{
			heading: 'Escrow y Protección de Pagos',
			body: 'Ambas plataformas ofrecen escrow por hitos para proyectos de precio fijo. El sistema de escrow de Upwork es más robusto — los clientes deben financiar hitos antes de que comience el trabajo, y la plataforma media en disputas. Freelancer.com ofrece escrow pero ha enfrentado críticas por resolución de disputas más lenta y resultados menos favorables para freelancers. Para proyectos por hora, el rastreador de tiempo de Upwork brinda protección automática — si el rastreador está activo, cobras. La protección por hora de Freelancer.com es menos confiable. BitTasker usa escrow con contratos inteligentes de Bitcoin — los fondos se bloquean en cadena y se liberan cuando ambas partes aceptan, sin intermediario centralizado.'
		},
		{
			heading: 'Calidad de Talento y Base de Clientes',
			body: 'Upwork atrae un nivel más alto de clientes — empresas de mercado medio, agencias y corporaciones. Los freelancers con perfiles fuertes ganan de $50 a más de $200/hora. El sistema de habilidades y JSS (Puntuación de Éxito Laboral) del plataforma ayuda a mantener la calidad. Freelancer.com tiene un rango más amplio, desde negocios serios hasta compradores de presupuesto que buscan la puja más baja. Las tarifas tienden a ser más bajas y la competencia más feroz. La base de clientes de BitTasker incluye empresas nativas de cripto, startups y clientes internacionales que valoran la velocidad y las bajas comisiones sobre el prestigio de la plataforma.'
		},
		{
			heading: '¿Qué Plataforma Debes Elegir?',
			body: 'Elige Upwork si quieres clientes de mayor calidad, mejor protección de escrow y estás dispuesto a pagar 10% más costos de connect. Elige Freelancer.com si quieres menor barrera de entrada, disfrutas el trabajo basado en concursos o atiendes clientes con presupuesto limitado. Elige BitTasker si quieres las comisiones más bajas (5%), pagos instantáneos vía Bitcoin y sin costos de connect. La estrategia ideal es probar las tres — Freelancer.com por volumen, Upwork por calidad y BitTasker por pagos cripto y tareas locales.'
		}
	],
	faq: [
		{
			question: '¿Es mejor Freelancer.com que Upwork?',
			answer:
				'Depende de tus necesidades. Freelancer.com tiene menores barreras de entrada y un modelo de concursos que algunos diseñadores prefieren. Upwork tiene clientes de mayor calidad, mejor escrow y un ecosistema más profesional. BitTasker ofrece comisiones más bajas y pagos instantáneos.'
		},
		{
			question: '¿Qué plataforma cobra menos comisiones: Freelancer.com o Upwork?',
			answer:
				'Ambas cobran aproximadamente 10%, pero Freelancer.com tiene un mínimo de $5 que aumenta el porcentaje en proyectos pequeños. Upwork cobra un 10% plano sin mínimo. BitTasker cobra un 5% plano — la mitad de ambas.'
		},
		{
			question: '¿Tiene Freelancer.com escrow como Upwork?',
			answer:
				'Sí, ambas ofrecen escrow por hitos. El escrow de Upwork se considera generalmente más confiable y favorable para freelancers. El escrow de Freelancer.com funciona pero tiene resolución de disputas más lenta.'
		},
		{
			question: '¿Qué plataforma tiene mejores clientes?',
			answer:
				'Upwork atrae clientes de mercado medio a empresarial con presupuestos más grandes. Freelancer.com tiene más clientes enfocados en presupuesto. BitTasker atiende empresas nativas de cripto y clientes internacionales.'
		},
		{
			question: '¿Puedo ganar Bitcoin en Freelancer.com o Upwork?',
			answer:
				'Ninguna plataforma soporta nativamente pagos en Bitcoin. BitTasker es la principal plataforma freelance con pagos nativos en Bitcoin vía la Red Lightning.'
		},
		{
			question: '¿Qué es el modelo de concurso de Freelancer.com?',
			answer:
				'Los clientes publican un brief de diseño o desarrollo, múltiples freelancers envían propuestas compitiendo por el proyecto. El cliente elige al ganador y paga solo a ese freelancer. Beneficia a los clientes pero requiere trabajo especulativo no remunerado de freelancers.'
		},
		{
			question: '¿Qué plataforma es mejor para principiantes?',
			answer:
				'Freelancer.com tiene menor barrera de entrada con niveles de membresía gratuitos. Upwork requiere comprar connects. BitTasker es gratis para pujar con una comisión del 5% en trabajo completado — el modelo más simple para principiantes.'
		}
	],
	bitTaskerCta: {
		heading: 'La Mitad de las Comisiones, Pagos Instantáneos',
		body: 'BitTasker cobra 5% — la mitad de lo que toman tanto Freelancer.com como Upwork. Gana Bitcoin vía la Red Lightning con pagos instantáneos. Sin connects, sin especulación en concursos, sin esperar transferencias bancarias.',
		buttonText: 'Prueba BitTasker Gratis',
		buttonHref: '/auth/signup'
	}
};
