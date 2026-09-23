import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Foundation Passport: Revisión del Hardware Wallet Bitcoin',
		subtitle:
			'Un signer Bitcoin premium, open source, con pantalla táctil, encriptación post-cuántica y bóveda encriptada de 50GB.'
	},
	answerBlock: `El Foundation Passport es un hardware wallet premium exclusivo para Bitcoin fabricado por Foundation Devices en Estados Unidos en su instalación compatible con ITAR. Con un precio de $349, cuenta con una pantalla IPS de 3.5 pulgados con Gorilla Glass, un microkernel KeyOS basado en Rust con sandboxing de aplicaciones y QuantumLink — un protocolo de Bluetooth encriptado post-cuántico para comunicación segura con apps companion. El Passport va más allá de la firma básica: incluye Keycards NFC con fundas Faraday para backups encriptados, una aplicación Vault de 50GB encriptado para almacenamiento de documentos, soporte de llaves de seguridad FIDO y capacidades de autenticación 2FA TOTP. Tanto el hardware como el software son completamente open source y han sido auditados por Keylabs, una respetada firma de seguridad Bitcoin. El Passport está dirigido a usuarios que quieren un dispositivo de seguridad Bitcoin premium multifunción en lugar de un signer minimalista para cold storage.`,
	sections: [
		{
			heading: '¿Qué hace único al Foundation Passport?',
			body: `El Foundation Passport se diferencia mediante tres decisiones de diseño fundamentales. Primero, está construido específicamente como una plataforma de seguridad Bitcoin, no solo como un signer. Mientras que la mayoría de los hardware wallets se enfocan exclusivamente en la firma de transacciones, el Passport incorpora una aplicación Vault de 50GB encriptado para almacenamiento seguro de documentos, funcionalidad de llave de seguridad FIDO2 para autenticación sin contraseña y autenticación de dos factores basada en TOTP — todo ejecutándose en aplicaciones con sandbox en su microkernel KeyOS. Segundo, el Passport usa QuantumLink, un protocolo personalizado de Bluetooth encriptado post-cuántico que habilita comunicación segura con tu teléfono o computadora sin las vulnerabilidades del pareo Bluetooth estándar. Esto está diseñado para ser resistente a futuros ataques de computación cuántica sobre encriptación. Tercero, Foundation Devices fabrica el Passport completamente en Estados Unidos en una instalación compatible con ITAR, brindando transparencia en la cadena de suministro que es rara en la industria de hardware wallets. La combinación de una experiencia premium con pantalla táctil, funciones de seguridad multifunción y fabricación nacional posiciona al Passport como una opción de alta gama para bitcoineros que quieren más que cold storage básico.`
		},
		{
			heading: '¿Cómo funciona el KeyOS del Passport?',
			body: `KeyOS es el microkernel personalizado de Foundation Devices escrito en Rust, diseñado específicamente para la seguridad de hardware wallets Bitcoin. A diferencia del firmware tradicional de hardware wallets que se ejecuta como una aplicación monolítica, KeyOS implementa sandboxing de aplicaciones — cada aplicación en el Passport (la app de firma, Vault, llave FIDO, autenticador TOTP) se ejecuta en un ambiente aislado con su propio espacio de memoria y permisos. Esto significa que una vulnerabilidad en una app no puede comprometer las demás. KeyOS también gestiona la interacción con el elemento de seguridad, la derivación de claves y las operaciones criptográficas. El lenguaje de programación Rust fue elegido por sus garantías de seguridad de memoria, eliminando clases enteras de vulnerabilidades como desbordamientos de búfer y errores de uso después de libre que plag firmware basado en C. Foundation Devices publica el código fuente de KeyOS en GitHub, permitiendo la verificación independiente de la arquitectura de seguridad. El enfoque de microkernel está inspirado en principios de seguridad de sistemas operativos utilizados en sistemas de alta confiabilidad, adaptados para las restricciones específicas de un hardware wallet Bitcoin.`
		},
		{
			heading: '¿Qué es QuantumLink y por qué es importante?',
			body: `QuantumLink es el protocolo propietario de Bluetooth encriptado post-cuántico de Foundation Devices, diseñado para asegurar el canal de comunicación entre el Passport y tus dispositivos companion (teléfono o computadora). El pareo Bluetooth estándar usa algoritmos de encriptación clásicos que son teóricamente vulnerables a ataques de computación cuántica. QuantumLink implementa criptografía basada en retículos — una clase de algoritmos que se cree son resistentes tanto a computadoras clásicas como cuánticas. Esta preparación para el futuro asegura que incluso si las computadoras cuánticas se vuelven prácticas en las próximas décadas, los datos intercambiados entre tu Passport y el dispositivo companion permanezcan seguros. QuantumLink también mejora la experiencia de usuario: en lugar del pareo Bluetooth tradicional que requiere modo visible y confirmación de PIN, QuantumLink usa un mecanismo de intercambio de claves más seguro que reduce la ventana para ataques man-in-the-middle. El protocolo se usa para transmitir transacciones sin firmar al Passport y recibir transacciones firmadas de vuelta, así como para actualizaciones de firmware y operaciones de Keycards. Aunque las amenazas de computación cuántica no son inminentes, la decisión de Foundation Devices de implementar encriptación post-cuántica demuestra su filosofía de seguridad a largo plazo.`
		},
		{
			heading: 'Keycards NFC y aplicación Vault del Passport',
			body: `El Passport incluye dos Keycards NFC — tarjetas del tamaño de una credencial con elementos de seguridad incrustados que almacenan backups encriptados de los datos de tu billetera. Cada Keycard viene con una funda Faraday que bloquea todas las señales inalámbricas, impidiendo lecturas NFC no autorizadas cuando la tarjeta está en tu posesión. Para crear un backup, tocas una Keycard al lector NFC del Passport, y el dispositivo escribe una copia encriptada de los datos de tu billetera en el elemento de seguridad de la tarjeta. Para restaurar, tocas la Keycard a un nuevo Passport, ingresas tu PIN, y la billetera se recupera. Esto proporciona un método conveniente de backup air-gapped que no requiere escribir palabras semilla en papel. La aplicación Vault es un espacio de almacenamiento encriptado de 50GB en la memoria interna del Passport, diseñado para almacenar documentos sensibles — archivos encriptados, bases de datos de gestores de contraseñas o backups adicionales de frases semilla. Todos los datos en el Vault están encriptados en reposo usando claves derivadas del elemento de seguridad del Passport. El Passport también funciona como una llave de seguridad FIDO2, permitiéndote usarlo para inicio de sesión sin contraseña en sitios web que soportan WebAuthn, y como autenticador TOTP para generar códigos de autenticación de dos factores — eliminando la necesidad de aplicaciones de autenticador separadas en tu teléfono.`
		},
		{
			heading: 'Auditoría de seguridad y estado open source del Foundation Passport',
			body: `Tanto el hardware como el software del Passport son completamente open source. Foundation Devices publica los esquemas completos, diseños de PCB y dibujos mecánicos del hardware del Passport en GitHub, junto con todo el código fuente del firmware, código del microkernel KeyOS y código de la aplicación companion. El Passport ha pasado por múltiples auditorías de seguridad independientes, la más notable por Keylabs — una firma de investigación de seguridad enfocada en Bitcoin conocida por sus divulgaciones de vulnerabilidades en hardware wallets. Keylabs examinó las implementaciones criptográficas, la integración del elemento de seguridad y la resistencia a ataques físicos del Passport. Foundation Devices también implementa un proceso de compilación verificable, permitiendo a partes independientes compilar el firmware desde el fuente y verificar que el binario resultante coincide con el firmware de producción. La empresa fue fundada por ex miembros de los equipos de Casa y Blockstream, aportando experiencia profunda en seguridad Bitcoin al producto. Foundation Devices tiene sede en Estados Unidos, y toda la fabricación ocurre nacionalmente en una instalación compatible con ITAR, proporcionando transparencia en la cadena de suministro inusual en el mercado de hardware wallets.`
		},
		{
			heading: '¿Cómo se compara el Passport con Coldcard y Trezor?',
			body: `El Foundation Passport ocupa una posición de mercado diferente tanto al Coldcard como al Trezor. Comparado con el Coldcard (~$150-215), el Passport es significativamente más caro a $349 pero ofrece interfaz de pantalla táctil, más almacenamiento (Vault de 50GB), soporte de llave FIDO2 y Bluetooth integrado (vía QuantumLink). El Coldcard se enfoca en seguridad minimalista air-gapped con firma basada en MicroSD, mientras que el Passport busca ser una plataforma integral de seguridad Bitcoin. El diseño air-gapped del Coldcard es probablemente más seguro para cold storage puro, ya que no tiene ninguna capacidad de comunicación inalámbrica. Comparado con el Trezor Model T ($219) o Safe 5 ($169), el Passport ofrece enfoque solo Bitcoin, fabricación en EE.UU., encriptación post-cuántica y un conjunto de funciones más amplio. Trezor soporta múltiples criptomonedas y tiene un historial más largo, pero la arquitectura de microkernel KeyOS del Passport proporciona un aislamiento de aplicaciones más fuerte. Para usuarios que quieren un dispositivo Bitcoin premium multifunción y están cómodos con comunicación Bluetooth, el Passport es atractivo. Para puristas que quieren el máximo absoluto en seguridad air-gapped, el Coldcard sigue siendo el estándar de referencia.`
		},
		{
			heading: 'Configuración del Foundation Passport',
			body: `La configuración del Passport comienza descargando la aplicación companion de Foundation en tu teléfono (iOS o Android) o escritorio. Enciende el Passport y sigue el asistente de configuración en pantalla en su pantalla táctil de 3.5 pulgados. Generarás una nueva billetera, que produce una frase semilla BIP39 de 24 palabras que se muestra en la pantalla del Passport. Escribe estas palabras en papel o usa el método de backup con Keycard NFC. Establece tu código PIN y opcionalmente configura un passphrase para capas de seguridad adicionales. La aplicación companion se conecta al Passport vía Bluetooth QuantumLink, permitiéndote ver saldos, crear transacciones y gestionar la aplicación Vault. Puedes habilitar aplicaciones adicionales — llave de seguridad FIDO2, autenticador TOTP o Vault — desde el administrador de apps del Passport. Cada aplicación se ejecuta en su propio ambiente con sandbox en KeyOS. Para backups con Keycard NFC, navega al menú de backup en el Passport y toca cada Keycard para escribir datos encriptados de la billetera. Almacena las Keycards en sus fundas Faraday en ubicaciones seguras separadas. El Passport soporta rutas de derivación estándar BIP44, BIP49 y BIP84, haciéndolo compatible con la mayoría del software de billetera Bitcoin para propósitos de recuperación.`
		}
	],
	faq: [
		{
			question: '¿Cuánto cuesta el Foundation Passport?',
			answer: `El Foundation Passport tiene un precio de $349 USD y está disponible directamente en foundationdevices.com. Incluye dos Keycards NFC, fundas Faraday, un cable USB-C y una tarjeta de recuperación. El envío internacional está disponible, aunque las regulaciones ITAR pueden restringir el envío a ciertos países.`
		},
		{
			question: '¿El Foundation Passport es open source?',
			answer: `Sí, tanto los diseños de hardware como el software son completamente open source. Foundation Devices publica todos los esquemas, diseños de PCB, código fuente del firmware y código del microkernel KeyOS en GitHub. El Passport también ha sido auditado por Keylabs, una firma de investigación de seguridad Bitcoin.`
		},
		{
			question: '¿El Foundation Passport soporta Ethereum u otras monedas?',
			answer: `No, el Passport es un hardware wallet exclusivo para Bitcoin. No soporta Ethereum, tokens ERC-20 ni ninguna otra criptomoneda. Este enfoque permite a Foundation Devices concentrar recursos de seguridad exclusivamente en Bitcoin.`
		},
		{
			question: '¿El Bluetooth del Passport es seguro?',
			answer: `El Passport usa QuantumLink, un protocolo personalizado de Bluetooth encriptado post-cuántico diseñado para ser resistente a ataques tanto clásicos como de computación cuántica. Todos los datos transmitidos vía QuantumLink están encriptados de extremo a extremo. Sin embargo, si prefieres cero comunicación inalámbrica, el enfoque air-gapped con MicroSD del Coldcard puede ser preferible.`
		},
		{
			question: '¿Puedo recuperar mi billetera si pierdo el Passport?',
			answer: `Sí. Siempre que tengas tu frase semilla de 24 palabras (o un backup con Keycard NFC), puedes recuperar tu Bitcoin en cualquier hardware wallet compatible con BIP39. La frase semilla es el backup maestro — el Passport es solo el dispositivo de firma.`
		},
		{
			question: '¿Para qué se usa la aplicación Vault del Passport?',
			answer: `La aplicación Vault proporciona 50GB de almacenamiento encriptado en el Passport para documentos sensibles — archivos encriptados, bases de datos de gestores de contraseñas o backups adicionales de frases semilla. Todos los datos están encriptados en reposo usando claves derivadas del elemento de seguridad del Passport.`
		},
		{
			question: '¿El Passport funciona con Sparrow Wallet?',
			answer: `El Passport principalmente funciona con la aplicación companion de Foundation (iOS, Android, escritorio). Para integración con Sparrow Wallet o Electrum, puedes exportar claves públicas extendidas (xpubs) desde la aplicación Foundation e importarlas en Sparrow para gestión avanzada de UTXOs y flujos PSBT.`
		}
	],
	bitTaskerCta: {
		heading: 'Protege tus ganancias en Bitcoin con Foundation Passport',
		body: `Cuando ganas Bitcoin en BitTasker, usa la aplicación Vault del Passport para almacenar de forma segura claves de backup, y mantén tus fondos principales en su entorno de firma air-gapped. La pantalla táctil hace que la gestión diaria de transacciones sea sin esfuerzo.`,
		buttonText: 'Comenzar',
		buttonHref: '/auth/signup'
	}
};
