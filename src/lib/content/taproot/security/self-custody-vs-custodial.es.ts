import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Autocustodia vs Custodio: Wallets Bitcoin Explicadas',
		subtitle: 'Comprende los compromisos entre controlar tus propias claves y confiar en un tercero'
	},
	answerBlock:
		'La autocustodia significa que tú controlas tus claves privadas de Bitcoin — ninguna empresa, exchange o tercero puede acceder, congelar o perder tus fondos. La custodia significa que alguien más (un exchange, banco o proveedor de wallet) sostiene tus claves y controla tu acceso a Bitcoin. El principio central es "no son tus claves, no son tus monedas" — si no controlas las claves privadas, no posees verdaderamente el Bitcoin. La autocustodia ofrece máxima libertad y seguridad pero requiere responsabilidad personal. La custodia es más conveniente pero introduce riesgo de contraparte. La mayoría de bitcoiners experimentados usan autocustodia para ahorros y una wallet liviana para gastos diarios.',
	sections: [
		{
			heading: '¿Qué es la autocustodia y cómo funciona?',
			body: 'La autocustodia significa que generas y almacenas tus propias claves privadas de Bitcoin usando una wallet (hardware o software). Tus claves nunca salen de tu control. Cuando creas una wallet, recibes una seed phrase (típicamente 24 palabras) que deriva todas tus claves privadas. Esta seed phrase ES tu Bitcoin — cualquiera que la tenga puede gastar tus fondos. Con la autocustody, eres responsable de: generar y asegurar tu seed phrase, respaldarla de forma segura (respaldo de acero, separación geográfica), protegerla de robo, pérdida y daño, y manejar tus propias transacciones. Las herramientas que permiten la autocustodia incluyen wallets hardware (Coldcard, Trezor, BitBox, Passport) para máxima seguridad y wallets software (Sparrow, Aquawallet) para conveniencia.'
		},
		{
			heading: '¿Qué es Bitcoin custodial y cómo funciona?',
			body: 'La custodia significa que un tercero sostiene tus claves privadas de Bitcoin en tu nombre. Cuando compras Bitcoin en Coinbase, Binance o Cash App y lo dejas allí, esas plataformas sostienen tus claves. Confías en que protegerán tus fondos y honrarán tus solicitudes de retiro. Los servicios custodiales incluyen exchanges (Coinbase, Binance, Kraken), wallets custodiales (Cash App, Robinhood, PayPal) y wallets Lightning (Blink Wallet, Strike). El compromiso es claro: la custodia es conveniente (sin seed phrase que gestionar, recuperación de cuenta posible, facilita la conversión de fiat) pero introduce riesgo significativo. La plataforma puede ser hackeada, ir a la quiebra (Mt. Gox, FTX), congelar tu cuenta o ser obligada por gobiernos a incautar tus fondos.'
		},
		{
			heading: 'Ventajas y desventajas de la autocustodia',
			body: 'Ventajas: Máxima seguridad — ningún tercero puede hackear, congelar o perder tus claves. Control completo — nadie puede impedirte gastar tu Bitcoin. Resistencia a la censura — ningún gobierno o empresa puede incautar tus fondos. Privacidad — no se requiere KYC para autocustodia básica. Propiedad verdadera — "no son tus claves, no son tus monedas" se resuelve a tu favor. Desventajas: Responsabilidad personal — si pierdes tu seed phrase, tu Bitcoin se pierde para siempre. Sin recuperación de cuenta. Curva de aprendizaje — requiere entender seed phrases, wallets y prácticas de seguridad. Inconveniencia — ligeramente más lento que la custodia para uso diario. Seguridad física — debes proteger tu seed phrase de fuego, robo y daño.'
		},
		{
			heading: 'Ventajas y desventajas de la custodia de Bitcoin',
			body: 'Ventajas: Conveniencia — sin seed phrase que gestionar, login simple con email/password. Recuperación de cuenta — si olvidas tu contraseña, puedes restablecerla. Integración con fiat — fácil de comprar, vender y convertir a moneda local. Soporte al cliente — una empresa maneja los problemas por ti. Simplicidad — ideal para principiantes abrumados por la autocustodia. Desventajas: Riesgo de contraparte — la plataforma puede ser hackeada, ir a la quiebra o congelar tu cuenta. La historia muestra que esto no es teórico: Mt. Gox (2014, 850,000 BTC perdidos), QuadrigaCX (2019, $190M perdidos), FTX (2022, $8B de fondos de clientes perdidos). No son tus claves, no son tus monedas — confías en una empresa con tu riqueza. KYC y vigilancia — las plataformas custodiales recolectan tu identidad e historial de transacciones.'
		},
		{
			heading: '"No son tus claves, no son tus monedas" explicado',
			body: 'Esta frase encapsula el principio fundamental de propiedad de Bitcoin. Cuando sostienes Bitcoin en una plataforma custodial, tienes un IOU — una promesa de la empresa de pagarte Bitcoin cuando lo solicites. No controlas las claves privadas que autorizan el gasto en la blockchain. Si la empresa quiebra, es hackeada o decide congelar tu cuenta, tu Bitcoin es inaccesible. Cuando sostienes Bitcoin en una wallet de autocustodia, controlas las claves privadas. Tu Bitcoin está asegurado por criptografía, no por promesas de una empresa. Puedes gastarlo en cualquier momento sin permiso de nadie. Esta es la propiedad revolucionaria de Bitcoin: la capacidad de ser tu propio banco. La autocustodia no es solo una elección técnica — es la realización de la promesa original de soberanía financiera de Bitcoin.'
		},
		{
			heading: 'Cuándo usar autocustodia vs custodia',
			body: 'Usa autocustodia para: ahorros a largo plazo (cualquier cantidad que no puedas permitirte perder), Bitcoin que planeas sostener por meses o años, montos superiores a $500 que representan riqueza significativa, y cuando quieres máxima privacidad y resistencia a la censura. Usa custodia para: cantidades pequeñas de gasto diario (menos de $100), cuando estás aprendiendo sobre Bitcoin y aún no te sientes cómodo con seed phrases, conversiones rápidas de fiat a crypto, y pagos Lightning donde la conveniencia importa (Blink Wallet en El Salvador). La estrategia óptima para la mayoría: ahorros en wallet hardware (autocustodia), gasto en wallet móvil (autocustodial como Aqua, o custodial como Blink por conveniencia), y exchanges solo para comprar/vender — nunca para almacenamiento a largo plazo.'
		},
		{
			heading: 'Cómo BitTasker soporta la autocustodia',
			body: 'BitTasker está construido sobre principios de autocustodia. Tu identidad es un keypair Nostr que tú controlas — no un email/password en una base de datos de una empresa. Los pagos fluyen vía Lightning Network directamente a tu wallet conectada. La plataforma nunca custodia tus fondos. Para escrow, los smart contracts de RGB bloquean Bitcoin en código, no en cuentas bancarias de una empresa. Esto significa que BitTasker opera como una plataforma de autocustodia: tú controlas tu identidad, tus claves y tus fondos. El compromiso es responsabilidad — debes gestionar tu seed phrase de forma segura. Pero el beneficio es libertad: sin congelación de cuentas, sin retrasos de retiro, sin riesgo de contraparte de la plataforma.'
		}
	],
	faq: [
		{
			question: '¿Qué significa "no son tus claves, no son tus monedas"?',
			answer:
				'Significa que si no controlas las claves privadas de tu Bitcoin, no lo posees verdaderamente. Las plataformas custodiales sostienen tus claves y pueden congelar, perder o robar tus fondos. La autocustodia te da control total y responsabilidad.'
		},
		{
			question: '¿Es más segura la autocustodia que la custodia?',
			answer:
				'La autocustodia elimina el riesgo de contraparte pero te traslada la responsabilidad. Una wallet hardware bien asegurada con respaldo de acero es más segura que cualquier plataforma custodial. Una seed phrase mal gestionada es menos segura que un exchange de buena reputación.'
		},
		{
			question: '¿Qué pasa si pierdo mi seed phrase con autocustodia?',
			answer:
				'Tu Bitcoin se pierde permanentemente. No hay recuperación de cuenta, soporte al cliente ni restablecimiento de contraseña. Por eso los respaldos de acero, la separación geográfica y las passphrases BIP39 son críticas.'
		},
		{
			question: '¿Puede un exchange custodial congelar mi Bitcoin?',
			answer:
				'Sí. Las plataformas custodiales pueden congelar tu cuenta por razones de cumplimiento normativo, actividad sospechosa o a solicitud de autoridades gubernamentales.'
		},
		{
			question: '¿Cuál es mejor para principiantes?',
			answer:
				'Empieza con una wallet custodial como Blink por conveniencia mientras aprendes. Cuando te sientas cómodo, migra a autocustodia con una wallet hardware para ahorros.'
		},
		{
			question: '¿BitTasker mantiene mi Bitcoin?',
			answer:
				'No. BitTasker usa identidad Nostr (tú controlas tus claves) y pagos Lightning (los fondos fluyen directamente a tu wallet). Los fondos en escrow están bloqueados en smart contracts de RGB.'
		},
		{
			question: '¿Cuál es la diferencia entre wallets Lightning autocustodiales y custodiales?',
			answer:
				'Una wallet Lightning autocustodial (Aqua, Mutiny) te da control de las claves de tus canales. Una custodial (Blink, Strike) gestiona los canales por ti — más simple pero con riesgo de contraparte.'
		}
	],
	bitTaskerCta: {
		heading: 'Freelancing de Autocustodia con BitTasker',
		body: 'BitTasker está construido para la autocustodia. Tu identidad Nostr, tus claves, tu wallet, tu Bitcoin. Sin intermediario custodial entre tú y tus ganancias.',
		buttonText: 'Empieza Ahora',
		buttonHref: '/auth/signup'
	}
};
