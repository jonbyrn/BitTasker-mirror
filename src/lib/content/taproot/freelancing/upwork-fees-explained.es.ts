import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Comisiones de Upwork Explicadas: Lo Que Realmente Pagas',
		subtitle:
			'Desglose completo de las comisiones de servicio, costos de connects y tarifas de retiro de Upwork — con cálculos de ganancias reales'
	},
	answerBlock:
		'Upwork cobra a los freelancers una comisión de servicio plana del 10% en todas las ganancias, sin umbral ni reducción por volumen. También pagas $0.15 por connect para enviar propuestas, y las tarifas de retiro van de $0 a $30 dependiendo de tu método. En un proyecto de $1,000, conservas aproximadamente $897 después de comisiones de servicio y costos de retiro típicos. Esto significa que Upwork toma aproximadamente el 10.3% de tus ganancias totales. Para comparación, BitTasker cobra solo el 5% con pagos instantáneos en Bitcoin — conservarías $950 en el mismo proyecto.',
	sections: [
		{
			heading: 'Cómo Funciona la Comisión de Servicio de Upwork',
			body: 'Upwork cobra una comisión de servicio plana del 10% en cada pago que recibes. No hay descuento por volumen, no hay sistema de niveles y no hay umbral donde la comisión disminuya. Anteriormente, Upwork usaba una escala gradual (20% para los primeros $500, 10% para $500–$10,000, 5% arriba de $10,000), pero eliminaron esto en 2023 a favor de un 10% plano. Esto significa que ganes $100 o $100,000 en la plataforma, Upwork toma el mismo porcentaje. La comisión se deduce antes de recibir el pago — nunca ves el monto completo en tus ganancias.'
		},
		{
			heading: 'Costos de Connects de Upwork: El Impuesto Oculto',
			body: 'Para enviar propuestas en Upwork, necesitas connects — tokens virtuales que cuestan $0.15 cada uno. Cada propuesta requiere de 2 a 6 connects dependiendo del proyecto. Si envías 50 propuestas al mes con un promedio de 3 connects cada una, son $22.50 en costos de connect antes de conseguir un solo trabajo. Upwork te da 80 connects gratis al mes (reducidos de 100 en 2024), pero los freelancers activos rápidamente los agotan. Los connects no son reembolsables — si tu propuesta no es aceptada, los pierdes. Esto crea una dinámica de "paga para jugar" que penaliza a freelancers que necesitan pujar frecuentemente.'
		},
		{
			heading: 'Tarifas de Retiro de Upwork por Método',
			body: '| Método de Retiro | Tarifa | Velocidad | Notas |\n|---|---|---|---|\n| Depósito Directo (ACH) | $0 | 2–5 días hábiles | Solo EE.UU., mejor valor |\n| Transferencia Cable | $30 | 1–3 días hábiles | Internacional, costoso |\n| PayPal | $2 | Instantáneo a minutos | Disponible ampliamente |\n| Payoneer | $2 | 2–5 días hábiles | Bueno para internacional |\n| BitTasker (Bitcoin) | Casi cero | Instantáneo | Vía Red Lightning |\n\nEl depósito directo es gratis pero limitado a cuentas bancarias de EE.UU. Los freelancers internacionales enfrentan de $2 a $30 por retiro, lo que se acumula significativamente durante un año. Un freelancer internacional que retira $2,000/mes por Payoneer paga $24/año solo en tarifas de retiro.'
		},
		{
			heading: 'Calculadora de Ganancias Reales: Lo Que Realmente Conservas',
			body: 'Calculemos tus ganancias reales en montos de proyecto comunes.\n\nProyecto de $250: Comisión $25, connects ~$0.45, retiro ~$2. Conservas: $222.55 (89%)\nProyecto de $500: Comisión $50, connects ~$0.90, retiro ~$2. Conservas: $447.10 (89.4%)\nProyecto de $1,000: Comisión $100, connects ~$0.90, retiro ~$2. Conservas: $897.10 (89.7%)\nProyecto de $5,000: Comisión $500, connects ~$1.80, retiro ~$2. Conservas: $4,496.20 (89.9%)\n\nA una tarifa de $50/hora, 40 horas por semana, tus ganancias anuales de $104,000 se convierten en aproximadamente $93,400 después de comisiones de Upwork y costos de retiro típicos — una pérdida de $10,600 al año.'
		},
		{
			heading: 'Cómo Se Comparan las Comisiones de Upwork con Alternativas',
			body: '| Plataforma | Comisión de Servicio | Costo de Connect | Tarifa de Retiro | Total en $1,000 |\n|---|---|---|---|---|\n| Upwork | 10% | $0.15/propuesta | $0–$30 | $897–$870 |\n| Fiverr | 20% | Gratis | $1–$3 | $797–$795 |\n| Freelancer.com | 10% o $5 mín. | Gratis (limitado) | $0–$30 | $895–$865 |\n| Guru | 5–9% | Gratis | $0–$2 | $948–$909 |\n| BitTasker | 5% | Gratis | Casi cero | $950 |\n| Contra | 0% | N/A | Gratis | $1,000 |\n\nBitTasker te ahorra $53 por cada $1,000 ganado comparado con Upwork. Durante un año con ganancias de $8,000/mes, eso son $5,088 que se quedan en tu bolsillo.'
		},
		{
			heading: 'El Costo Real de Upwork para Diferentes Tipos de Freelancers',
			body: 'Desarrolladores de alto nivel ($100+/hora): La comisión del 10% es dolorosa pero manejable por la calidad de clientes. Los connects son un costo menor relativo a las ganancias.\nDiseñadores de nivel medio ($30–$60/hora): Los costos de connect se acumulan rápido al competir en categorías saturadas de diseño. Considera Fiverr o BitTasker.\nFreelancers nuevos ($10–$25/hora): Los costos de connect y la comisión del 10% dificultan crear impulso. Freelancer.com o BitTasker ofrecen menores barreras.\nEscritores ($25–$75/hora): Upwork es competitivo pero la comisión del 10% se come márgenes ya ajustados. Contently o clientes directos son más rentables.'
		},
		{
			heading: 'Cómo Minimizar las Comisiones de Upwork',
			body: 'Construye relaciones a largo plazo con clientes para reducir el volumen de propuestas (y gasto en connects). Una vez que tengas clientes recurrentes, gastas menos connects por dólar ganado. Negocia estructuras de hitos que carguen el pago al inicio para reducir el tiempo que tu dinero está retenido. Actualiza al plan Freelancer Plus de Upwork ($14.99/mes) para 80 connects y características adicionales — vale la pena si envías más de 30 propuestas al mes. En última instancia, la mejor forma de reducir comisiones es diversificar a plataformas como BitTasker (5%) o Contra (0%) para una porción de tu trabajo.'
		}
	],
	faq: [
		{
			question: '¿Cuánto cobra Upwork a los freelancers?',
			answer:
				'Upwork cobra una comisión de servicio plana del 10% en todas las ganancias, más $0.15 por connect para propuestas. Las tarifas de retiro van de $0 (depósito directo en EE.UU.) a $30 (transferencia internacional). En un proyecto de $1,000, típicamente conservas alrededor de $897.'
		},
		{
			question: '¿Cambió Upwork su estructura de comisiones en 2026?',
			answer:
				'Upwork cambió a una comisión plana del 10% en 2023, eliminando la escala gradual anterior. A partir de 2026, la comisión plana del 10% se mantiene. No hay descuento por volumen ni reducción por umbral.'
		},
		{
			question: '¿Qué son los connects de Upwork y cuánto cuestan?',
			answer:
				'Los connects son tokens virtuales necesarios para enviar propuestas. Cuestan $0.15 cada uno, y cada propuesta requiere de 2 a 6 connects. Recibes 80 connects gratis al mes. No son reembolsables si tu propuesta no es aceptada.'
		},
		{
			question: '¿Cuál es la forma más barata de retirar de Upwork?',
			answer:
				'El depósito directo ACH en EE.UU. es gratis. Para freelancers internacionales, Payoneer ($2) es la opción más económica. Las transferencias cable cuestan $30. BitTasker ofrece tarifas de retiro casi cero vía Lightning.'
		},
		{
			question: '¿Vale la pena la comisión del 10% de Upwork?',
			answer:
				'Para freelancers de alto nivel con perfiles establecidos, la comisión del 10% está justificada por la calidad del cliente y la protección de escrow. Para freelancers nuevos, las comisiones más los costos de connect dificultan crear impulso. Considera BitTasker (5%) o Contra (0%).'
		},
		{
			question: '¿Cómo puedo pagar menos comisiones en Upwork?',
			answer:
				'Construye relaciones recurrentes con clientes para reducir gasto en connects. Actualiza a Freelancer Plus ($14.99/mes) si envías más de 30 propuestas al mes. Diversifica a plataformas de menor comisión como BitTasker (5%) o Contra (0%) para parte de tu trabajo.'
		},
		{
			question: '¿Upwork también cobra comisiones a los clientes?',
			answer:
				'Sí, los clientes pagan una tarifa de mercado del 3–5% en pagos. Esta es separada de la comisión del 10% del freelancer, lo que significa que ambas partes pagan a Upwork por cada transacción.'
		}
	],
	bitTaskerCta: {
		heading: 'Conserva $53 Más por Cada $1,000 Ganado',
		body: 'La comisión del 5% de BitTasker significa que conservas $950 en un proyecto de $1,000 — $53 más que Upwork. Con pagos instantáneos en Bitcoin vía Lightning, también eliminas tarifas de retiro y períodos de espera. Sin connects, sin costos ocultos.',
		buttonText: 'Prueba BitTasker Gratis',
		buttonHref: '/auth/signup'
	}
};
