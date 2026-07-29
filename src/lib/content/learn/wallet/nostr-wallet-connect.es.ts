import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Nostr Wallet Connect: Cómo Funciona NWC Explicado',
		subtitle:
			'El protocolo que permite a las wallets Bitcoin comunicarse con cualquier app Nostr — sin cuentas custodiales'
	},
	answerBlock:
		'Nostr Wallet Connect (NWC) es un protocolo abierto que permite que cualquier wallet Bitcoin se conecte a cualquier aplicación Nostr a través de comunicación encriptada y con permisos. En lugar de crear cuentas separadas en cada plataforma, conectas tu wallet una vez y concedes permisos específicos — pagar una factura, verificar un saldo o listar transacciones — a cualquier app Nostr que autorices. NWC funciona creando una conexión encriptada de relay entre tu wallet (que ejecuta un servicio NWC) y la app (que actúa como cliente). Tú controlas exactamente qué puede hacer cada app. Tus claves nunca salen de tu wallet. NWC está construido sobre el protocolo Nostr, que ya es la capa de identidad para BitTasker.',
	sections: [
		{
			heading: '¿Qué es Nostr Wallet Connect?',
			body: 'Nostr Wallet Connect (NWC) es un protocolo estandarizado (NIP-47) que conecta wallets Bitcoin con aplicaciones Nostr. Piensa en él como un enchufe universal para pagos Bitcoin: en lugar de que cada app construya integraciones personalizadas, todas hablan el mismo idioma NWC. Tu wallet actúa como un servidor que escucha solicitudes de pago. La app actúa como cliente que envía solicitudes (paga esta factura, verifica este saldo) a través de un relay Nostr encriptado. La conexión se autentica con un par de claves — tu wallet mantiene la clave privada, y la app recibe una clave pública de acceso limitado. Concedes permisos específicos y los revocas en cualquier momento.'
		},
		{
			heading: '¿Cómo funciona NWC técnicamente?',
			body: 'NWC usa tres componentes: un servicio de wallet, un relay Nostr y una app cliente. El servicio de wallet corre en tu dispositivo o un servidor que controlas, implementando la especificación NIP-47. Escucha eventos Nostr encriptados en un relay específico. La app cliente se conecta al mismo relay usando un string de conexión (una URI nostr+walletconnect://). Cuando la app quiere pagar una factura, crea un evento Nostr encriptado, lo firma con la clave del cliente y lo publica en el relay. El servicio de wallet recoge el evento, lo descifra, verifica que la clave tiene permiso y ejecuta el pago. En ningún momento la app tiene acceso a tus claves privadas o seed phrase.'
		},
		{
			heading: '¿Qué wallets soportan Nostr Wallet Connect?',
			body: 'El soporte de NWC está creciendo rápidamente. Wallets con soporte nativo incluyen Mutiny Wallet, Coinos, Aqua Wallet, Primal y wallets basadas en Cashu. Implementaciones Lightning como LND, CLN (Core Lightning) y LNbits pueden ejecutar servicios NWC. BlueWallet y Phoenix están agregando soporte NWC. Para usuarios de hardware, puedes ejecutar un servicio NWC en un nodo conectado a tu Coldcard o Ledger vía Sparrow Wallet. La belleza de NWC es que cualquier wallet implementando NIP-47 puede conectarse a cualquier app compatible — el ecosistema es interoperable por diseño.'
		},
		{
			heading: 'Cómo configurar Nostr Wallet Connect paso a paso',
			body: 'Paso 1: Elige una wallet compatible con NWC (Mutiny, Coinos, Aqua o un nodo LND/CLN auto-hospedado). Paso 2: En la configuración de tu wallet, encuentra "Nostr Wallet Connect" o "NWC" y crea una nueva conexión. Paso 3: La wallet genera un string de conexión (nostr+walletconnect://...). Copia este string. Paso 4: En la app Nostr que quieres conectar (BitTasker, Primal, Amethyst), busca "Conectar Wallet" y pega el string. Paso 5: Revisa los permisos que la app solicita y aprueba solo lo que estés cómodo. Paso 6: Prueba con un pago pequeño para verificar que la conexión funciona. Puedes revocar acceso en cualquier momento.'
		},
		{
			heading: '¿Cuáles son las implicaciones de seguridad de NWC?',
			body: 'NWC está diseñado con varias capas de seguridad. Primero, toda la comunicación está encriptada de extremo a extremo — los operadores de relay no pueden leer tus datos de pago. Segundo, concedes permisos granulares: una app podría solo pagar facturas hasta cierto monto, no retirar todo tu saldo. Tercero, tu seed phrase y claves privadas nunca salen de tu wallet. Cuarto, puedes revocar cualquier conexión instantáneamente desde la configuración de tu wallet. El riesgo principal es apropiar una app maliciosa con permisos demasiado amplios. Siempre revisa las solicitudes de permiso cuidadosamente.'
		},
		{
			heading: '¿Cómo se compara NWC con otros métodos de conexión?',
			body: 'Las conexiones tradicionales de wallet requieren construir integraciones personalizadas para cada plataforma. NWC es un estándar único que funciona en todas las apps Nostr. Comparado con logins custodiales (email + contraseña), NWC es de autocustodia — tú posees las claves. Comparado con pagos raw de Lightning invoice, NWC agrega conexiones persistentes con acceso por permisos. Comparado con pagos on-chain por código QR, NWC soporta pagos automáticos iniciados por la app sin escaneo manual. Para el ecosistema Nostr, NWC es lo que OAuth es para las apps web — un protocolo de autorización estandarizado — excepto que tus fondos permanecen en tu wallet.'
		},
		{
			heading: 'NWC y BitTasker: cómo funcionan juntos',
			body: 'BitTasker usa NWC como el método principal de conexión de wallet. Cuando te registras, conectas tu wallet compatible NWC a tu identidad Nostr. Cuando un cliente te contrata y financia el escrow, el Bitcoin se bloquea en un contrato inteligente — no en la wallet de BitTasker. Cuando completas el trabajo y el cliente libera el pago, los fondos fluyen directamente a tu wallet conectada vía NWC a través de Lightning. Esto significa que BitTasker nunca mantiene tus ganancias. Tu identidad Nostr, conexión de wallet y flujo de pagos están todos integrados a través de protocolos abiertos.'
		}
	],
	faq: [
		{
			question: '¿Es seguro Nostr Wallet Connect?',
			answer:
				'Sí, NWC está diseñado con encriptación de extremo a extremo y permisos granulares. Tus claves nunca salen de tu wallet y controlas exactamente qué puede hacer cada app.'
		},
		{
			question: '¿BitTasker soporta NWC?',
			answer:
				'Sí, NWC es el método principal de conexión de wallet en BitTasker. Conecta una wallet compatible NWC para recibir pagos directamente.'
		},
		{
			question: '¿Qué wallets funcionan con NWC?',
			answer:
				'Mutiny Wallet, Coinos, Aqua Wallet, Primal y wallets basadas en Cashu tienen soporte nativo. LND, CLN y LNbits pueden ejecutar servicios NWC.'
		},
		{
			question: '¿Puedo revocar el acceso NWC?',
			answer:
				'Sí, puedes revocar cualquier conexión NWC instantáneamente desde la configuración de tu wallet.'
		},
		{
			question: '¿Necesito una cuenta Nostr para usar NWC?',
			answer:
				'NWC usa pares de claves Nostr para autenticación, pero no necesitas un perfil social público de Nostr.'
		},
		{
			question: '¿Cuáles son las tarifas de usar NWC?',
			answer:
				'NWC no tiene tarifas — es un protocolo abierto. Se aplican tarifas estándar de red Lightning para el enrutamiento de pagos.'
		},
		{
			question: '¿Puedo usar NWC con una wallet hardware?',
			answer:
				'Sí, ejecutando un servicio NWC en un nodo conectado a tu wallet hardware vía Sparrow Wallet.'
		}
	],
	bitTaskerCta: {
		heading: 'Conecta Tu Wallet a BitTasker vía NWC',
		body: 'NWC es la forma en que BitTasker se conecta a tu wallet. Vincula tu wallet compatible NWC para empezar a recibir pagos en Bitcoin directamente.',
		buttonText: 'Empieza Ahora',
		buttonHref: '/auth/signup'
	}
};
