import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Coldcard: Guía Completa del Hardware Wallet Bitcoin',
		subtitle:
			'El cold storage Bitcoin más seguro y air-gapped — completamente open source, fabricado por Coinkite desde 2017.'
	},
	answerBlock: `El Coldcard es un hardware wallet exclusivo para Bitcoin fabricado por Coinkite, diseñado para máxima seguridad mediante operación air-gapped. Utiliza dos elementos de seguridad duales (Microchip ATECC608 y Maxim DS28C36B) para proteger tus claves privadas, y nunca se conecta a internet. Las transacciones se firman mediante tarjeta MicroSD usando Partially Signed Bitcoin Transactions (PSBTs, BIP174), lo que lo hace inmune a ataques remotos. El Coldcard Q (~$200) cuenta con teclado QWERTY completo y escáner QR integrado, mientras que el Mk5 (~$150) ofrece un teclado numérico compacto. Ambos modelos admiten passphrases BIP39, PINs de duress y PINs de ladrillo para seguridad física. Con firmware completamente open source y compilaciones verificables, el Coldcard es ampliamente considerado el estándar de oro para el almacenamiento en frío de Bitcoin.`,
	sections: [
		{
			heading: '¿Qué hace diferente al Coldcard de otros hardware wallets?',
			body: `El Coldcard se distingue de competidores como Ledger y Trezor en tres aspectos críticos. Primero, es estrictamente solo para Bitcoin — no soporta Ethereum, Solana ni ninguna altcoin. Esta limitación deliberada reduce drásticamente la superficie de ataque, ya que el firmware no necesita manejar docenas de protocolos criptográficos. Segundo, el Coldcard es completamente air-gapped por defecto. A diferencia de billeteras que requieren conexión USB o Bluetooth a una computadora o teléfono, el Coldcard se comunica exclusivamente mediante tarjetas MicroSD, NFC o códigos QR. Esto significa que no existe una ruta física de datos para que el malware explote. Tercero, Coinkite utiliza dos elementos de seguridad duales — el Microchip ATECC608A y el Maxim DS28C36B — proporcionando dos capas independientes de protección criptográfica para tus claves. La combinación de enfoque solo Bitcoin, diseño air-gapped y hardware de seguridad redundante hace del Coldcard uno de los hardware wallets para Bitcoin más robustos disponibles para consumidores.`
		},
		{
			heading: '¿Cómo funciona la firma air-gapped del Coldcard?',
			body: `La firma air-gapped es la característica principal del Coldcard y la base de su modelo de seguridad. Así funciona: cuando quieres enviar Bitcoin, creas una transacción sin firmar en tu computadora (usando Sparrow Wallet o Electrum), la guardas como archivo PSBT en una tarjeta MicroSD e insertas la tarjeta en el Coldcard. El dispositivo muestra los detalles de la transacción en su pantalla para que los verifiques — dirección del destinatario, monto, comisiones y cambio. Una vez que apruebas, el Coldcard firma la transacción criptográficamente usando tu clave privada, que nunca sale del elemento de seguridad. Retiras la MicroSD, la conectas de nuevo a tu computadora y transmites la transacción firmada a la red Bitcoin. El Coldcard Q también soporta flujos de PSBT basados en código QR, permitiéndote escanear transacciones sin firmar con su cámara integrada y mostrar transacciones firmadas como códigos QR para dispositivos air-gapped como billeteras móviles. La firma por NFC también está disponible, agregando una tercera opción sin contacto. En ningún momento el Coldcard se conecta a internet, a una computadora o a cualquier dispositivo en red.`
		},
		{
			heading: 'Coldcard Q vs Mk5: ¿Qué modelo debo comprar?',
			body: `Coinkite ofrece dos modelos de Coldcard, cada uno dirigido a diferentes perfiles de usuario. El Coldcard Mk5 ($149.87) es el modelo clásico — un dispositivo compacto con teclado numérico, una pequeña pantalla OLED y firma basada en MicroSD. Es la opción probada para usuarios que quieren simplicidad en cold storage y no les importa escribir passphrases en un teclado numérico. El Coldcard Q ($214.87) es el modelo premium, con teclado QWERTY completo, pantalla más grande, escáner de código QR integrado y batería recargable. El Q es ideal para usuarios que quieren flujos de PSBT basados en QR, planean usarlo como dispositivo de firma móvil o simplemente prefieren una experiencia de ingreso más cómoda. Ambos modelos comparten la misma arquitectura dual de elementos de seguridad, firmware open source y soporte para passphrases BIP39 y PINs de truco. El Q también incluye una función enfocada en privacidad: puede generar un par de claves efímero fresco para cada transacción QR, previniendo correlación de direcciones. Si principalmente usas Sparrow Wallet en escritorio y quieres la opción más asequible, el Mk5 es excelente. Si quieres máxima flexibilidad con flujos QR y NFC, el Q vale la pena el extra.`
		},
		{
			heading: 'Funciones de seguridad del Coldcard: PINs de truco, modo duress y passphrases',
			body: `El Coldcard ofrece varias funciones avanzadas de seguridad que van más allá de los hardware wallets estándar. El sistema de PINs de truco te permite configurar múltiples códigos PIN con diferentes comportamientos. Un PIN de duress, cuando se ingresa, carga una billetera decoy con un saldo pequeño — si alguien te obliga a desbloquear el dispositivo, verán una billetera plausible pero insignificante. Un PIN de ladrillo destruye permanentemente el elemento de seguridad, inutilizando el dispositivo y protegiendo tus claves del secuestro físico. También puedes establecer un temporizador de cuenta regresiva de inicio de sesión, que retrasa el acceso por un período configurable (hasta 28 días), dándote tiempo para mover fondos si el dispositivo es robado. Los passphrases BIP39 agregan una palabra adicional a tu frase semilla, creando jerarquías de billetera completamente separadas. Esto te permite mantener una configuración de "negación plausible" donde una passphrase lleva a una billetera pequeña visible y otra lleva a tus fondos principales. La carcasa transparente de policarbonato del Coldcard también cumple un propósito de seguridad — puedes inspeccionar visualmente la placa de circuito en busca de signos de manipulación física antes de usar el dispositivo.`
		},
		{
			heading: 'Compatibilidad de software del Coldcard: Sparrow, Electrum y más',
			body: `A diferencia de Ledger y Trezor, que requieren sus propias aplicaciones companion propietarias, el Coldcard funciona con billeteras Bitcoin open source en las que ya confías. Sparrow Wallet es la principal companion recomendada — proporciona una billetera Bitcoin de escritorio con todas las funciones, soporte PSBT, integración CoinJoin y gestión avanzada de UTXOs. Electrum es otra opción bien soportada, ofreciendo funcionalidad ligera de billetera Bitcoin con integración Coldcard. Para usuarios móviles, las capacidades de código QR del Coldcard Q funcionan con apps como Nunchuk y BlueWallet, permitiendo flujos de firma móviles completamente air-gapped. El Coldcard también se integra con Wasabi Wallet para usuarios interesados en privacidad basada en CoinJoin. Todas estas billeteras companion son open source, y ninguna te requiere crear una cuenta o compartir información personal. Este modelo de compatibilidad abierta significa que la seguridad de tu Bitcoin no depende del software de una sola empresa — puedes cambiar de billetera companion en cualquier momento sin afectar tu configuración de cold storage.`
		},
		{
			heading: 'Cómo configurar un Coldcard por primera vez',
			body: `Configurar un Coldcard es sencillo pero requiere atención cuidadosa a las mejores prácticas de seguridad. Enciende el dispositivo y navega al menú de seguridad para generar una nueva frase semilla. El Coldcard mostrará un mnemonic BIP39 de 24 palabras en su pantalla — escribe estas palabras en papel (nunca las fotografíes ni las almacenes digitalmente). El dispositivo luego te pedirá que verifiques palabras específicas de la secuencia para confirmar que las registraste correctamente. A continuación, establece tu PIN principal y opcionalmente configura un PIN de duress y un PIN de ladrillo. Si planeas usar un passphrase BIP39, configúralo ahora — recuerda que olvidar tu passphrase significa perder el acceso a esos fondos permanentemente. Inserta una tarjeta MicroSD y exporta las claves públicas de tu billetera, luego impórtalas en Sparrow Wallet o Electrum en tu computadora. Esto le da a tu billetera companion acceso de solo lectura para ver saldos y generar transacciones sin firmar. El Coldcard nunca comparte sus claves privadas con ningún software — solo firma transacciones que apruebas en su pantalla física. Para máxima seguridad, genera la semilla en un lugar libre de cámaras, y considera usar la función de "generación de palabras semilla" del Coldcard que te permite aportar entropía mediante lanzamientos de dados para aleatoriedad adicional.`
		},
		{
			heading: '¿Es el Coldcard open source? Verificabilidad y confianza',
			body: `Sí, el Coldcard es completamente open source — tanto el firmware como los diseños de hardware están disponibles públicamente en GitHub. Coinkite publica el código fuente completo del firmware del Coldcard, incluyendo todas las implementaciones criptográficas, interacciones con el elemento de seguridad y lógica de firma de transacciones. Las compilaciones del firmware son reproducibles, lo que significa que partes independientes pueden compilar el código fuente y verificar que el binario resultante coincide con lo que se envía en el dispositivo. Esta verificabilidad es crítica: significa que no tienes que confiar en las afirmaciones de seguridad de Coinkite — tú o cualquier auditor pueden verificarlas. Los esquemas de hardware también son abiertos, para que investigadores de seguridad puedan examinar el diseño físico en busca de vulnerabilidades. Coinkite ha estado construyendo herramientas exclusivamente para Bitcoin desde 2013 y tiene una fuerte reputación en la comunidad Bitcoin por priorizar la seguridad sobre el marketing. El Coldcard ha sido auditado por empresas de seguridad externas y no tiene vulnerabilidades críticas conocidas en su implementación criptográfica. Este nivel de transparencia es raro en la industria de hardware wallets y es una razón clave por la que el Coldcard es confiado por titulares de Bitcoin técnicamente sofisticados.`
		}
	],
	faq: [
		{
			question: '¿Cuánto cuesta un Coldcard?',
			answer: `El Coldcard Mk5 tiene un precio de $149.87 USD y el Coldcard Q de $214.87 USD, ambos disponibles directamente en coinkite.com. El envío internacional está disponible para la mayoría de los países. También necesitarás una tarjeta MicroSD (8GB o más) y un adaptador MicroSD a USB para tu computadora, que típicamente cuestan menos de $10 en total.`
		},
		{
			question: '¿Dónde puedo comprar un Coldcard?',
			answer: `Compra directamente en el sitio web oficial de Coinkite (coinkite.com) para asegurarte de recibir un dispositivo genuino. Evita comprar en Amazon, eBay o distribuidores no autorizados, ya que los hardware wallets comprados de fuentes no autorizados pueden haber sido manipulados. Coinkite envía a todo el mundo desde su almacén.`
		},
		{
			question: '¿El Coldcard funciona con MetaMask o Ethereum?',
			answer: `No. El Coldcard es un hardware wallet exclusivo para Bitcoin. No soporta Ethereum, tokens ERC-20 ni ninguna otra criptomoneda. Esto es intencional — limitar el dispositivo solo a Bitcoin reduce la superficie de ataque y permite a Coinkite enfocarse exclusivamente en la seguridad de Bitcoin. Si necesitas soporte para múltiples monedas, considera un Trezor o Ledger.`
		},
		{
			question: '¿Es seguro el Coldcard para almacenamiento a largo plazo de Bitcoin?',
			answer: `Sí, el Coldcard es ampliamente considerado una de las opciones más seguras para cold storage de Bitcoin a largo plazo. Su diseño air-gapped significa que las claves privadas nunca tocan un dispositivo en red, los dos elementos de seguridad duales proporcionan protección redundante, y funciones como PINs de duress y PINs de ladrillo agregan capas de seguridad física. Combinado con un passphrase BIP39 almacenado por separado, el Coldcard proporciona cold storage de nivel institucional.`
		},
		{
			question: '¿Puedo usar el Coldcard con Sparrow Wallet?',
			answer: `Sí, Sparrow Wallet es la principal billetera companion recomendada para el Coldcard. Sparrow es una billetera Bitcoin de escritorio open source que soporta flujos completos de PSBT, making ideal para la firma air-gapped con el Coldcard. Importa las claves públicas del Coldcard en Sparrow para ver saldos y crear transacciones sin firmar.`
		},
		{
			question: '¿Qué pasa si pierdo mi Coldcard?',
			answer: `Tu Bitcoin está seguro siempre que tengas tu frase semilla de 24 palabras y cualquier passphrase BIP39 que hayas usado. Simplemente compra un nuevo Coldcard (o cualquier hardware wallet compatible con BIP39) y recupera tu billetera usando la frase semilla. El Coldcard en sí es solo un dispositivo de firma — tus claves se derivan de la frase semilla, no se almacenan exclusivamente en el dispositivo.`
		},
		{
			question: '¿El Coldcard soporta Lightning Network?',
			answer: `No, el Coldcard no soporta transacciones de Lightning Network directamente. Está diseñado para cold storage en cadena de Bitcoin. Para funcionalidad Lightning, puedes usar una billetera de software compatible con Lightning (como Aquawallet o Blink) para transacciones del día a día mientras mantienes tus ahorros a largo plazo en el Coldcard.`
		}
	],
	bitTaskerCta: {
		heading: 'Protege tus ganancias en Bitcoin con Coldcard',
		body: `Cuando ganas Bitcoin en BitTasker, mueve tus ahorros a largo plazo a un Coldcard para cold storage air-gapped. Mantén un saldo menor en una billetera de software para gastos diarios y escrow en la plataforma.`,
		buttonText: 'Comenzar',
		buttonHref: '/auth/signup'
	}
};
