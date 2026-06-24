import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Comisiones de Fiverr Explicadas: Lo Que Realmente Pagan',
		subtitle:
			'Desglose completo de la comisión del 20% de Fiverr, cargos de procesamiento y costos de retiro — con cálculos de ganancias reales'
	},
	answerBlock:
		'Fiverr se queda con el 20% de cada orden como comisión de servicio — la más alta entre las principales plataformas freelance. En un gig de $100, conservas $80. En un proyecto de $500, conservas $400. Fiverr también cobra tarifas de procesamiento en retiros ($1–$3 dependiendo del método) y retiene las ganancias de nuevos vendedores durante 14 días. Para un freelancer que gana $5,000/mes en Fiverr, la plataforma toma $1,200/año solo en comisiones de servicio. BitTasker cobra solo el 5% con pagos instantáneos en Bitcoin — en los mismos $5,000/mes, conservarías $5,700 más al año.',
	sections: [
		{
			heading: 'Cómo Funciona la Comisión de Servicio del 20% de Fiverr',
			body: 'Fiverr deduce el 20% de cada pago antes de que llegue a tu saldo. No hay excepciones, descuentos por volumen ni reducciones por nivel. Cuando un comprador paga $100 por tu gig, $20 van a Fiverr inmediatamente y $80 entran a tu saldo pendiente. Esto aplica al precio del gig, propinas y servicios adicionales (complementos). La comisión de Fiverr es el porcentaje más alto entre todas las plataformas principales — Upwork cobra 10%, Guru cobra del 5% al 9% y BitTasker cobra 5%. La comisión del 20% significa que necesitas precios 25% más altos que en una plataforma del 0% para ganar lo mismo.'
		},
		{
			heading: 'El Período de Liquidación de 14 Días de Fiverr',
			body: 'Los nuevos vendedores (menos de 60 días o sin cierto volumen de órdenes completadas) enfrentan un período de liquidación de 14 días después de la entrega. Esto significa que incluso después de que un comprador confirme que la orden está completa, tus fondos permanecen en estado "pendiente" durante dos semanas completas antes de estar disponibles para retiro. Para vendedores establecidos que cumplen los requisitos de Fiverr, la liquidación se reduce a 7 días. Este retraso es brutal para el flujo de efectivo — si entregas un proyecto de $500 el 1 de enero, no puedes acceder a esos fondos hasta el 15 de enero. BitTasker paga instantáneamente al aprobar la tarea vía Lightning Network.'
		},
		{
			heading: 'Tarifas de Retiro y Métodos de Fiverr',
			body: '| Método de Retiro | Tarifa | Velocidad | Mínimo | Notas |\n|---|---|---|---|---|\n| PayPal | $1–$2 | Instantáneo a minutos | $1 | Disponible ampliamente |\n| Payoneer | $3 | 2–5 días hábiles | $20 | Bueno para internacional |\n| Transferencia Bancaria (ACH) | $1 | 1–2 días hábiles | $1 | Solo EE.UU. |\n| Tarjeta Fiverr Revenue | $1–$3 | 2–5 días hábiles | $50 | Basada en Payoneer |\n| BitTasker (Bitcoin) | Casi cero | Instantáneo | Ninguno | Vía Red Lightning |\n\nLos vendedores internacionales enfrentan la peor combinación: la comisión del 20% de Fiverr más $3 en tarifas de Payoneer más cargos de conversión de moneda. En una orden de $1,000 de un vendedor latinoamericano, las comisiones totales pueden superar los $230 — conservas menos del 77%.'
		},
		{
			heading: 'Calculadora de Ganancias Reales: Lo Que Realmente Conservas',
			body: 'Aquí tienes montos reales de ganancia en órdenes comunes de Fiverr.\n\nGig de $25: Fiverr toma $5 (20%), retiro ~$1. Conservas: $19 (76%)\nGig de $100: Fiverr toma $20 (20%), retiro ~$1. Conservas: $79 (79%)\nProyecto de $500: Fiverr toma $100 (20%), retiro ~$2. Conservas: $398 (79.6%)\nProyecto de $1,000: Fiverr toma $200 (20%), retiro ~$3. Conservas: $797 (79.7%)\n\nEn Fiverr, consistentemente pierdes aproximadamente el 20.5% de cada dólar ganado. Si ganas $4,000/mes (un ingreso sólido en Fiverr), Fiverr toma aproximadamente $9,840/año en comisiones combinadas de servicio y retiro. En BitTasker al 5%, pagarías $2,400/año — ahorrando $7,440 anuales.'
		},
		{
			heading: 'Comisiones de Fiverr vs Upwork vs BitTasker: Comparación Completa',
			body: '| Factor | Fiverr | Upwork | BitTasker |\n|---|---|---|---|\n| Comisión de Servicio | 20% | 10% | 5% |\n| Costo de Connect/Listado | Gratis | $0.15/propuesta | Gratis |\n| Período de Liquidación | 14 días (nuevo) / 7 días | 5–10 días | Instantáneo |\n| Tarifa de Retiro | $1–$3 | $0–$30 | Casi cero |\n| Total en $1,000 | ~$800 conservados | ~$897 conservados | ~$950 conservados |\n| Total en $5,000 | ~$4,000 conservados | ~$4,485 conservados | ~$4,750 conservados |\n| Anual en $4K/mes | ~$38,160 conservados | ~$42,960 conservados | ~$45,600 conservados |\n\nFiverr es la plataforma más costosa por dólar ganado. Durante un año con ganancias de $4,000/mes, BitTasker te ahorra $7,440 comparado con Fiverr y $2,640 comparado con Upwork.'
		},
		{
			heading: 'Las Comisiones Adicionales de Fiverr que los Vendedores Suelen Pasar por Alto',
			body: 'Más allá de la comisión del 20%, Fiverr tiene costos que muchos vendedores pasan por alto: cursos de Fiverr Learn ($20–$100+) para desarrollo de habilidades, Gigs Promovidos (pagar por visibilidad, $0.50–$5+ por clic) y las herramientas de Fiverr Workspace ($9+/mes) que compiten con alternativas gratuitas. Vendedores en ciertas categorías también enfrentan limitaciones de "Solicitudes de Comprador" de Fiverr que efectivamente los fuerzan a usar Gigs Promovidos para obtener visibilidad. Cuando sumas la comisión del 20%, costos de retiro y gasto promocional opcional, el costo real de vender en Fiverr puede superar el 25% de los ingresos.'
		},
		{
			heading: 'Cómo Reducir las Comisiones de Fiverr Sin Dejar la Plataforma',
			body: 'No puedes reducir la comisión del 20% de Fiverr — es innegociable. Sin embargo, puedes: subir tus precios para contabilizar la comisión (cobra $125 en lugar de $100 para netear $100), usar la función de pago directo de Fiverr (disponible en algunos mercados) para evitar comisiones con clientes recurrentes, minimizar el gasto en Gigs Promovidos optimizando tu SEO de gigs y mover algunos clientes a una plataforma de menor comisión como BitTasker. La estrategia más efectiva a largo plazo es diversificar: usa Fiverr para descubrimiento, luego transiciona clientes recurrentes a plataformas donde conserves más ganancias.'
		}
	],
	faq: [
		{
			question: '¿Cuánto se queda Fiverr de los vendedores?',
			answer:
				'Fiverr se queda con el 20% de cada orden — la más alta entre las principales plataformas freelance. En un gig de $100, recibes $80. En un proyecto de $500, recibes $400. También hay una tarifa de retiro de $1 a $3 dependiendo del método.'
		},
		{
			question: '¿Por qué la comisión de Fiverr es tan alta?',
			answer:
				'La comisión del 20% de Fiverr financia su infraestructura de mercado, protección al comprador y marketing. Sin embargo, es el doble del 10% de Upwork y cuatro veces el 5% de BitTasker. Fiverr justifica la comisión proporcionando un mercado de compradores integrado — no necesitas encontrar clientes.'
		},
		{
			question: '¿Puedo evitar la comisión del 20% de Fiverr?',
			answer:
				'No en la plataforma misma — la comisión es obligatoria. Puedes reducir el impacto ajustando tus precios o moviendo clientes recurrentes a una plataforma de menor comisión como BitTasker (5%) o Contra (0%).'
		},
		{
			question: '¿Cuánto tiempo retiene Fiverr tu dinero?',
			answer:
				'Los nuevos vendedores enfrentan un período de liquidación de 14 días después de completar la orden. Los vendedores establecidos con volumen suficiente obtienen 7 días. Después de la liquidación, el retiro tarda de 1 a 5 días hábiles. BitTasker paga instantáneamente.'
		},
		{
			question: '¿Cuál es la forma más barata de retirar de Fiverr?',
			answer:
				'El retiro por PayPal cuesta $1–$2 y es el más rápido. La transferencia bancaria ACH cuesta $1 pero solo para EE.UU. Payoneer cuesta $3 y es mejor para internacionales. BitTasker ofrece tarifas casi cero vía Lightning.'
		},
		{
			question: '¿Cuánto puedo ganar realmente en Fiverr después de comisiones?',
			answer:
				'Conservas aproximadamente el 79.5% de cada dólar ganado en Fiverr. Un vendedor que gana $5,000/mes en bruto conserva aproximadamente $3,975/mes después de la comisión del 20% y costos de retiro — aproximadamente $1,025/mes van a Fiverr.'
		},
		{
			question: '¿Vale la pena Fiverr con la comisión del 20%?',
			answer:
				'El valor de Fiverr es el mercado de compradores integrado — no necesitas encontrar clientes. Si el volumen de compradores y la facilidad de uso justifican la comisión para ti, puede valer la pena. Para márgenes más altos, combina Fiverr con plataformas de menor comisión como BitTasker.'
		}
	],
	bitTaskerCta: {
		heading: 'Deja de Perder el 20% en Cada Orden',
		body: 'BitTasker cobra solo el 5% — una cuarta parte de la comisión de Fiverr. En $5,000/mes de ganancias, eso son $7,440 más en tu bolsillo cada año. Además, los pagos son instantáneos vía Lightning — sin retenciones de 14 días.',
		buttonText: 'Prueba BitTasker Gratis',
		buttonHref: '/auth/signup'
	}
};
