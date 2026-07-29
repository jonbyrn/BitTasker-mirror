import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker Wallet: Pagos Freelance en Bitcoin',
		subtitle: 'Conecta tu billetera, cobra en Bitcoin — con protección de escrow en cada trabajo'
	},
	answerBlock:
		'BitTasker Wallet es el sistema de pago integrado que potencia la plataforma de freelance BitTasker. Conecta tu billetera Bitcoin existente — ya sea MetaMask, Ledger, Trezor o cualquier app compatible con WalletConnect — para recibir y enviar pagos en Bitcoin, Lightning y Rootstock (RBTC). Cada transacción está protegida por escrow de smart contracts en la red Rootstock, asegurando que los fondos solo se liberen cuando el trabajo sea aprobado. Tú mantienes el control de tus claves en todo momento — BitTasker nunca guarda tu Bitcoin. Este modelo de autocustodia combinado con protección de escrow de smart contracts ofrece a freelancers y clientes la seguridad del escrow tradicional con la velocidad y tarifas bajas de Bitcoin.',
	sections: [
		{
			heading: 'Cómo Funciona la Integración de BitTasker Wallet',
			body: 'BitTasker no te obliga a usar una billetera propietaria. En cambio, se conecta a la billetera que ya posees a través de WalletConnect, MetaMask, Ledger o Trezor. Cuando creas una cuenta de BitTasker, vinculas tu billetera preferida. Cuando un cliente te contrata, financia un smart contract de escrow en la red Rootstock con RBTC (Rootstock Bitcoin). Cuando completas el trabajo y el cliente lo aprueba, el smart contract libera automáticamente el pago a tu billetera. Si hay una disputa, el sistema de resolución de BitTasker la maneja antes de que se liberen los fondos. Este modelo significa que nunca depositas Bitcoin en BitTasker — la plataforma es una capa de coordinación y escrow, no un custodio.'
		},
		{
			heading: 'Qué Billeteras Soporta BitTasker',
			body: 'BitTasker soporta las billeteras más populares de Bitcoin y compatibles con Ethereum a través de WalletConnect e integración directa. MetaMask es la opción principal para usuarios Web3, conectando directamente a BitTasker para transacciones en Rootstock (RBTC). Los hardware wallets Ledger y Trezor son soportados para usuarios que quieren seguridad de almacenamiento en frío con su cuenta de BitTasker. Cualquier billetera compatible con WalletConnect — incluyendo Rainbow, Trust Wallet y Frame — puede conectarse a la plataforma. Para pagos Lightning, BitTasker integra con billeteras habilitadas como Blink y Aqua, permitiendo pagos instantáneos en BTC. Este enfoque multi-billetera significa que puedes usar la billetera que mejor se adapte a tu flujo de trabajo, sin comprometer seguridad o conveniencia.'
		},
		{
			heading: 'Qué Es la Protección de Escrow con Smart Contracts de Rootstock',
			body: 'Cada trabajo en BitTasker está respaldado por un smart contract de escrow en la red Rootstock (RSK), una sidechain de Bitcoin que soporta smart contracts compatibles con Ethereum. Cuando un cliente crea un trabajo, bloquea el pago en un smart contract. Los fondos son sostenidos por el contrato — no por BitTasker — hasta que el freelancer complete el trabajo y el cliente lo apruebe. Si ambas partes están de acuerdo, el pago se libera automáticamente. Si hay desacuerdo, el proceso de resolución de disputas de BitTasker media antes de que cualquier fondos se mueva. Esto elimina el problema de confianza en el trabajo freelance: los freelancers están garantizados de pago por trabajo completado, y los clientes solo pagan por trabajo que aprueben. La red Rootstock usa RBTC (anclado 1:1 a Bitcoin) para transacciones, manteniendo tarifas bajas mientras hereda el modelo de seguridad de Bitcoin.'
		},
		{
			heading: 'Puedo Comprar, Vender e Intercambiar Cripto en BitTasker',
			body: 'Sí. La integración de billetera de BitTasker soporta compra, venta e intercambio entre Bitcoin, Lightning y RBTC. Puedes comprar Bitcoin directamente a través de servicios integrados de on-ramp, convertir entre BTC on-chain y Lightning para diferentes casos de uso, o intercambiar entre BTC y RBTC para interacciones de smart contracts en Rootstock. Estas funciones están integradas en la plataforma para que no necesites usar un exchange separado. El modelo de autocustodia significa que todos los intercambios ocurren desde tu billetera conectada — BitTasker nunca toma custodia de tus fondos durante el proceso. Esto es particularmente útil para freelancers que reciben pago en un formato (ej., Lightning) pero quieren guardar ahorros en otro (ej., BTC on-chain o RBTC).'
		},
		{
			heading: 'Es BitTasker Wallet de Autocustodia?',
			body: 'Sí, BitTasker sigue un modelo de autocustodia. Conectas tu propia billetera — ya sea MetaMask, Ledger, Trezor o una app compatible con WalletConnect — y mantienes control total de tus claves privadas en todo momento. BitTasker nunca guarda, gestiona ni tiene acceso a tu Bitcoin. La plataforma opera como una capa de coordinación y escrow: los smart contracts en Rootstock sostienen fondos temporalmente durante trabajos activos, pero estos contratos están en la blockchain y son verificables. Cuando el trabajo es aprobado, los fondos se mueven directamente a tu billetera. Cuando no hay trabajos activos, tu Bitcoin está en tu billetera, no en los servidores de BitTasker. Esta es la diferencia fundamental entre BitTasker y las plataformas tradicionales de freelance, que guardan tus ganancias en sus propias cuentas hasta que las retiras.'
		},
		{
			heading: 'Cómo Funcionan los Pagos Lightning en BitTasker',
			body: 'BitTasker soporta Lightning Network para pagos instantáneos y de bajo costo. Cuando un cliente aprueba tu trabajo, puedes recibir el pago por Lightning en lugar de esperar la confirmación on-chain. Los pagos Lightning en BitTasker se liquidan en segundos con tarifas negligible — típicamente fracciones de centavo. Para recibir pagos Lightning, conecta una billetera compatible con Lightning como Blink Wallet o Aqua Wallet a tu cuenta de BitTasker. También puedes recibir pagos on-chain (Bitcoin mainnet) o vía RBTC en Rootstock, según tu preferencia. La opción Lightning es especialmente valiosa para pagos más pequeños, propinas y transacciones frecuentes donde las tarifas on-chain comerían en tus ganancias. BitTasker también soporta protección de escrow en pagos Lightning, asegurando que incluso los pagos instantáneos sean seguros.'
		}
	],
	faq: [
		{
			question: '¿BitTasker guarda mi Bitcoin?',
			answer:
				'No. BitTasker es de no-custodia. Conectas tu propia billetera (MetaMask, Ledger, Trezor o compatible con WalletConnect) y mantienes control total de tus claves. BitTasker nunca guarda tu Bitcoin — los smart contracts en Rootstock sostienen temporalmente los fondos de escrow durante trabajos activos.'
		},
		{
			question: 'Qué pasa si un cliente disputa mi trabajo en BitTasker?',
			answer:
				'BitTasker tiene un sistema de resolución de disputas. Si un cliente disputa tu trabajo, el smart contract de escrow sostiene los fondos hasta que ambas partes lleguen a un acuerdo o el proceso de resolución de BitTasker tome una determinación. Tu pago está protegido — los clientes no pueden retirar fondos en escrow sin completar el proceso de disputa.'
		},
		{
			question: 'Puedo usar cualquier billetera Bitcoin con BitTasker?',
			answer:
				'BitTasker soporta MetaMask, Ledger, Trezor y cualquier billetera compatible con WalletConnect. Para pagos Lightning, usa Blink Wallet, Aqua Wallet o cualquier billetera habilitada con Lightning. La plataforma está diseñada para funcionar con la billetera que ya posees.'
		},
		{
			question: 'Qué es Rootstock y por qué BitTasker lo usa?',
			answer:
				'Rootstock (RSK) es una sidechain de Bitcoin que soporta smart contracts compatibles con Ethereum. BitTasker usa Rootstock para smart contracts de escrow porque hereda el modelo de seguridad de Bitcoin mientras habilita lógica de escrow programable. Las transacciones usan RBTC, anclado 1:1 a Bitcoin.'
		},
		{
			question: 'Cuánto cuesta usar BitTasker Wallet?',
			answer:
				'BitTasker no cobra tarifas por conectar tu billetera o recibir pagos. Se aplican tarifas de red estándar: tarifas on-chain de Bitcoin, tarifas Lightning (negligible) o tarifas de transacción de Rootstock. Las interacciones de smart contracts de escrow en Rootstock tienen tarifas bajas comparadas con Ethereum.'
		},
		{
			question: 'Puedo recibir pagos tanto en Bitcoin como en RBTC?',
			answer:
				'Sí. BitTasker soporta pagos en Bitcoin (on-chain y Lightning) y RBTC (Rootstock). Puedes elegir tu método de pago preferido al configurar tu perfil, y los clientes pueden pagar usando el método que les convenga.'
		}
	],
	bitTaskerCta: {
		heading: 'Conecta Tu Billetera y Empieza a Ganar',
		body: 'Regístrate en BitTasker, conecta tu billetera Bitcoin preferida y empieza a recibir pagos de freelance con protección de escrow en BTC, Lightning o RBTC.',
		buttonText: 'Crea Tu Cuenta',
		buttonHref: '/auth/signup'
	}
};
