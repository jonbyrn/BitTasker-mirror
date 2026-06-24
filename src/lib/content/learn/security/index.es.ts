import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Seguridad y Confianza: Protege Tu Freelancing con Bitcoin',
		subtitle:
			'Seguridad de billeteras, prevención de estafas, autocustodia y señales de confianza — todo para mantenerte seguro.'
	},
	answerBlock:
		'La seguridad es la base de ganar y mantener Bitcoin. Esta guía cubre todo desde seguridad de billeteras y mejores prácticas de autocustodia hasta prevención de estafas y señales de confianza en plataformas de freelancing. Ya seas nuevo en Bitcoin o un holder experimentado, entender cómo proteger tus claves privadas, verificar la confiabilidad de plataformas y evitar ataques comunes es esencial. BitTasker está construido sobre contratos inteligentes auditables e identidad basada en Nostr — pero la seguridad empieza contigo. Aprende los marcos, herramientas y hábitos que mantienen tu Bitcoin seguro.',
	sections: [
		{
			heading: '¿Es seguro BitTasker?',
			body: 'BitTasker está construido sobre tres pilares de seguridad: escrow con contratos inteligentes de Rootstock minados junto con Bitcoin, identidad descentralizada basada en Nostr y pagos de autocustodia vía Lightning. Los fondos de escrow están bloqueados en contratos inteligentes auditables — no en la cuenta bancaria de BitTasker. Tu identidad es un par de claves criptográficas que tú controlas, no un email/contraseña vinculado a una base de datos central. Los pagos fluyen directamente a tu billetera vía Lightning. La plataforma cobra una tarifa del 5% y usa reglas transparentes enforceadas por código. BitTasker no puede congelar tu cuenta ni retener tus fondos. Sin embargo, la cripto conlleva riesgos inherentes: volatilidad del precio de Bitcoin, riesgo de ejecución de contratos inteligentes e irreversibilidad de transacciones.'
		},
		{
			heading: 'Fundamentos de seguridad de billeteras',
			body: 'Tu billetera es tu banco. Las wallets hardware (Coldcard, Trezor, BitBox) almacenan claves privadas offline en chips resistentes a la manipulación — el estándar de oro para la seguridad de Bitcoin. Las wallets software (Sparrow, Electrum) ofrecen funciones avanzadas para usuarios de escritorio. Las wallets móviles (Aqua, Blink) brindan conveniencia para el gasto diario. La regla crítica: nunca almacenes más que dinero de gasto en un dispositivo conectado a internet. Usa un enfoque de dos niveles: wallet hardware para ahorros, wallet móvil para gasto. Siempre respalda tu seed phrase en acero (no en papel), almacénala en un lugar seguro y nunca la compartas con nadie. Para comparativas más profundas, consulta nuestra guía de seguridad de billeteras.'
		},
		{
			heading: 'Prevención de estafas para freelancers de Bitcoin',
			body: 'Las estafas de Bitcoin atacan a freelancers a través de ofertas falsas de clientes, enlaces de phishing e impersonificación. Los ataques comunes incluyen: clientes que solicitan pagos fuera de la plataforma (evitando la protección de escrow), emails de phishing disfrazados de notificaciones de la plataforma, apps de billetera falsas que roban seed phrases y ataques de ingeniería social en Nostr. La mejor defensa: nunca muevas pagos fuera de la plataforma, verifica direcciones de billetera a través de múltiples canales, nunca compartas tu seed phrase y usa wallets hardware para firmar transacciones. Si una oferta parece demasiado buena para ser verdad, lo es. Nuestra guía de evitar estafas cubre cada vector de ataque principal en detalle.'
		},
		{
			heading: 'Autocustodia vs. custodio: ¿cuál es correcta para ti?',
			body: 'La autocustodia significa que tú controlas tus claves privadas — ninguna empresa puede congelar, perder o confiscar tu Bitcoin. Los servicios custodiales (exchanges, wallets custodiales) guardan tus claves por ti, ofreciendo conveniencia a costa de la confianza. El ethos de Bitcoin favorece la autocustodia: "no tus claves, no tus monedas." Para freelancers, la autocustodia a través de wallets Lightning te da acceso instantáneo a ganancias sin depender de un tercero. La compensación es responsabilidad — si pierdes tu seed phrase, tu Bitcoin se pierde para siempre. Nuestra comparativa de autocustodia vs. custodio te ayuda a decidir según tu comodidad técnica y el monto que mantienes.'
		},
		{
			heading: 'Seguridad de hardware para almacenamiento de Bitcoin',
			body: 'Las wallets hardware son dispositivos físicos que almacenan tus claves privadas en un elemento seguro — nunca exponiéndolas a internet. Las opciones principales incluyen Coldcard (air-gapped, solo Bitcoin, completamente open source), Trezor (open source, pantalla táctil, soporte de altcoins), BitBox (compacta, respaldo microSD) y Foundation Passport (firma air-gapped basada en QR). Para máxima seguridad, usa una wallet hardware con passphrase BIP39 y almacena tu respaldo de seed en acero. Las wallets hardware protegen contra malware, phishing y ataques remotos — incluso si tu computadora está comprometida, tus claves permanecen seguras en el dispositivo. Nuestra guía de seguridad de hardware proporciona comparativas detalladas e instrucciones de configuración.'
		},
		{
			heading: 'Cómo se compara la seguridad de BitTasker con plataformas tradicionales',
			body: 'Las plataformas tradicionales de freelancing (Upwork, Fiverr) custodian tus fondos en cuentas bancarias de la empresa — pueden congelar cuentas, retrasar retiros y cobrar 10–20% en comisiones. BitTasker usa escrow descentralizado en Rootstock, pagos de autocustodia vía Lightning e identidad Nostr. Tus fondos existen en contratos inteligentes, no en cuentas corporativas. Tu identidad es un par de claves, no un email/contraseña. La comparación es clara: las plataformas tradicionales ofrecen conveniencia y soporte fiat; BitTasker ofrece soberanía, comisiones más bajas (5%) y pagos instantáneos. La elección depende de si priorizas la conveniencia custodial o el control descentralizado.'
		}
	],
	faq: [
		{
			question: '¿Es seguro BitTasker para freelancers?',
			answer:
				'Sí. BitTasker usa contratos inteligentes de Rootstock auditados para escrow, Nostr para identidad y Lightning para pagos. Los fondos de escrow están bloqueados en código, no retenidos por BitTasker. Tu identidad es un par de claves que tú controlas. Sin embargo, eres responsable de la seguridad de tu propia billetera.'
		},
		{
			question: '¿Cuál es la práctica de seguridad más importante para Bitcoin?',
			answer:
				'Proteger tu seed phrase. Almacénala en acero (resistente a fuego y agua), en un lugar seguro y nunca la compartas con nadie. Usa una wallet hardware para montos significativos. Tu seed phrase es la clave maestra de todo tu Bitcoin — pierdela, y tus fondos se pierden para siempre.'
		},
		{
			question: '¿Cómo evito estafas de Bitcoin?',
			answer:
				'Nunca muevas pagos fuera de la plataforma. Nunca compartas tu seed phrase. Verifica direcciones de billetera a través de múltiples canales. Usa wallets hardware para firmar. Si una oferta parece demasiado buena para ser verdad, lo es. Sé escéptico de ofertas no solicitadas e intentos de phishing.'
		},
		{
			question: '¿Debería usar autocustodia o una wallet custodial?',
			answer:
				'La autocustodia te da control total pero requiere responsabilidad. Las wallets custodiales son convenientes pero requieren confiar en un tercero. Para tenencias significativas de Bitcoin, se recomienda autocustodia con wallet hardware. Para montos pequeños, una wallet Lightning custodial puede ser aceptable.'
		},
		{
			question: '¿Puede BitTasker congelar mi cuenta?',
			answer:
				'No. BitTasker no puede congelar tu identidad Nostr ni impedirte recibir pagos. Tu identidad es un par de claves criptográficas que tú controlas. La plataforma puede restringir acceso a su interfaz, pero tu billetera y capacidad de pago permanecen intactas.'
		},
		{
			question: '¿Qué pasa si BitTasker cierra?',
			answer:
				'Tu Bitcoin está seguro. Los fondos en escrow están en contratos inteligentes de Rootstock, no en la cuenta bancaria de BitTasker. Tu identidad y datos de reputación en Nostr persisten en relays descentralizados. Puedes interactuar con los contratos inteligentes directamente o importar tu identidad a otra plataforma.'
		}
	],
	bitTaskerCta: {
		heading: 'Trabaja con Confianza en BitTasker',
		body: 'Contratos inteligentes auditados, identidad Nostr y pagos de autocustodia protegen tus ganancias. Aprende las prácticas de seguridad que mantienen tu Bitcoin seguro, y luego empieza a ganar.',
		buttonText: 'Comienza Ahora',
		buttonHref: '/auth/signup'
	}
};
