import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Blink Wallet: Lightning Bitcoin para Todos',
		subtitle: 'La forma más fácil de enviar, recibir y gastar Bitcoin por Lightning Network'
	},
	answerBlock:
		'Blink Wallet (antes Bitcoin Beach Wallet) es una billetera Bitcoin basada en Lightning que nació en El Zonte, El Salvador en 2020. Construida por Galoy, un equipo basado en Latinoamérica, Blink hace que los pagos Bitcoin sean tan fáciles como enviar un mensaje de texto. Presenta un saldo denominado en dólares para que veas tu poder adquisitivo sin la volatilidad del precio de Bitcoin, soporta múltiples idiomas (inglés, español, francés, alemán, turco y portugués brasileño), y ofrece herramientas para comerciantes incluyendo sistemas POS, Circles comunitarios y vales de Bitcoin. Blink usa un modelo custodial para máxima simplicidad, convirtiéndolo en la mejor puerta de entrada para cualquiera que se inicie en pagos Bitcoin en El Salvador y Latinoamérica.',
	sections: [
		{
			heading: '¿Qué Es Blink Wallet y De Dónde Viene?',
			body: 'Blink Wallet se originó como Bitcoin Beach Wallet en El Zonte, un pequeño pueblo costero en El Salvador que se hizo famoso como una de las primeras economías circulares de Bitcoin. Cuando El Salvador adoptó Bitcoin como moneda de curso legal en septiembre de 2021, la billetera fue renombrada como Blink. Está construida sobre el framework open-source de Galoy, mantenida por un equipo basado en Latinoamérica. La billetera fue diseñada desde el día uno para la adopción real por comerciantes — no como una herramienta especulativa de trading. Hoy, Blink sirve a usuarios en múltiples países y soporta seis idiomas, convirtiéndola en una de las billeteras Lightning más accesibles disponibles.'
		},
		{
			heading: '¿Cómo Funciona el Saldo en Dólares en Blink?',
			body: 'Blink muestra tu saldo de Bitcoin en equivalentes en dólares, para que siempre sepas cuál es tu poder adquisitivo sin preocuparte por las fluctuaciones del precio de BTC. Cuando recibes sats (satoshis), Blink los convierte a un valor en dólares en tiempo real. Puedes enviar y recibir en cualquiera de las dos denominaciones — sats o dólares — según tu preferencia. Esto es especialmente útil en El Salvador y Latinoamérica, donde el dólar es la moneda de referencia para los precios diarios. El activo subyacente siempre es Bitcoin en la Lightning Network; la visualización en dólares es simplemente una capa de conveniencia que hace la experiencia más familiar para usuarios acostumbrados a precios en fiat.'
		},
		{
			heading: '¿Qué Son las Circles de Blink y las Herramientas para Comerciantes?',
			body: 'Blink ofrece varias funciones más allá de los pagos peer-to-peer simples. Las Circles permiten que las comunidades creen sus propias economías internas — grupos de personas que regularmente transaccionan entre sí usando Bitcoin en Lightning. Para comerciantes, Blink proporciona herramientas de punto de venta (POS) que generan códigos QR para que los clientes escaneen y paguen instantáneamente. Los vales de Bitcoin te permiten crear tarjetas precargadas que pueden distribuirse como regalos o usarse para el comercio local. Estas funciones hacen de Blink más que una billetera — es una capa de infraestructura económica local. El framework open-source de Galoy también provee APIs para desarrolladores, con plugins para BTCPay Server y WooCommerce, permitiendo que cualquier negocio integre pagos Bitcoin Lightning.'
		},
		{
			heading: '¿Es Blink Wallet Custodial o de Autocustodia?',
			body: 'Blink Wallet usa un modelo custodial, lo que significa que tu Bitcoin en Lightning es sostenido por la infraestructura de Blink en lugar de estar en una billetera de autocustodia donde tú controlas las claves privadas. Este compromiso permite una experiencia de usuario más simple, transacciones instantáneas y menores barreras para nuevos usuarios — no necesitas manejar seed phrases ni preocuparte por la capacidad de canales. Para principiantes en El Salvador y Latinoamérica, este enfoque custodial elimina la fricción y hace que los pagos Bitcoin sean prácticos. Sin embargo, usuarios experimentados que prefieren la autocustodia completa pueden querer combinar Blink con una billetera de autocustodia como Aqua o una billetera de hardware para ahorros, usando Blink principalmente para gastos y transacciones diarias.'
		},
		{
			heading: '¿En Qué Idiomas Está Disponible Blink Wallet?',
			body: 'Blink Wallet está disponible en seis idiomas: inglés, español, francés, alemán, turco y portugués brasileño. Este soporte multilingüe refleja el enfoque de la billetera en la adopción global de Bitcoin más allá de los mercados anglófonos. El soporte en español es particularmente robusto, dado los orígenes de la billetera en El Salvador y su fuerte presencia en toda Latinoamérica. La interfaz, documentación de soporte y mensajes in-app están todos localizados, haciendo que Blink sea accesible para usuarios que prefieren interactuar en su idioma nativo.'
		},
		{
			heading: '¿Cómo se Compara Blink Wallet con Aqua Wallet para Gastos Diarios?',
			body: 'Blink y Aqua sirven al mercado latinoamericano pero con enfoques diferentes. Blink es custodial y está enfocada en Lightning, optimizada para simplicidad y pagos a comerciantes — ideal para gastos diarios donde la facilidad de uso es lo más importante. Aqua es de autocustodia y multi-red (Bitcoin, Liquid, Lightning), mejor para usuarios que quieren control de claves y acceso a stablecoins. El saldo en dólares y las herramientas POS de Blink lo hacen superior para adopción por comerciantes. El soporte de USDt en Liquid de Aqua lo hace mejor para guardar stablecoins. Muchos usuarios en El Salvador mantienen ambos: Blink para gastos y pagos a comerciantes, Aqua para ahorros y tenencias de stablecoins. Ambas son gratis de descargar.'
		},
		{
			heading: '¿Pueden los Desarrolladores Construir sobre Blink Wallet?',
			body: 'Sí. Blink está construida sobre el framework open-source de Galoy, que provee APIs para desarrolladores para integrar pagos Bitcoin Lightning en sus propias aplicaciones. Hay plugins existentes para BTCPay Server y WooCommerce, permitiendo que tiendas en línea acepten pagos Lightning a través de la infraestructura de Blink. El framework de Galoy también soporta despliegues personalizados, permitiendo que comunidades y negocios ejecuten sus propias instancias de Blink. Este enfoque open-source ha convertido a Blink en una de las plataformas de pago Bitcoin más amigables para desarrolladores, con contribuciones activas de la comunidad y documentación.'
		}
	],
	faq: [
		{
			question: '¿Es Blink Wallet gratis de usar?',
			answer:
				'Blink Wallet es gratis de descargar y usar. Las tarifas de Lightning Network son mínimas — típicamente fracciones de centavo por transacción. No hay tarifas de suscripción ni cargos de mantenimiento de cuenta.'
		},
		{
			question: '¿Puedo comprar Bitcoin en Blink Wallet?',
			answer:
				'Sí, Blink soporta la compra de Bitcoin a través de servicios integrados. También puedes recibir pagos Lightning desde otras billeteras, exchanges o plataformas de pago. La disponibilidad de compra dentro de la app puede variar por país.'
		},
		{
			question: '¿Cuál es el monto mínimo que puedo enviar por Lightning con Blink?',
			answer:
				'Lightning Network soporta micro-transacciones — puedes enviar tan solo unos pocos satoshis (fracciones de centavo) a través de Blink. Esto lo hace ideal para propinas, compras pequeñas y micropagos.'
		},
		{
			question: '¿Blink Wallet está disponible fuera de El Salvador?',
			answer:
				'Sí, Blink Wallet está disponible globalmente. Aunque se originó en El Salvador y tiene fuerte adopción ahí, usuarios en cualquier país pueden descargar y usar Blink. El soporte multilingüe (EN, ES, FR, DE, TR, BR) refleja su alcance global.'
		},
		{
			question: '¿Está mi Bitcoin seguro en Blink Wallet?',
			answer:
				'Blink es una billetera custodial, lo que significa que el Bitcoin es sostenido por la infraestructura de Blink/Galoy en lugar de estar en tu billetera personal de autocustodia. Para montos de gasto diario, esto es conveniente y práctico. Para ahorros más grandes, considera transferir a una billetera de autocustodia como Aqua o una billetera de hardware.'
		},
		{
			question: '¿Funciona Blink con BitTasker?',
			answer:
				'Blink Wallet soporta pagos Lightning, que BitTasker usa para pagos instantáneos a freelancers. Puedes recibir tus ganancias de BitTasker directamente en tu Blink Wallet a través de Lightning Network.'
		}
	],
	bitTaskerCta: {
		heading: 'Recibe Pagos de Freelance por Lightning',
		body: 'BitTasker paga a freelancers instantáneamente por Lightning Network. Conecta tu Blink Wallet y recibe pagos en Bitcoin al momento de que tu trabajo sea aprobado.',
		buttonText: 'Únete a BitTasker Hoy',
		buttonHref: '/auth/signup'
	}
};
