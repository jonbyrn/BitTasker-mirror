import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Freelancing con Bitcoin: Gana BTC en Tus Términos',
		subtitle:
			'Cómo cobrar, plataformas de trabajo, escrow y nómina — todo sobre freelancing con Bitcoin.'
	},
	answerBlock:
		'El freelancing con Bitcoin te permite ganar, mantener y gastar Bitcoin por tu trabajo — sin depender de bancos tradicionales, procesadores de pagos o plataformas centralizadas. Cobras instantáneamente vía Red Lightning, tu identidad es un par de claves Nostr que posees, y el escrow es enforced por contratos inteligentes auditables en RGB. Esta guía cubre el panorama completo: cómo cobrar en Bitcoin, las mejores plataformas de trabajo cripto, cómo funciona el escrow sin confianza y cómo la nómina en cripto está transformando la contratación global. Ya seas desarrollador, diseñador, escritor o proveedor de servicios locales, la economía de Bitcoin tiene trabajo para ti.',
	sections: [
		{
			heading: '¿Cómo cobran los freelancers en Bitcoin?',
			body: 'Los freelancers reciben Bitcoin a través de la Red Lightning — un protocolo de Capa 2 que habilita transacciones instantáneas con comisiones casi nulas. Cuando un cliente aprueba tu trabajo completado en una plataforma como BitTasker, los satoshis se envían directamente a tu billetera Lightning. El proceso es directo: configura una wallet compatible con Lightning (Aqua, Blink o Phoenix), completa el trabajo y recibe el pago en segundos. No hay intermediario bancario, no hay demora de procesamiento de 3–5 días y las comisiones de transacción son menores a un centavo. Puedes mantener Bitcoin como ahorro, convertir a tu moneda local a través de exchanges o gastarlo directamente en comerciantes que acepten BTC. Nuestra guía "Cobra en Bitcoin" explica cada paso en detalle.'
		},
		{
			heading: 'Mejores plataformas de trabajo Bitcoin en 2026',
			body: 'El ecosistema de freelancing con Bitcoin incluye varias plataformas. BitTasker se enfoca en el mercado latinoamericano con identidad Nostr, escrow de RGB y pagos por Lightning — cobrando 5% con recompensas escalonadas de lealtad. LaborX ofrece un mercado amplio para trabajos que pagan en Bitcoin en desarrollo, diseño y trabajo creativo. CryptoJobsList agrega ofertas remotas de trabajo cripto. AngelList aloja roles de startups que a veces pagan en Bitcoin. Bitwage te permite recibir cualquier salario en Bitcoin, incluso de empleadores tradicionales. Para la mejor combinación de comisiones bajas, pagos rápidos e identidad descentralizada, BitTasker está diseñado específicamente para freelancing con Bitcoin. Nuestra guía de trabajos Bitcoin compara cada plataforma en detalle.'
		},
		{
			heading: 'Cómo funciona el escrow con Bitcoin para freelancers',
			body: 'El escrow con Bitcoin protege tanto a freelancers como a clientes bloqueando fondos en un contrato inteligente hasta que el trabajo sea completado y aprobado. En BitTasker, el escrow usa contratos inteligentes de RGB minados junto con Bitcoin para seguridad. Cuando un cliente financia un proyecto, el pago va a un contrato inteligente — no a la cuenta bancaria de BitTasker. El contrato aplica los términos acordados: los fondos se liberan cuando se aprueban los hitos, o regresan al cliente si el proyecto se cancela. Las disputas siguen reglas transparentes de resolución codificadas en el contrato. Ninguna entidad — incluyendo BitTasker — puede mover los fondos unilateralmente. Esto es fundamentalmente diferente del escrow tradicional de plataformas, donde la empresa controla el dinero. Nuestra guía de escrow con Bitcoin explica cada aspecto del mecanismo.'
		},
		{
			heading: 'Nómina en cripto: cómo pagan las empresas a sus equipos en Bitcoin',
			body: 'La nómina en cripto permite a las empresas pagar empleados y contratistas en Bitcoin, stablecoins u otras criptomonedas. Servicios como Bitwage manejan la conversión de nómina fiat a Bitcoin, permitiendo a empleadores tradicionales pagar parte o todo un salario en BTC. Las empresas nativas de Bitcoin pagan directamente en BTC o Lightning. Para equipos internacionales, la nómina en cripto elimina comisiones de transferencia bancaria, márgenes de FX y demoras de liquidación de varios días. Una empresa en EE.UU. puede pagar a un contratista en Argentina en minutos — sin bancos correspondientes, sin retención de 3–5 días. Nuestra guía de nómina cripto cubre las herramientas, implicaciones fiscales y estrategias de implementación.'
		},
		{
			heading: 'Empieza a ganar Bitcoin hoy: guía paso a paso',
			body: 'Paso 1: Configura una billetera Lightning. Descarga Aqua, Blink o Wallet of Satoshi — gratis en iOS y Android. Paso 2: Asegura tu seed phrase. Escríbela en papel (mejor: respaldo de acero) y almacénala de forma segura. Paso 3: Crea una cuenta en BitTasker usando tu identidad Nostr. Paso 4: Navega las tareas disponibles y aplica. Paso 5: Completa el trabajo y envía para revisión. Paso 6: Cuando el cliente aprueba, el pago llega a tu billetera vía Lightning en segundos. Paso 7: Mantén Bitcoin como ahorro, convierte a tu moneda local o gasta directamente. Todo el proceso — desde el registro hasta el primer pago — puede tomar menos de un día. Sin necesidad de cuenta bancaria, sin verificación de crédito, sin período de espera.'
		},
		{
			heading: 'Freelancing con Bitcoin vs. freelancing tradicional',
			body: 'Las plataformas tradicionales de freelancing (Upwork, Fiverr) cobran 10–20% en comisiones, retienen tus fondos por 14 días, requieren cuentas bancarias y controlan tu identidad y reputación. El freelancing con Bitcoin cobra 5–10% (BitTasker), paga instantáneamente vía Lightning, funciona con una billetera de autocustodia y te da identidad portable a través de Nostr. Las compensaciones: el freelancing con Bitcoin requiere comodidad con billeteras cripto, el ecosistema es más pequeño y la volatilidad del precio afecta las ganancias. Pero para freelancers en mercados emergentes — América Latina, África, Sudeste Asiático — los beneficios son significativos: sin fricción bancaria, sin comisiones de remesas, sin censura de plataforma y acceso instantáneo a clientes globales.'
		}
	],
	faq: [
		{
			question: '¿Realmente puedo ganar Bitcoin como freelancer?',
			answer:
				'Sí. Plataformas como BitTasker, LaborX y CryptoJobsList conectan freelancers con clientes que pagan en Bitcoin. Las categorías comunes incluyen desarrollo, diseño, escritura, traducción y servicios locales. Las ganancias van desde $500–$1,500/mes tiempo parcial hasta $3,000–$8,000+/mes tiempo completo.'
		},
		{
			question: '¿Qué habilidades pagan más en Bitcoin?',
			answer:
				'El desarrollo de software (web, móvil, contratos inteligentes) comanda las tarifas más altas — $75–$150/hora en plataformas nativas de cripto. UI/UX design, redacción de contenido y traducción también tienen alta demanda. Desarrolladores con experiencia en Lightning o Nostr ganan tarifas premium.'
		},
		{
			question: '¿Necesito cuenta bancaria para ganar Bitcoin?',
			answer:
				'No. Necesitas una billetera Lightning (Aqua, Blink o Phoenix) — gratis en iOS y Android. Los pagos llegan directamente a tu billetera vía Lightning. Si quieres convertir a tu moneda local, puedes usar exchanges o servicios entre pares.'
		},
		{
			question: '¿Cómo protejo mis ganancias en Bitcoin?',
			answer:
				'Usa un enfoque de dos billeteras: una billetera móvil Lightning para recibir pagos, y una wallet hardware (Coldcard, Trezor) para ahorros a largo plazo. Respalda tu seed phrase en acero. Nunca compartas tus claves privadas. Para seguridad en plataformas, BitTasker usa escrow de RGB — tus fondos están bloqueados en contratos inteligentes, no en cuentas bancarias de la empresa.'
		},
		{
			question: '¿Qué pasa si el precio de Bitcoin cae?',
			answer:
				'Bitcoin es volátil. Para mitigar el riesgo, puedes convertir ganancias a stablecoins (USDC) o a tu moneda local inmediatamente después de recibir el pago. Algunos freelancers mantienen un porcentaje en Bitcoin como ahorro a largo plazo mientras convierten el resto.'
		},
		{
			question: '¿Es legal el freelancing con Bitcoin?',
			answer:
				'Recibir pagos en Bitcoin es legal en la mayoría de las jurisdicciones. Las obligaciones fiscales aplican — debes reportar ingresos independientemente del método de pago. Consulta a un profesional fiscal en tu jurisdicción para orientación específica.'
		},
		{
			question: '¿Cómo me protege el escrow como freelancer?',
			answer:
				'BitTasker usa contratos inteligentes de RGB para escrow. Tu pago está bloqueado en código hasta que el cliente apruebe el trabajo. Ni el cliente, ni BitTasker, ni ningún tercero pueden mover los fondos unilateralmente. Las disputas siguen reglas de resolución transparentes en cadena.'
		}
	],
	bitTaskerCta: {
		heading: 'Empieza a Ganar Bitcoin Hoy',
		body: 'BitTasker te conecta con clientes que pagan instantáneamente vía Lightning. Comisiones más bajas que Upwork o Fiverr, pagos más rápidos y posees tu identidad a través de Nostr.',
		buttonText: 'Regístrate Gratis',
		buttonHref: '/auth/signup'
	}
};
