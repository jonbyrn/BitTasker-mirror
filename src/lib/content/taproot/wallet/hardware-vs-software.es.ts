import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Billeteras de Hardware vs Software: ¿Cuál Necesitas?',
		subtitle:
			'Comprende los compromisos de seguridad, costos y casos de uso para billeteras de hardware y software de Bitcoin.'
	},
	answerBlock: `Los hardware wallets almacenan las claves privadas de Bitcoin en un dispositivo físico sin conexión a internet, proporcionando seguridad superior contra ataques en línea, malware y hackeo remoto. Cuestan entre $100 y $350 y son ideales para ahorros a largo plazo superiores a $1,000. Los software wallets se ejecutan como apps en tu teléfono o computadora, ofreciendo conveniencia y acceso gratuito pero con mayor riesgo ya que están conectados a internet. Para la mayoría de los usuarios de Bitcoin, la estrategia óptima es un enfoque híbrido: un hardware wallet para cold storage a largo plazo y un software wallet para gastos diarios, pagos Lightning y escrow en plataformas como BitTasker. Hardware wallets como Coldcard, Foundation Passport y BitBox02 protegen tus claves de ataques remotos mediante firma air-gapped y elementos de seguridad, mientras que software wallets como Aqua o Blink brindan la velocidad y conveniencia necesarias para transacciones diarias de Bitcoin.`,
	sections: [
		{
			heading: '¿Qué es un hardware wallet y cómo funciona?',
			body: `Un hardware wallet es un dispositivo físico diseñado para almacenar y gestionar claves privadas de Bitcoin en un entorno sin conexión a internet. A diferencia de los software wallets que se ejecutan en teléfonos o computadoras conectadas a internet, los hardware wallets mantienen tus claves en un chip dedicado que nunca se conecta directamente a la red. Cuando quieres enviar Bitcoin, el hardware wallet recibe una transacción sin firmar de una aplicación companion (vía USB, MicroSD o código QR), muestra los detalles de la transacción en su pantalla para verificación, la firma internamente usando tu clave privada y envía la transacción firmada de vuelta a la aplicación companion para su transmisión. En ningún momento la clave privada sale del elemento de seguridad del hardware wallet. Esta arquitectura air-gapped significa que incluso si tu computadora está infectada con malware, tus claves de Bitcoin permanecen seguras. Los hardware wallets típicamente cuestan entre $100 y $350, usan elementos de seguridad (chips especializados clasificados EAL5+ o superior) y soportan frases semilla BIP39 para backup y recuperación. Los principales fabricantes incluyen Coinkite (Coldcard), Foundation Devices (Passport), Shift Crypto (BitBox02), Ledger y Trezor.`
		},
		{
			heading: '¿Qué es un software wallet y cómo funciona?',
			body: `Un software wallet es una aplicación que se ejecuta en tu teléfono, computadora o navegador y almacena las claves privadas de Bitcoin como datos encriptados en el almacenamiento del dispositivo. Los software wallets populares incluyen Aquawallet, Blink, BlueWallet, Sparrow Wallet y Electrum. Los software wallets generan y almacenan tu frase semilla digitalmente (encriptada con contraseña), crean y firman transacciones usando el procesador del dispositivo y las transmiten a la red Bitcoin vía nodos conectados. La principal ventaja es la conveniencia — puedes enviar y recibir Bitcoin instantáneamente, gestionar pagos Lightning, interactuar con protocolos DeFi y acceder a tus fondos desde cualquier lugar con conexión a internet. Sin embargo, esta conectividad también es el riesgo principal: los software wallets están expuestos a malware, ataques de phishing, grabadores de pantalla, keyloggers y vulnerabilidades del sistema operativo. Si tu teléfono o computadora es comprometido, un atacante podría potencialmente extraer tus claves privadas. Los software wallets son gratuitos y van desde apps móviles para principiantes (Aqua, Blink) hasta herramientas de escritorio avanzadas (Sparrow, Electrum). Son más adecuados para gastos diarios con montos pequeños que podrías permitirte perder.`
		},
		{
			heading: 'Comparación de seguridad: hardware vs software wallets',
			body: `La diferencia fundamental de seguridad se reduce a la superficie de ataque. La superficie de ataque de un hardware wallet es extremadamente estrecha — un atacante necesitaría acceso físico al dispositivo, conocimiento de tu PIN y equipo especializado para extraer claves del elemento de seguridad. Los ataques remotos son esencialmente imposibles porque el dispositivo nunca se conecta a internet. La superficie de ataque de un software wallet es mucho más amplia: malware en tu teléfono o computadora, sitios web de phishing que imitan billeteras reales, SIM swapping para evadir 2FA, apps de grabación de pantalla, ataque de portapapeles que reemplaza tu dirección de destinatario y ataques de cadena de suministro en tiendas de apps. Dicho esto, los software wallets modernos han mejorado significativamente — muchos ahora soportan firma air-gapped por código QR, configuraciones multi-firma e integración con hardware wallets. La seguridad también depende enormemente del comportamiento del usuario: un software wallet cuidadosamente mantenido en un dispositivo dedicado puede ser bastante seguro, mientras que un hardware wallet usado descuidadamente (PIN débil, sin passphrase, frase semilla almacenada digitalmente) puede ser comprometido. Para montos superiores a $1,000 que planeas mantener a largo plazo, se recomienda fuertemente un hardware wallet. Para montos menores de gasto diario, un software wallet bien configurado brinda seguridad adecuada.`
		},
		{
			heading: '¿Cuándo deberías usar un hardware wallet?',
			body: `Un hardware wallet es la elección correcta cuando estás almacenando Bitcoin que no planeas gastar a corto plazo — tus ahorros, fondo de emergencia o inversión a largo plazo. La regla general es: si el monto excede lo que perderías cómodamente, pertenece a un hardware wallet. Escenarios específicos donde un hardware wallet es esencial incluyen: mantener Bitcoin para jubilación o horizontes de tiempo de varios años, proteger ahorros de colapsos de exchanges (después de FTX, la autocustodia ya no es opcional para holders serios), asegurar fondos de tesorería empresariales en Bitcoin y proteger Bitcoin heredado o regalado. Los hardware wallets también son valiosos si vives en un área con riesgos elevados de seguridad física, ya que funciones como PINs de duress (Coldcard) y backups encriptados (BitBox02) proporcionan capas adicionales de protección. Si ganas Bitcoin a través de freelancing o negocios en plataformas como BitTasker, mover tus ganancias acumuladas a un hardware wallet con regularidad es una mejor práctica. El costo de un hardware wallet ($100-$350) es un precio pequeño que pagar por la seguridad de montos que podrían representar meses o años de ganancias.`
		},
		{
			heading: '¿Cuándo deberías usar un software wallet?',
			body: `Los software wallets son ideales para Bitcoin que planeas usar activamente — gastos diarios, pagos Lightning, recibir pagos de clientes e interactuar con aplicaciones nativas de Bitcoin. Si usas Bitcoin para transacciones diarias (café, pagar servicios, propinas), un software wallet en tu teléfono brinda la velocidad y conveniencia que los hardware wallets no pueden igualar. Los software wallets también son esenciales para: transacciones de Lightning Network (los hardware wallets generalmente no soportan Lightning), recibir pagos en movimiento (puedes compartir una dirección de recepción sin cargar hardware), probar y aprender Bitcoin (empieza con montos pequeños en un software wallet antes de invertir en hardware) y operar en regiones donde el envío de hardware wallets no es confiable. Para freelancers y trabajadores de la economía gig en BitTasker, un software wallet sirve como la capa activa de gasto — recibir pagos, pagar servicios y gestionar canales Lightning. La clave es tratar tu software wallet como una cuenta corriente: mantén solo lo que necesitas para las próximas semanas o meses, y transfiere el exceso a tu hardware wallet "cuenta de ahorros" regularmente. La mayoría de los software wallets son gratuitos, por lo que no hay barrera de costo para empezar.`
		},
		{
			heading: 'El enfoque híbrido: usar ambos juntos',
			body: `La estrategia de almacenamiento de Bitcoin más segura y práctica usa tanto hardware como software wallets en un enfoque por capas. Piensa en ello como tus cuentas bancarias tradicionales: una cuenta corriente para gastos diarios y una cuenta de ahorros para almacenamiento a largo plazo. Tu hardware wallet es la cuenta de ahorros — mantiene la mayor parte de tu Bitcoin en cold storage, protegido por elementos de seguridad y firma air-gapped. Tu software wallet es la cuenta corriente — mantiene un pequeño saldo de trabajo para transacciones diarias, pagos Lightning y escrow en plataformas. El flujo de trabajo es directo: cuando recibes Bitcoin (de ganancias en BitTasker, minería o compras), almacenas la mayoría en tu hardware wallet y mantienes una cantidad menor en tu software wallet para uso activo. Cuando necesitas reponer tu software wallet, transfieres desde el hardware wallet. Cuando tu software wallet acumula más de lo que necesitas, lo transfieres de vuelta a cold storage. Este enfoque híbrido te da lo mejor de ambos mundos: la seguridad inquebrantable de hardware para almacenamiento a largo plazo y la conveniencia y velocidad de software para uso diario de Bitcoin. Es la estrategia recomendada por la mayoría de los expertos en seguridad Bitcoin y es la elección natural para cualquiera que tome en serio la protección de su Bitcoin mientras lo usa activamente.`
		},
		{
			heading: 'Cómo funciona BitTasker con ambos tipos de billetera',
			body: `BitTasker está diseñado para funcionar sin problemas tanto con hardware como software wallets de Bitcoin. Cuando ganas Bitcoin en la plataforma — ya sea a través de tareas freelance, completación de tareas o liberaciones de escrow — puedes recibir pagos a cualquier dirección de Bitcoin que genere tu billetera. Para actividad diaria en la plataforma (aceptar tareas, gestionar escrow, recibir pagos instantáneos), un software wallet como Aqua o Blink brinda la conveniencia que necesitas. Estas billeteras soportan Lightning Network, que BitTasker usa para micropagos rápidos y de bajo costo entre usuarios. Para asegurar tus ganancias acumuladas, puedes transferir Bitcoin desde tu software wallet a un hardware wallet como Coldcard, Passport o BitBox02 para cold storage a largo plazo. El sistema de escrow de la plataforma funciona con ambos tipos de billetera — cuando un cliente libera fondos en escrow, el Bitcoin llega a la dirección que hayas proporcionado, ya sea un software wallet para acceso inmediato o la dirección de un hardware wallet para cold storage. Esta flexibilidad significa que nunca estás forzado a un solo método de almacenamiento. El flujo de trabajo recomendado para usuarios de BitTasker: mantén un software wallet para ganancias y gastos activos, y transfiere periódicamente las ganancias a un hardware wallet para almacenamiento seguro a largo plazo.`
		}
	],
	faq: [
		{
			question: '¿Vale la pena la inversión en un hardware wallet?',
			answer: `Para cualquiera que mantenga más de $1,000 en Bitcoin, un hardware wallet absolutamente vale la pena. Un Coldcard de $150 o BitBox02 de $129 protegiendo miles de dólares en Bitcoin es un precio pequeño por tranquilidad. El costo típicamente es menos del 1% del valor que protege, y elimina el riesgo de perder tus ahorros por ataques en línea, fallos de exchanges o robo de dispositivos.`
		},
		{
			question: '¿Se puede hackear un hardware wallet?',
			answer: `Aunque ningún sistema es 100% inmune, los hardware wallets son extremadamente resistentes al hackeo. Un atacante necesitaría acceso físico al dispositivo, conocimiento de tu PIN y equipo de laboratorio especializado para extraer claves del elemento de seguridad. El hackeo remoto es esencialmente imposible debido al diseño air-gapped. El riesgo principal es ingeniería social — ser engañado para ingresar tu frase semilla en un sitio web o dispositivo falso.`
		},
		{
			question: '¿Son seguros los software wallets para Bitcoin?',
			answer: `Los software wallets brindan seguridad adecuada para montos menores que usas regularmente, pero son más vulnerables que los hardware wallets. Los riesgos incluyen malware, phishing y compromiso del dispositivo. Para montos superiores a $1,000 o ahorros a largo plazo, se recomienda fuertemente un hardware wallet. Para gastos diarios con montos menores, un software wallet bien configurado (contraseña fuerte, dispositivo actualizado, sin root) es razonable.`
		},
		{
			question: '¿Cuál es mejor para principiantes: hardware o software wallet?',
			answer: `Empieza con un software wallet gratuito como Aqua o Blink para aprender cómo funciona Bitcoin con montos pequeños. Una vez que estés cómodo y tus tenencias superen unos pocos cientos de dólares, invierte en un hardware wallet como el BitBox02 ($129) por su configuración amigable para el usuario y backup en microSD. Este enfoque gradual minimiza el riesgo mientras aprendes.`
		},
		{
			question: '¿Necesito ambos: hardware y software wallet?',
			answer: `Para la mayoría de los usuarios de Bitcoin, sí. Un software wallet maneja gastos diarios y pagos Lightning, mientras que un hardware wallet asegura tus ahorros a largo plazo. Este enfoque por capas te brinda conveniencia para uso diario e seguridad inquebrantable para los montos que no puedes permitirte perder.`
		},
		{
			question: '¿Qué pasa si mi hardware wallet se rompe?',
			answer: `Tu Bitcoin está seguro siempre que tengas tu backup — ya sea una frase semilla de 24 palabras o un backup encriptado en microSD (para BitBox02). Simplemente compra un nuevo hardware wallet (o cualquier wallet compatible con BIP39) y recupera usando tu backup. El hardware wallet es solo un dispositivo de firma; tus fondos se derivan de la semilla, no se almacenan exclusivamente en el dispositivo.`
		},
		{
			question: '¿Puedo usar BitTasker solo con un software wallet?',
			answer: `Sí, BitTasker funciona perfectamente con software wallets. Puedes recibir pagos Lightning, gestionar escrow y retirar ganancias a cualquier dirección de Bitcoin. Sin embargo, para seguridad a largo plazo, recomendamos transferir ganancias acumuladas a un hardware wallet periódicamente.`
		}
	],
	bitTaskerCta: {
		heading: 'Empieza a ganar Bitcoin con la configuración de billetera correcta',
		body: `BitTasker funciona tanto con hardware como software wallets. Empieza a ganar con un software wallet para transacciones diarias, luego asegura tus ganancias con un hardware wallet para cold storage a largo plazo.`,
		buttonText: 'Comenzar',
		buttonHref: '/auth/signup'
	}
};
