import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Autocustodia de Bitcoin: Guía Completa para Principiantes',
		subtitle: 'Aprende a mantener tus propias claves Bitcoin — la base de la soberanía financiera'
	},
	answerBlock:
		'La autocustodia significa mantener tus propias claves privadas de Bitcoin en lugar de confiar en un exchange o tercero. Cuando practicas autocustodia, controlas una billetera (hardware o software) que almacena las claves criptográficas que demuestran la propiedad de tu Bitcoin. Nadie puede congelar, incautar o restringir tu acceso. La contrapartida es responsabilidad total: si pierdes tu seed phrase, no hay soporte técnico que pueda recuperar tus fondos. La autocustodia se logra a través de una billetera que genera una seed phrase de 24 palabras (mnemónica BIP39), la cual deriva todas tus direcciones y claves privadas de Bitcoin. Las billeteras de hardware (Coldcard, Ledger, Trezor) ofrecen la máxima seguridad para autocustodia. Las billeteras de software (Sparrow, Aquawallet) ofrecen comodidad.',
	sections: [
		{
			heading: '¿Por qué deberías practicar autocustodia con tu Bitcoin?',
			body: 'La autocustodia es la característica definitoria de Bitcoin: "no tus claves, no tus monedas." Cuando tu Bitcoin está en un exchange como Coinbase o Binance, mantienes un IOU — el exchange controla las claves reales. Si el exchange es hackeado (Mt. Gox perdió 850,000 BTC en 2014), quiebra (FTX colapsó en 2022), congela tu cuenta o es presionado por reguladores para restringir retiros, pierdes el acceso a tus fondos. La autocustodia elimina todos estos riesgos. Tu Bitcoin existe en la blockchain, y solo tu clave privada puede autorizar el gasto. Ningún gobierno, empresa o individuo puede evitar que muevas tu Bitcoin. Para freelancers que ganan Bitcoin en plataformas como BitTasker, la autocustodia asegura que tus ganancias te pertenezcan a ti.'
		},
		{
			heading: '¿Qué es una seed phrase y por qué importa?',
			body: 'Una seed phrase (también llamada frase mnemónica o frase de recuperación) es una lista de 12 o 24 palabras generadas por tu billetera durante la configuración. Estas palabras son una representación legible para humanos de tu clave maestra privada — la clave maestra de la cual se derivan todas tus direcciones y claves privadas de Bitcoin. La seed phrase sigue el estándar BIP39, lo que significa que cualquier billetera compatible con BIP39 puede recuperar tus fondos usando esas palabras. Si tu billetera de hardware se rompe, pierde o roban, ingresa la seed phrase en una nueva billetera y todo tu Bitcoin reaparece. Por esto la seguridad de la seed phrase es el aspecto más importante de la autocustodia. Cualquiera que obtenga tu seed phrase puede robar todo tu Bitcoin. Nunca la almacenes digitalmente, nunca la ingreses en ningún sitio web, y nunca la compartas con nadie.'
		},
		{
			heading: 'Billeteras de hardware vs software para autocustodia',
			body: 'Las billeteras de hardware (Coldcard, Ledger, Trezor, BitBox02) almacenan tus claves privadas en un dispositivo físico dedicado que nunca las expone a internet. Son ideales para almacenar cantidades significativas de Bitcoin a largo plazo. Las billeteras de software (Sparrow Wallet, Electrum, Aquawallet) almacenan claves en tu computadora o teléfono, haciéndolas convenientes para gastos diarios pero más vulnerables a malware y hackeos. El enfoque recomendado es un sistema escalonado: mantén tus ahorros en una billetera de hardware en almacenamiento en frío, y un saldo más pequeño para gastos en una billetera de software en tu teléfono o computadora.'
		},
		{
			heading: 'Cómo respaldar tu seed phrase de forma segura',
			body: 'El estándar de oro para el respaldo de seed phrase es un enfoque de tres capas. Capa 1: Escribe las 24 palabras en papel (nunca las fotografíes). Guarda el papel en un lugar seguro como una caja de seguridad a prueba de fuego. Capa 2: Graba o graba las palabras en un dispositivo de respaldo de acero (Coldcard Steel Wallet, Billfodl o Cryptosteel). El acero sobrevive incendios, inundaciones y daños físicos que destruyen el papel. Capa 3: Considera separación geográfica — guarda un respaldo en una ubicación física diferente a tu copia principal. Para passphrases BIP39 (una palabra 25ª opcional), almacena la passphrase separadamente de las palabras de la seed — si ambas se encuentran juntas, tu seguridad está comprometida.'
		},
		{
			heading: 'Errores comunes de autocustodia que debes evitar',
			body: 'El error más común es almacenar la seed phrase digitalmente — fotos en tu teléfono, notas en almacenamiento en la nube o entradas en gestores de contraseñas. Cualquier copia digital es vulnerable a hackeos, malware y filtraciones en la nube. El segundo error es usar una sola ubicación para el respaldo — un incendio, inundación o robo puede destruir tanto tu billetera como su respaldo simultáneamente. El tercero es ignorar la configuración de passphrase BIP39 — sin passphrase, cualquiera que encuentre tu seed phrase tiene acceso total. El cuarto es no verificar la billetera durante la compra — siempre compra billeteras de hardware directamente del fabricante. El quinto es no probar la recuperación — verifica periódicamente que tu respaldo es legible.'
		},
		{
			heading: '¿Cómo funciona la autocustodia con BitTasker?',
			body: 'BitTasker soporta autocustodia al permitirte recibir pagos de Bitcoin directamente en tu propia billetera. Cuando completas una tarea y te pagan, el Bitcoin llega a tu dirección personal — no a una cuenta custodial de la plataforma. Para pagos on-chain, proporciona una dirección de Bitcoin de tu billetera de hardware o Sparrow Wallet. Para pagos Lightning, usa una billetera Lightning (Aquawallet, Blink, Phoenix). BitTasker usa Bitcoin y Lightning para escrow, lo que significa que tus ganancias nunca permanecen en la plataforma. Una vez que el cliente libera el pago, llega a tu billetera en segundos (Lightning) o minutos (on-chain).'
		}
	],
	faq: [
		{
			question: '¿Es segura la autocustodia para principiantes?',
			answer:
				'Sí, con educación y preparación adecuadas. Comienza con una billetera de hardware de reputación (Ledger o Trezor), sigue las instrucciones de respaldo cuidadosamente y practica la recuperación con una cantidad pequeña antes de almacenar fondos significativos.'
		},
		{
			question: '¿Qué pasa si pierdo mi seed phrase?',
			answer:
				'Si pierdes tu seed phrase y tu billetera de hardware se rompe, tu Bitcoin es irrecuperable permanentemente. No hay restablecimiento de contraseña, ni soporte técnico, ni mecanismo de recuperación.'
		},
		{
			question: '¿Puedo recuperar mi Bitcoin si mi billetera de hardware se rompe?',
			answer:
				'Sí. Tu seed phrase es compatible con cualquier billetera — cualquier billetera de hardware o software compatible con BIP39 puede recuperar tus fondos. Compra un nuevo dispositivo, ingresa tu seed phrase y todo tu Bitcoin reaparece.'
		},
		{
			question: '¿Cuánto Bitcoin debo mantener en autocustodia?',
			answer:
				'La mayoría de expertos recomiendan mantener en autocustodia todo Bitcoin que planeas conservar a largo plazo. Mantén solo cantidades pequeñas en exchanges para trading o uso inmediato.'
		},
		{
			question: '¿Es legal la autocustodia?',
			answer:
				'Sí, la autocustodia es legal en prácticamente todos los países. Bitcoin es propiedad personal, y mantener tus propias claves es tu derecho. Algunos países tienen requisitos de reporte para grandes cantidades, pero el acto de autocustodia no está restringido.'
		},
		{
			question: '¿Qué es una passphrase BIP39?',
			answer:
				'Una passphrase BIP39 es una palabra 25ª opcional que se agrega a tu seed phrase. Crea una jerarquía de billetera completamente separada — ingresar una passphrase diferente revela diferentes direcciones y saldos. Esto proporciona deniabilidad plausible y una capa adicional de seguridad.'
		},
		{
			question: '¿Debo usar billetera de hardware o software?',
			answer:
				'Usa ambas. Una billetera de hardware (Coldcard, Ledger, Trezor) para ahorros a largo plazo. Una billetera de software (Sparrow, Aquawallet) para gastos diarios. Transfiere ahorros a hardware cuando tu saldo en software crezca.'
		}
	],
	bitTaskerCta: {
		heading: 'Controla Tus Ganancias con Autocustodia en BitTasker',
		body: 'BitTasker te paga directamente a tu billetera — ninguna plataforma mantiene tu Bitcoin. Combina autocustodia con BitTasker para ganar, recibir y controlar tu Bitcoin desde el primer día.',
		buttonText: 'Empieza a Ganar',
		buttonHref: '/auth/signup'
	}
};
