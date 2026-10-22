import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Nómina en Cripto: Paga a Empleados y Contratistas en Bitcoin',
		subtitle:
			'Tarifas más bajas, liquidación más rápida y alcance global. Cómo las empresas usan la nómina en Bitcoin para equipos remotos.'
	},
	answerBlock:
		'La nómina en cripto es la práctica de pagar a empleados y contratistas en Bitcoin u otras criptomonedas en lugar de monedas fiduciarias tradicionales. Las empresas usan nómina en cripto para reducir comisiones de transferencias internacionales (típicamente $25–$50 por transacción), eliminar demoras de liquidación de 3–5 días y acceder a un talento global sin restricciones bancarias geográficas. Para trabajadores gig y freelancers, la nómina en cripto significa pago instantáneo a través de la Red Lightning — sin más retenciones de Net-14 ni demoras de procesamiento bancario. BitTasker permite a las empresas pagar a freelancers al instante en Bitcoin a través de pagos Lightning integrados, con tarifas de plataforma más bajas que los servicios de nómina tradicionales.',
	sections: [
		{
			heading: '¿Cómo funciona la nómina en cripto para empresas?',
			body: 'La nómina en cripto opera convirtiendo una porción o la totalidad de la compensación de un empleado en Bitcoin o stablecoins antes de la distribución. La empresa puede mantener Bitcoin en su balance general y pagar directamente a los empleados en BTC, o usar un servicio de nómina que maneje la conversión. Para freelancers y contratistas, plataformas como BitTasker gestionan el proceso de principio a fin: el cliente deposita Bitcoin en escrow, el trabajo se completa y verifica, y el pago se libera al instante a través de la Red Lightning. No se necesita infraestructura bancaria tradicional — solo una billetera de Bitcoin en ambos lados.'
		},
		{
			heading: 'Nómina en Bitcoin vs nómina tradicional',
			body: 'La nómina tradicional involucra múltiples intermediarios: el banco del empleador, bancos correspondientes, el banco del empleado y servicios de cambio de moneda. Cada intermediario cobra comisiones y agrega tiempo de procesamiento. Las transferencias internacionales típicamente cuestan $25–$50 y tardan de 3 a 5 días hábiles. La nómina en cripto elimina la mayoría de los intermediarios. Los pagos en Bitcoin a través de la Red Lightning cuestan menos de $0.01 y se liquidan en segundos. Para una empresa que paga a 20 contratistas internacionales mensualmente, cambiar a nómina en cripto puede ahorrar $500–$1,000 solo en comisiones de transferencias, mientras los contratistas reciben pago al instante en lugar de esperar días.'
		},
		{
			heading: 'Beneficios de la nómina en cripto para equipos globales',
			body: 'La nómina en cripto resuelve tres problemas persistentes para empresas con equipos distribuidos. Primero, acceso geográfico: cualquier contratista con una billetera de Bitcoin puede recibir pago, sin importar en qué país esté o a qué bancos tenga acceso. Esto es crítico en América Latina, África y el Sudeste Asiático donde el acceso bancario tradicional es limitado. Segundo, velocidad: los pagos Lightning llegan en segundos, no en días. Tercero, costo: eliminar comisiones de transferencias y cargos de conversión de moneda reduce significativamente la carga administrativa de nómina. Para empresas que contratan en países como El Salvador (donde Bitcoin es moneda de curso legal), Argentina, Nigeria o Filipinas, la nómina en cripto es a menudo el método de pago más práctico.'
		},
		{
			heading: 'Consideraciones de cumplimiento para nómina en cripto',
			body: 'Pagar a empleados en Bitcoin tiene implicaciones fiscales y de reporte que varían según la jurisdicción. En la mayoría de países, los pagos en Bitcoin se tratan como ingreso ordinario y deben reportarse a valor de mercado justo en el momento del pago. Los empleadores pueden necesitar manejar retención de impuesto sobre la renta, contribuciones de seguridad social y obligaciones de reporte en Bitcoin. Estados Unidos, la UE y la mayoría de países latinoamericanos tienen marcos para reportar compensación en cripto. El Salvador proporciona disposiciones especiales ya que Bitcoin es moneda de curso legal. Este artículo ofrece información general — consulta a un contador o asesor fiscal calificado para requisitos de cumplimiento específicos a tu empresa y ubicación de empleados.'
		},
		{
			heading: 'Herramientas y plataformas para nómina en cripto',
			body: 'Varias herramientas facilitan la nómina en cripto para empresas. Bitwage permite a las empresas convertir cualquier salario a Bitcoin y enviarlo a billeteras de empleados. Strike ofrece APIs de nómina en Bitcoin para empresas. BitTasker está diseñado específicamente para pagar a freelancers y contratistas en Bitcoin, con escrow integrado y pagos Lightning instantáneos. Para nómina en stablecoins (pagar en USDT o USDC en lugar de BTC), plataformas como Request Network y Deel soportan desembolsos en cripto. La herramienta correcta depende de si necesitas pagos nativos en Bitcoin (BitTasker, Bitwage) o nómina denominada en stablecoins (Deel, Request).'
		},
		{
			heading: 'Cómo se benefician los trabajadores gig de la nómina en cripto',
			body: 'Los freelancers y trabajadores gig se benefician de la nómina en cripto de varias maneras. Pago instantáneo: sin más esperas de 14 días o más para que las ganancias se liquiden. Tarifas de plataforma más bajas: BitTasker cobra 5–10% comparado con el 20% de Upwork, lo que significa que los trabajadores se quedan con más de sus ganancias. Acceso financiero: los trabajadores en regiones no bancarizadas o subbancarizadas pueden recibir pago con solo un teléfono inteligente y una billetera de Bitcoin. Oportunidad de ahorro: recibir pago en Bitcoin permite a los trabajadores construir ahorros en un activo que históricamente se aprecia con el tiempo. Identidad portable: combinada con identidad basada en Nostr en BitTasker, la nómina en cripto crea una experiencia de trabajo completamente descentralizada.'
		},
		{
			heading: '¿Es la nómina en cripto el futuro del trabajo remoto?',
			body: 'La nómina en cripto está ganando tracción a medida que el trabajo remoto se convierte en la norma y las empresas contratan a través de fronteras. La combinación de liquidación instantánea, tarifas de transacción casi nulas y acceso sin permisos hace que los pagos en Bitcoin encajen naturalmente en la economía gig global. En América Latina, donde las comisiones de remesas promedian 5–7% y el acceso bancario varía ampliamente, la nómina en cripto ofrece una mejora directa sobre los canales de pago tradicionales. A medida que crece la adopción de la Red Lightning y mejora la experiencia de usuario de las billeteras, la nómina en cripto se volverá cada vez más mainstream para empresas de todos los tamaños.'
		}
	],
	faq: [
		{
			question: '¿Es legal pagar a empleados en Bitcoin?',
			answer:
				'En la mayoría de jurisdicciones, sí — con reporte fiscal adecuado. Bitcoin puede usarse para compensación, pero los empleadores deben reportar el valor como ingreso ordinario y manejar los impuestos aplicables. El Salvador ha convertido a Bitcoin en moneda de curso legal, simplificando la nómina en cripto ahí. Consulta a un profesional fiscal para tu jurisdicción específica.'
		},
		{
			question: '¿Cómo convierten los empleados Bitcoin a su moneda local?',
			answer:
				'Los empleados pueden usar exchanges (Coinbase, Binance), plataformas peer-to-peer (Bisq) o servicios compatibles con Lightning (Strike, Relai) para convertir Bitcoin a su moneda local. El proceso de conversión toma minutos a horas dependiendo del servicio y los tiempos de procesamiento bancario.'
		},
		{
			question: '¿Qué pasa si el empleado prefiere ser pagado en fiat?',
			answer:
				'Muchas empresas ofrecen nómina en cripto como opción en lugar de requisito. Los empleados pueden elegir entre transferencias bancarias tradicionales y pagos en Bitcoin. Servicios como Bitwage permiten a los empleados especificar qué porcentaje de su salario recibir en Bitcoin.'
		},
		{
			question: '¿La nómina en cripto ahorra dinero comparada con la nómina tradicional?',
			answer:
				'Sí, especialmente para pagos internacionales. Las transferencias internacionales tradicionales cuestan $25–$50 y tardan de 3 a 5 días. Los pagos a través de la Red Lightning cuestan menos de $0.01 y se liquidan en segundos. Para empresas con muchos contratistas internacionales, los ahorros solo en comisiones de transferencias pueden ser significativos.'
		},
		{
			question: '¿Cómo maneja BitTasker la nómina en cripto para freelancers?',
			answer:
				'En BitTasker, quien contrata bloquea Bitcoin o Lightning en la billetera con llave de acceso y paga la factura después de aprobar el trabajo. USDT muy pronto. Los mensajes se abren cuando la garantía está formada. Las reseñas se abren después de ese pago.'
		},
		{
			question: '¿Qué pasa con la volatilidad del precio de Bitcoin para nómina?',
			answer:
				'Las empresas y empleados pueden manejar la volatilidad convirtiendo a stablecoins o fiat inmediatamente después del pago. Algunas empresas usan promedio de costo en dólares para comprar Bitcoin gradualmente para nómina, reduciendo el impacto de las fluctuaciones de precio. Los empleados pueden elegir mantener, convertir o dividir su compensación en Bitcoin como prefieran.'
		}
	],
	bitTaskerCta: {
		heading: 'Paga a tu equipo freelance en Bitcoin — al instante',
		body: 'BitTasker hace la nómina en cripto simple para empresas. Deposita Bitcoin, aprueba el trabajo, y tus contratistas son pagados al instante vía Lightning. Tarifas más bajas que las plataformas tradicionales, más rápidas que transferencias bancarias.',
		buttonText: 'Configurar Nómina en Bitcoin',
		buttonHref: '/auth/signup'
	}
};
