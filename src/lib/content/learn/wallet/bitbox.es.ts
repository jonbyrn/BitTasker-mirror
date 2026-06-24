import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitBox02: Guía del Hardware Wallet Bitcoin Suizo',
		subtitle:
			'Seguridad de chip dual, elemento de seguridad EAL6+, backups en microSD y una elegante pantalla táctil — fabricado en Suiza por Shift Crypto.'
	},
	answerBlock: `El BitBox02 es un hardware wallet fabricado en Suiza por Shift Crypto, disponible en ediciones exclusivamente para Bitcoin y Multi. Cuenta con un diseño de chip dual con un elemento de seguridad certificado EAL6+ (el chip Nova) para almacenamiento de claves privadas y un microcontrolador de propósito general para las operaciones del dispositivo. El BitBox02 estándar ($129) ofrece una interfaz limpia de toque capacitivo con pantalla OLED y backup en tarjeta microSD, mientras que el nuevo BitBox02 Nova ($149) agrega conectividad Bluetooth para soporte iOS y una pantalla OLED de vidrio. Ambos modelos ejecutan firmware open source que ha sido auditado independientemente. La aplicación companion BitBoxApp proporciona una experiencia pulida en escritorio y móvil con gestión de billetera, actualizaciones de firmware e integración con WalletConnect para DeFi y Unchained Capital para multisig. Con fabricación suiza, prácticas de seguridad transparentes y un diseño amigable para el usuario, el BitBox02 equilibra seguridad y accesibilidad para principiantes y titulares de Bitcoin experimentados.`,
	sections: [
		{
			heading: '¿Qué es el BitBox02 y quién lo fabrica?',
			body: `El BitBox02 es un hardware wallet diseñado y fabricado por Shift Crypto, una empresa suiza fundada en 2015 con raíces en el espacio de Bitcoin y seguridad criptográfica. Shift Crypto era originalmente parte de ChronoLogic, una empresa suiza de sellos de tiempo, antes de pivotar para enfocarse exclusivamente en hardware wallets. El BitBox02 es su producto insignia — un dispositivo compacto del tamaño de una tarjeta de crédito con interfaz de "deslizamiento" de toque capacitivo, pantalla OLED y conexión USB-C. Está disponible en dos variantes: la edición exclusivamente para Bitcoin, que soporta solo BTC, y la edición Multi, que soporta Bitcoin, Ethereum y numerosos tokens ERC-20. Ambas ediciones comparten la misma arquitectura de hardware. El nombre "BitBox" se refiere al rol del dispositivo como una "caja" segura para tus claves de Bitcoin. Shift Crypto fabrica el dispositivo en Suiza, dándole control de calidad suizo y cumplimiento regulatorio. La empresa ha enviado más de 100,000 unidades y tiene una fuerte reputación por diseño enfocado en seguridad y soporte al cliente receptivo.`
		},
		{
			heading: '¿Cómo funciona el diseño de chip dual del BitBox02?',
			body: `El BitBox02 usa una arquitectura de chip dual que separa las operaciones críticas de seguridad de las funciones generales del dispositivo. El elemento de seguridad es un chip certificado EAL6+ (actualizado al chip Nova en el modelo más reciente) — esta es la misma clase de elemento de seguridad usada en tarjetas de crédito y pasaportes. Genera y almacena tus claves privadas, realiza firmas criptográficas y gestiona el cifrado de la frase semilla. La clasificación EAL6+ significa que elchip ha pasado por una evaluación de seguridad independiente rigurosa y es resistente a ataques físicos incluyendo análisis de potencia, sondeo electromagnético y manipulación. El segundochip es un microcontrolador de propósito general (Microchip SAM3X) que maneja la pantalla OLED, sensores de toque capacitivo, comunicación USB y operaciones de tarjeta microSD. Esta separación significa que incluso si elchip de propósito general fuera comprometido de alguna manera, el elemento de seguridad seguiría protegiendo tus claves privadas. Los dos chips se comunican a través de un canal seguro, y el firmware impone límites estrictos entre operaciones críticas de seguridad y no críticas. Esta arquitectura es similar a la que usa Ledger, pero la implementación de Shift Crypto enfatiza transparencia a través de firmware open source y auditorías de seguridad publicadas.`
		},
		{
			heading: 'BitBox02 vs BitBox02 Nova: ¿Qué cambió?',
			body: `El BitBox02 Nova, lanzado como modelo actualizado, introduce varias mejoras sobre el BitBox02 estándar. El cambio más visible es la pantalla OLED de vidrio, reemplazando la pantalla cubierta de plástico del original. Esto proporciona mejor resistencia a-rayaduras y una sensación más premium. El Nova también agrega conectividad Bluetooth, diseñada específicamente para soporte iOS — ya que Apple restringe accesorios USB, el Bluetooth permite que el Nova funcione con la BitBoxApp en iPhone y iPad. La implementación del Bluetooth está diseñada pensando en seguridad: usa comunicación encriptada y requiere confirmación física en el dispositivo para todas las transacciones. El chip Nova (el elemento de seguridad) también se actualiza, manteniendo la certificación EAL6+ mientras mejora el rendimiento. El BitBox02 estándar permanece disponible a $129 para usuarios que no necesitan soporte iOS o prefieren un dispositivo puramente conectado por USB. El Nova tiene un precio de $149. Ambos modelos soportan backup en microSD, el mismo software companion BitBoxApp e integración con WalletConnect. Si principalmente usas Android o escritorio, el BitBox02 estándar ofrece excelente valor. Si necesitas soporte iOS, el Nova es la elección obvia.`
		},
		{
			heading: 'Backup en microSD y recuperación del BitBox02',
			body: `Una de las características distintivas del BitBox02 es su sistema de backup basado en microSD. Durante la configuración inicial, el dispositivo crea un backup encriptado de la semilla de tu billetera en una tarjeta microSD. Este backup está encriptado con una contraseña que tú eliges, de modo que incluso si alguien obtiene la tarjeta microSD, no puede acceder a tu semilla sin la contraseña. El backup contiene toda la información necesaria para recuperar completamente tu billetera — frase semilla, ruta de derivación y estructura de cuentas. Para recuperar, insertas la tarjeta microSD de backup en un nuevo BitBox02, ingresas tu contraseña de backup, y el dispositivo restaura tu billetera completa. Esto es significativamente más conveniente que ingresar manualmente una frase semilla de 24 palabras, especialmente durante un escenario de recuperación estresante. Shift Crypto recomienda crear múltiples backups en microSD almacenados en diferentes ubicaciones seguras. El dispositivo también soporta backup estándar con frase semilla BIP39 — puedes ver y anotar tus 24 palabras como método de backup secundario. El enfoque con microSD tiene una ventaja práctica: es más rápido y menos propenso a errores que la entrada manual de semilla, y el formato encriptado agrega una capa extra de seguridad comparado con un backup en papel de texto plano.`
		},
		{
			heading: 'BitBoxApp: Companion de escritorio y móvil',
			body: `La BitBoxApp es el software companion de Shift Crypto, disponible para Windows, macOS, Linux, iOS y Android. Proporciona una interfaz limpia y bien diseñada para gestionar tu billetera BitBox02 — ver saldos, enviar y recibir Bitcoin, y manejar múltiples cuentas. La app soporta tanto las ediciones exclusivamente para Bitcoin como Multi, mostrando saldos de BTC y (para Multi) ETH/ERC-20 en una vista de portafolio unificada. Características clave incluyen entrega de actualizaciones de firmware (la app verifica e instala actualizaciones de firmware de forma segura), gestión de backups en microSD e integración con WalletConnect para interactuar con protocolos DeFi (solo edición Multi). Para usuarios avanzados, la BitBoxApp soporta integración con Unchained Capital, permitiendo que el BitBox02 funcione como dispositivo de firma en una configuración multisig. La app también incluye una función de coin control para gestión de UTXOs y soporta Tor para privacidad mejorada. A diferencia de Ledger Live o Trezor Suite, la BitBoxApp no requiere creación de cuenta ni información personal — se conecta directamente a tu hardware wallet y se comunica con nodos Bitcoin para consultas de saldo. El código de la app open source está disponible en GitHub para verificación independiente.`
		},
		{
			heading: '¿El BitBox02 es open source y ha sido auditado?',
			body: `Sí, el BitBox02 es completamente open source. Shift Crypto publica todo el código fuente del firmware, esquemas de hardware y código fuente de la BitBoxApp en GitHub bajo licencias open source. El firmware ha pasado por múltiples auditorías de seguridad independientes por firmas respetadas. Las auditorías notables incluyen revisiones por el propio equipo de seguridad de Shift Crypto (que incluye investigadores con experiencias en seguridad criptográfica), así como auditorías externas por firmas como Cyberhive y otras especializadas en seguridad embebida. La certificación EAL6+ del elemento de seguridad brinda asesoramiento adicional de que el chip de almacenamiento de claves ha sido evaluado independientemente contra un estándar de seguridad riguroso. Shift Crypto también implementa compilaciones reproducibles, permitiendo a cualquiera compilar el firmware desde el fuente y verificar que el binario coincide con el firmware de producción. La empresa publica un reporte de transparencia detallando sus prácticas de seguridad, resultados de auditorías y cualquier vulnerabilidad descubierta y parcheada. Este compromiso con la transparencia, combinado con fabricación suiza y certificación EAL6+, hace del BitBox02 uno de los hardware wallets más verificables en el mercado.`
		},
		{
			heading: 'Configuración y uso del BitBox02',
			body: `Configurar el BitBox02 es una de las experiencias más amigables para el usuario en el espacio de hardware wallets. Descarga la BitBoxApp, conecta el dispositivo vía USB-C (o vía Bluetooth con el Nova), y la app te guía a través del proceso de configuración. Puedes elegir crear una nueva billetera o restaurar desde un backup. Al crear una nueva billetera, el dispositivo genera una frase semilla BIP39 de 24 palabras y ofrece crear un backup encriptado en microSD. La interfaz de "deslizamiento" de toque capacitivo del dispositivo se usa para confirmar transacciones y navegar menús — deslizas a la izquierda o derecha para seleccionar opciones y mantienes presionado para confirmar. Esto es más intuitivo que las interfaces basadas en botones de muchos competidores. Para uso diario, conectas el BitBox02 a tu computadora, abres la BitBoxApp, y la app muestra tus saldos e historial de transacciones. Para enviar Bitcoin, ingresas la dirección del destinatario y el monto en la app, luego confirmas los detalles de la transacción en la pantalla OLED del BitBox02 deslizando para aprobar. El dispositivo firma la transacción internamente y la envía de vuelta a la app para transmisión. El flujo completo toma segundos y requiere interacción mínima con el hardware wallet mismo.`
		}
	],
	faq: [
		{
			question: '¿Cuánto cuesta el BitBox02?',
			answer: `El BitBox02 estándar (exclusivamente para Bitcoin o Multi) tiene un precio de $129 USD. El BitBox02 Nova con Bluetooth y pantalla OLED de vidrio es $149 USD. Ambos están disponibles directamente en shiftcrypto.ch. Se incluye una tarjeta microSD para backup en la caja.`
		},
		{
			question: '¿El BitBox02 es exclusivamente para Bitcoin?',
			answer: `El BitBox02 está disponible en dos ediciones: exclusivamente para Bitcoin, que soporta solo BTC, y Multi, que soporta Bitcoin, Ethereum y tokens ERC-20. Ambas ediciones comparten el mismo hardware. La edición exclusivamente para Bitcoin tiene una superficie de ataque de firmware más pequeña y se recomienda para usuarios enfocados exclusivamente en Bitcoin.`
		},
		{
			question: '¿El BitBox02 funciona con iOS?',
			answer: `El BitBox02 estándar no funciona con iOS debido a las restricciones de accesorios USB de Apple. El BitBox02 Nova, que agrega conectividad Bluetooth, soporta iOS vía la BitBoxApp en iPhone y iPad. Ambos modelos funcionan con plataformas Android y de escritorio.`
		},
		{
			question: '¿Es seguro el BitBox02 para almacenamiento a largo plazo?',
			answer: `Sí. El BitBox02 usa un elemento de seguridad certificado EAL6+ — la clasificación de seguridad disponible comercialmente más alta para chips embebidos. Combinado con la arquitectura de chip dual, backups encriptados en microSD y firmware open source, proporciona fuerte protección para almacenamiento de Bitcoin a largo plazo.`
		},
		{
			question: '¿Se puede usar el BitBox02 para multisig?',
			answer: `Sí, el BitBox02 se integra con Unchained Capital para configuraciones de multisig colaborativas. También soporta multisig estándar de Bitcoin a través de la BitBoxApp y billeteras de terceros como Sparrow Wallet y Electrum, usando flujos PSBT.`
		},
		{
			question: '¿Qué pasa si pierdo mi BitBox02?',
			answer: `Tu Bitcoin es recuperable usando tu backup encriptado en microSD o tu frase semilla de 24 palabras. Inserta el backup en un nuevo BitBox02 e ingresa tu contraseña de backup, o usa la frase semilla con cualquier billetera compatible con BIP39. El dispositivo es solo una herramienta de firma — tus fondos están asegurados por la semilla.`
		},
		{
			question: '¿El BitBox02 soporta Lightning Network?',
			answer: `El BitBox02 no soporta Lightning Network directamente. Es un dispositivo de firma en cadena. Para funcionalidad Lightning, combínalo con una billetera de software compatible con Lightning para gastos diarios mientras mantienes ahorros a largo plazo en el BitBox02.`
		}
	],
	bitTaskerCta: {
		heading: 'Protege tus ganancias en Bitcoin con BitBox02',
		body: `Cuando ganas Bitcoin en BitTasker, el backup en microSD y el elemento de seguridad EAL6+ del BitBox02 facilitan proteger tus ahorros. La BitBoxApp se integra sin problemas para gestionar saldos y firmar transacciones.`,
		buttonText: 'Comenzar',
		buttonHref: '/auth/signup'
	}
};
