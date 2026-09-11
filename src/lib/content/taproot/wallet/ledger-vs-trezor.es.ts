import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Ledger vs Trezor: ¿Cuál es Mejor Billetera Hardware?',
		subtitle:
			'Comparación honesta y lado a lado de las dos billeteras de hardware más populares en 2026'
	},
	answerBlock:
		'Ledger y Trezor son los nombres más reconocidos en billeteras de hardware para Bitcoin, pero atienden prioridades diferentes. Ledger usa un chip de elemento seguro certificado (SE) para almacenar claves privadas sin conexión, ofrece más dispositivos (Nano S Plus, Nano X, Stax) y soporta más criptomonedas. Trezor adopta un enfoque open source sin chip de elemento seguro, haciendo su código completamente auditable pero potencialmente más vulnerable a ataques físicos. Ambos mantienen tus claves offline y soportan seed phrases BIP39. Para usuarios enfocados exclusivamente en Bitcoin que priorizan la transparencia, Trezor Model T es mejor. Para usuarios multi-moneda que quieren un chip resistente a manipulaciones, Ledger gana. Cualquiera es mucho más seguro que mantener crypto en un exchange.',
	sections: [
		{
			heading: '¿Cuáles son las diferencias principales entre Ledger y Trezor?',
			body: 'La diferencia fundamental es la arquitectura. Ledger almacena las claves privadas en un elemento seguro certificado (ST33 o ST31), el mismo tipo de chip usado en pasaportes y tarjetas de crédito. Trezor no usa un elemento seguro — depende del procesador STM32 principal, que es completamente open source pero teóricamente más expuesto a ataques físicos de canal lateral. El código de Ledger es parcialmente cerrado (el firmware del elemento seguro es propietario), mientras que Trezor es 100% open source. En la práctica, Ledger tiene una gama más amplia de productos (Nano S Plus a $79, Nano X a $149, Stax a $279), mientras que Trezor ofrece el Model One ($69) y Model T ($219). Ambos soportan seed phrases BIP39, derivación de claves BIP32/BIP44 y una amplia gama de criptomonedas — aunque Ledger soporta más de 5,500 monedas mientras Trezor soporta alrededor de 9,000 tokens a través de wallets de terceros.'
		},
		{
			heading: '¿Cuál es más seguro, Ledger o Trezor?',
			body: 'Ambas billeteras son altamente seguras para uso normal, pero los modelos de seguridad difieren. El chip de elemento seguro de Ledger resiste ataques de extracción física — un atacante con tiempo ilimitado y equipo de laboratorio costoso aún tendría dificultades para extraer claves de un Ledger. La falta de elemento seguro de Trezor significa que un atacante sofisticado con acceso físico podría potencialmente usar glitching de voltaje o análisis electromagnético para extraer la seed. Esto fue demostrado en un ataque de 2020 al Trezor Model One. Sin embargo, el firmware completamente open source de Trezor significa que cualquiera puede auditar todo el código, mientras que el código del elemento seguro de Ledger no es públicamente auditable. Para la mayoría de usuarios que se protegen contra ataques remotos (malware, phishing), ambas billeteras son igualmente seguras — la clave privada nunca sale del dispositivo.'
		},
		{
			heading: '¿Cuánto cuesta un Ledger o Trezor?',
			body: 'Precios de Ledger: Nano S Plus ($79) es la opción económica con USB-C y 128KB de memoria, soportando hasta 100 apps simultáneamente. Nano X ($149) agrega conectividad Bluetooth y 2MB de memoria. Stax ($279) presenta pantalla E Ink y carga inalámbrica. Precios de Trezor: Model One ($69) es la opción más económica con pantalla OLED pequeña. Model T ($219) presenta pantalla táctil a color y ranura microSD. Safe 3 ($79) es la nueva opción económica de Trezor con elemento seguro. Safe 5 ($169) tiene pantalla táctil a color con retroalimentación háptica. Para usuarios exclusivamente de Bitcoin, tanto el Ledger Nano S Plus como el Trezor Model One ofrecen excelente valor por menos de $100.'
		},
		{
			heading: '¿Cuál soporta más criptomonedas?',
			body: 'Ambos soportan Bitcoin, Ethereum y las principales altcoins nativamente. Ledger Live gestiona más de 5,500 tokens y monedas directamente, incluyendo soporte nativo para staking, DeFi y NFTs. Trezor Suite soporta menos monedas nativamente (~9) pero se integra con wallets de terceros como MetaMask, Exodus y Electrum para extender la compatibilidad a miles de tokens. Para usuarios exclusivamente de Bitcoin, ambas billeteras soportan todas las funciones de Bitcoin (Taproot, PSBT, CoinJoin a través de terceros). Si necesitas soporte extenso de altcoins con una interfaz pulida, Ledger tiene ventaja. Si priorizas transparencia máxima y usas Bitcoin principalmente, el enfoque open source de Trezor es atractivo.'
		},
		{
			heading: '¿Cuál funciona mejor con BitTasker?',
			body: 'Ambas funcionan con BitTasker para recibir pagos en Bitcoin. Usa Ledger Live o Trezor Suite para generar tu dirección de recepción, luego pégala en tu perfil de BitTasker. Para pagos Lightning, ambas requieren una wallet Lightning de acompañamiento (como Aquawallet o Blink) ya que ninguna soporta Lightning nativamente. El flujo recomendado: mantén tus ahorros a largo plazo en la wallet hardware, y usa una wallet Lightning para ganancias diarias de BitTasker y gastos. Ambas soportan el estándar PSBT, que funciona con Sparrow Wallet para flujos avanzados de Bitcoin.'
		}
	],
	faq: [
		{
			question: '¿Es Ledger más seguro que Trezor?',
			answer:
				'Para ataques físicos, sí — el chip de elemento seguro de Ledger hace la extracción de claves significativamente más difícil. Para ataques remotos (malware, phishing), ambas son igualmente seguras ya que las claves nunca salen del dispositivo.'
		},
		{
			question: '¿Cuál es más barato, Ledger o Trezor?',
			answer:
				'Las opciones más accesibles son similares: Ledger Nano S Plus cuesta $79 y Trezor Safe 3 cuesta $79. El Trezor Model One más económico es $69. Los dispositivos premium van de $149 (Nano X) a $279 (Ledger Stax).'
		},
		{
			question: '¿Puedo usar Ledger o Trezor con BitTasker?',
			answer:
				'Sí, ambas funcionan con BitTasker. Genera una dirección de recepción de Bitcoin usando Ledger Live o Trezor Suite, luego agrégala a tu perfil de BitTasker para pagos on-chain. Para pagos Lightning, combina tu wallet hardware con una wallet Lightning.'
		},
		{
			question: '¿Trezor es completamente open source?',
			answer:
				'Sí, Trezor es 100% open source — tanto el firmware como los diseños de hardware están disponibles públicamente en GitHub. Ledger es parcialmente open source: las apps complementarias son open, pero el firmware del elemento seguro es propietario.'
		},
		{
			question: '¿Dónde puedo comprar un Ledger o Trezor?',
			answer:
				'Compra directamente en ledger.com (Ledger) o trezor.io (Trezor) para asegurar recibir un dispositivo genuino sin manipulaciones. Evita Amazon, eBay y revendedores no autorizados.'
		},
		{
			question: '¿Ledger o Trezor soportan Lightning Network?',
			answer:
				'Ninguna wallet hardware soporta Lightning nativamente. Ambas están diseñadas para almacenamiento en frío on-chain. Usa una wallet Lightning (como Aquawallet, Blink o Phoenix) para pagos Lightning.'
		},
		{
			question: '¿Qué pasa si pierdo mi Ledger o Trezor?',
			answer:
				'Tu Bitcoin está seguro si tienes tu seed phrase de 24 palabras. Compra un nuevo dispositivo y recupera tu wallet usando la seed phrase. El dispositivo es solo una herramienta de firma — tus claves se derivan de la seed, no se almacenan exclusivamente en el hardware.'
		}
	],
	bitTaskerCta: {
		heading: 'Protege Tus Ganancias de BitTasker con una Wallet Hardware',
		body: 'Gana Bitcoin en BitTasker, luego mueve tus ahorros a un Ledger o Trezor para almacenamiento seguro offline. Mantén una wallet Lightning para gastos diarios.',
		buttonText: 'Empieza Ahora',
		buttonHref: '/auth/signup'
	}
};
