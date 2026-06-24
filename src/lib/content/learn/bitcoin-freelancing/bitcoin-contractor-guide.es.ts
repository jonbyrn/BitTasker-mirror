import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Guía de Contratista Bitcoin: Impuestos y Reportes 1099',
		subtitle:
			'Cómo reportar ingresos en Bitcoin, pagar impuestos estimados y llevar registros como contratista de cripto.'
	},
	answerBlock:
		'Como contratista 1099 que gana Bitcoin, debes reportar todos los ingresos en cripto a su valor de mercado justo cuando los recibes. El IRS trata Bitcoin como propiedad, no como moneda, lo que significa que cada pago es un evento gravable. Debes impuesto sobre la renta del valor en USD de Bitcoin en el momento que lo recibes, y potencialmente impuesto sobre ganancias de capital si luego vendes con ganancia. Eres responsable de pagos trimestrales estimados de impuestos, registros precisos de cada transacción y reportes 1099 adecuados. Esta guía cubre obligaciones fiscales enfocadas en EE.UU. para freelancers de cripto — pero es información general, no asesoría fiscal. Siempre consulta a un profesional fiscal calificado para orientación específica a tu situación.',
	sections: [
		{
			heading: '¿Cómo reporto ingresos en Bitcoin en mis impuestos?',
			body: 'Bitcoin recibido como pago por servicios se trata como ingreso ordinario por el IRS. Repórtalo en Schedule C (Form 1040) si eres propietario único, o Schedule E si operas como LLC o sociedad. El monto que reportas es el valor de mercado justo del Bitcoin en USD en la fecha que lo recibiste. Si Bitcoin cotizaba a $60,000 cuando recibiste 0.01 BTC por un proyecto, reportas $600 como ingreso. No reportas la apreciación del precio de Bitcoin hasta que realmente vendas o gastes el Bitcoin — en ese punto, debes impuesto sobre ganancias de capital por la diferencia entre el precio de venta y el valor cuando lo recibiste. Ganancias a corto plazo (retenidas menos de un año) se gravan como ingreso ordinario. Ganancias a largo plazo (retenidas más de un año) reciben tasas preferenciales de 0–20% según tu rango de ingresos.'
		},
		{
			heading: '¿Cómo reporto ingresos 1099 de plataformas de Bitcoin?',
			body: 'Plataformas como BitTasker pueden emitir un 1099-NEC si ganas más de $600 en un año calendario. Sin embargo, el 1099 puede solo reflejar transacciones denominadas en fiat — no todos los pagos en Bitcoin. Eres responsable de reportar TODOS los ingresos, incluyendo pagos en Bitcoin recibidos fuera de la plataforma o en plataformas que no emiten 1099s. Si un cliente te paga directamente en Bitcoin (no a través de una plataforma), no se emite 1099, pero aún debes reportar el ingreso. El IRS compara los 1099s con tu declaración de impuestos, por lo que las discrepancias generan auditorías. Mantén tus propios registros como fuente principal de verdad, no los reportes generados por la plataforma.'
		},
		{
			heading: '¿Qué registros debo mantener como freelancer de cripto?',
			body: 'Manten registros detallados de cada transacción de Bitcoin: fecha recibida, monto en BTC, valor USD al momento de recibirlo, nombre del cliente o referencia del proyecto y dirección de billetera. Usa una herramienta fiscal de cripto como Koinly, CoinTracker o TokenTax para importar automáticamente transacciones de blockchain y calcular el costo base. Exporta historiales de transacciones de BitTasker y cualquier exchange regularmente. Mantén registros por al menos siete años — el IRS puede auditar declaraciones hasta tres años atrás, o seis años si los ingresos están subreportados significativamente. Almacena registros en múltiples ubicaciones: respaldo en la nube, disco local y una copia física para documentos críticos. Buenos registros ahorran miles en costos de contabilidad y te protegen en una auditoría.'
		},
		{
			heading: '¿Cómo funcionan los pagos trimestrales estimados de impuestos?',
			body: 'Como contratista 1099, no estás sujeto a retención por empleador. Debes realizar pagos trimestrales estimados de impuestos al IRS (y tu estado) usando el Formulario 1040-ES. Las fechas de vencimiento son 15 de abril, 15 de junio, 15 de septiembre y 15 de enero del año siguiente. Estima tus ingresos anuales, calcula la obligación fiscal esperada y divide entre cuatro. Para ingresos en cripto, usa el valor en USD en el momento en que cada pago fue recibido. Si subestimas, podrías deber multas. Si sobreestimas, recibes un reembolso. Muchos freelancers de cripto apartan el 25–30% de cada pago en Bitcoin para impuestos. Pagar en Bitcoin no elimina tu obligación fiscal — debes impuestos en USD independientemente de cómo te paguen.'
		},
		{
			heading: 'Consideraciones fiscales internacionales para freelancers de Bitcoin',
			body: 'Las obligaciones fiscales varían significativamente por país. En EE.UU., los ingresos en Bitcoin se gravan como ingreso ordinario. En El Salvador, Bitcoin es moneda de curso legal y el gobierno ha emitido orientación específica sobre fiscalidad de cripto. En la UE, el tratamiento del IVA para cripto varía por estado miembro — algunos lo tratan como moneda extranjera, otros como propiedad. En el Reino Unido, HMRC trata cripto como activos de capital con requisitos específicos de reporte. Muchos países latinoamericanos (México, Argentina, Brasil) tienen marcos fiscales de cripto en evolución. Algunos países no tienen leyes específicas de impuestos sobre cripto, creando ambigüedad. Independientemente de tu país, recibir Bitcoin como pago es casi seguro un evento gravable. Un profesional fiscal en tu jurisdicción es esencial para el cumplimiento.'
		},
		{
			heading: 'Impuesto de autoempleo para freelancers de Bitcoin',
			body: 'En EE.UU., el impuesto de autoempleo es 15.3% sobre el ingreso neto de autoempleo (12.4% de Seguro Social hasta la base salarial, más 2.9% de Medicare). Esto es adicional al impuesto sobre la renta. Como freelancer de Bitcoin, todo tu ingreso neto — calculado en USD al momento de recibirlo — está sujeto al impuesto de autoempleo. Puedes deducir la mitad del impuesto de autoempleo como ajuste al ingreso. Los gastos comerciales (hardware, software, oficina en casa, internet) son deducibles en Schedule C y reducen tu ingreso neto. Para freelancers que ganan ingresos significativos en Bitcoin, el impuesto de autoempleo es a menudo la obligación fiscal más grande. Consulta a un profesional fiscal para optimizar tus deducciones y pagos estimados.'
		},
		{
			heading: '¿Puedo pagar impuestos en Bitcoin?',
			body: 'Generalmente, no — el IRS requiere pagos fiscales en USD. Debes convertir suficiente Bitcoin a dólares para cubrir tu obligación fiscal. Algunos estados aceptan criptomonedas para ciertos impuestos, pero los pagos federales deben hacerse en USD. Esto significa que necesitas una estrategia de conversión: vender suficiente Bitcoin antes de cada fecha límite de pago estimado para cubrir tu obligación. Muchos freelancers mantienen una billetera separada de "impuestos" donde acumulan BTC específicamente para pagos fiscales, convirtiendo a USD antes de cada fecha límite trimestral. No convertir crea un riesgo de liquidez — si Bitcoin cae en valor antes de que puedas vender para impuestos, aún debes el monto completo en USD.'
		}
	],
	faq: [
		{
			question: '¿Debo pagar impuestos sobre Bitcoin que recibo por trabajo freelance?',
			answer:
				'Sí. El IRS trata Bitcoin recibido como pago como ingreso ordinario a su valor de mercado justo en la fecha de recepción. Debes reportarlo en tu declaración de impuestos independientemente de si lo conviertes a USD o lo mantienes como Bitcoin.'
		},
		{
			question: '¿Qué pasa si no reporto mis ingresos en Bitcoin?',
			answer:
				'El IRS monitorea cada vez más las transacciones de cripto. Las empresas de análisis de blockchain proveen datos al IRS, y los exchanges emiten 1099s. No reportar ingresos puede resultar en multas, intereses y persecución criminal por evasión fiscal intencional. La divulgación voluntaria está disponible si tienes ingresos no reportados.'
		},
		{
			question: '¿Cómo calculo el valor en USD de Bitcoin que recibí?',
			answer:
				'Usa el valor de mercado justo en la fecha y hora que recibiste el Bitcoin. La mayoría de las herramientas fiscales de cripto (Koinly, CoinTracker) obtienen datos históricos de precios automáticamente de exchanges. Si recibiste Bitcoin a través de Lightning, el valor es el precio USD en el momento del pago.'
		},
		{
			question: '¿Debo impuesto sobre ganancias de capital cuando vendo Bitcoin que gané?',
			answer:
				'Sí. Cuando vendes Bitcoin que recibiste como ingreso, debes impuesto sobre ganancias de capital por la diferencia entre el precio de venta y el valor cuando lo recibiste. Si se retuvo menos de un año, es ganancia de capital a corto plazo (gravada como ingreso ordinario). Más de un año, aplican tasas de ganancia de capital a largo plazo (0–20%).'
		},
		{
			question: '¿Puedo deducir mis comisiones de transacción de Bitcoin como gastos comerciales?',
			answer:
				'Sí. Las comisiones de Red Lightning, comisiones de transacción on-chain, comisiones de conversión de exchange y comisiones de plataforma pagadas en el curso de generar ingresos son gastos comerciales deducibles en Schedule C. Mantén registros de todas las comisiones pagadas.'
		},
		{
			question: '¿Debería usar un software fiscal de cripto?',
			answer:
				'Fuertemente recomendado. Herramientas como Koinly, CoinTracker y TokenTax importan automáticamente transacciones de blockchain, calculan el costo base y generan reportes fiscales. El seguimiento manual de docenas o cientos de transacciones de cripto es propenso a errores y consume mucho tiempo.'
		},
		{
			question: '¿Cuál es la postura del IRS sobre Bitcoin como dinero?',
			answer:
				'El IRS clasifica Bitcoin como propiedad, no como moneda. Esto significa que está sujeto a reglas de impuestos sobre propiedad: impuesto sobre la renta cuando se recibe como pago, e impuesto sobre ganancias de capital cuando se vende o intercambia. No se trata como moneda extranjera para fines fiscales.'
		}
	],
	bitTaskerCta: {
		heading: 'Gana Bitcoin — Conoce Tus Obligaciones Fiscales',
		body: 'BitTasker facilita ganar en Bitcoin, pero tus obligaciones fiscales permanecen. Mantén registros de cada pago. Consulta a un profesional fiscal. Y empieza a trabajar en la economía descentralizada.',
		buttonText: 'Comienza Ahora',
		buttonHref: '/auth/signup'
	}
};
