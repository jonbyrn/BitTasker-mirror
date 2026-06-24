import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitBox02 vs Ledger: ¿Cuál Gana la Comparación?',
		subtitle:
			'Ingeniería suiza se encuentra con innovación francesa — comparación detallada de dos wallets premium'
	},
	answerBlock:
		'El BitBox02 (de Shift Crypto, Suiza) y Ledger (Francia) son ambas excelentes wallets de hardware con elementos seguros y componentes open source. El BitBox02 edición Bitcoin-only ($149) presenta un diseño Dual-chip con elemento seguro, sensores táctiles invisibles, respaldo MicroSD y firmware completamente open source. Ledger ofrece una gama más amplia de productos (Nano S Plus $79, Nano X $149, Stax $279) con un elemento seguro certificado y la app companion Ledger Live. Para usuarios exclusivamente de Bitcoin que quieren firmware completamente open source y diseño suizo elegante, el BitBox02 es mejor. Para usuarios multi-moneda que quieren una app móvil pulida y soporte más amplio de criptomonedas, Ledger gana.',
	sections: [
		{
			heading: '¿Qué hace diferente al BitBox02 de Ledger?',
			body: 'El BitBox02 se destaca en tres aspectos. Primero, es completamente open source — firmware y diseños de hardware son públicos, a diferencia de Ledger cuyo firmware del elemento seguro es propietario. Segundo, usa un diseño Dual-chip combinando un Microchip ATECC608B con un procesador STM32, proporcionando defensa en profundidad. Tercero, presenta sensores táctiles invisibles incrustados en los lados del dispositivo (sin botones visibles), dándole una apariencia limpia y minimalista. Incluye una ranura MicroSD para respaldo automático de seed phrase. El BitBox02 viene en edición Bitcoin-only y multi-moneda. Ledger ofrece más dispositivos en diferentes precios y soporta más de 5,500 criptomonedas, pero a costa de firmware propietario en el elemento seguro.'
		},
		{
			heading: '¿Cuál es más seguro?',
			body: 'Ambos proporcionan excelente seguridad para uso diario. El firmware completamente open source del BitBox02 significa que todo el código es auditable públicamente. Su arquitectura Dual-chip proporciona dos capas independientes. El elemento seguro certificado de Ledger (Common Criteria EAL5+) ha pasado evaluaciones formales de seguridad. La diferencia: el código del elemento seguro de Ledger no es públicamente auditable, mientras que el del BitBox02 sí. Para usuarios que valoran la transparencia y verificabilidad, el BitBox02 gana. Para quienes priorizan certificación formal de seguridad, Ledger tiene ventaja. Ambos son mucho más seguros que wallets de software.'
		},
		{
			heading: '¿Cómo se comparan los precios?',
			body: 'BitBox02: edición Bitcoin-only ($149) o multi-moneda ($149), ambos en shiftcrypto.ch. Ledger: Nano S Plus ($79), Nano X ($149), Stax ($279) en ledger.com. El BitBox02 a $149 iguala el precio del Nano X pero incluye elemento seguro, respaldo MicroSD y firmware completamente open source. El Ledger Nano S Plus a $79 es la opción más económica si el presupuesto es la principal preocupación.'
		},
		{
			heading: '¿Cómo se compara la experiencia de configuración?',
			body: 'Ambos ofrecen configuración guiada a través de apps companion. El BitBoxApp proporciona una interfaz limpia y minimalista. Durante la configuración, el BitBox02 respalda automáticamente tu seed phrase en una tarjeta MicroSD encriptada — una función única que simplifica la gestión de respaldos. Ledger Live es una app más completa con soporte para staking, DeFi y NFTs. Ambos requieren anotar una seed phrase de 24 palabras, pero el respaldo MicroSD del BitBox02 proporciona una opción de recuperación adicional.'
		},
		{
			heading: '¿Cuál funciona mejor con BitTasker?',
			body: 'Ambos se integran bien con BitTasker. El BitBox02 se combina con Sparrow Wallet y el BitBoxApp para gestionar direcciones de recepción de Bitcoin. Ledger funciona con Ledger Live para el mismo propósito. Para pagos Lightning, ninguno soporta Lightning directamente — usa una wallet Lightning para transacciones diarias. El firmware completamente open source del BitBox02 puede ser atractivo para usuarios de BitTasker que priorizan la transparencia en su stack de seguridad.'
		}
	],
	faq: [
		{
			question: '¿Es BitBox02 más seguro que Ledger?',
			answer:
				'El BitBox02 es más transparente (completamente open source) mientras Ledger tiene un elemento seguro certificado formalmente (EAL5+). Ambos son altamente seguros. BitBox02 gana en verificabilidad; Ledger gana en certificación formal.'
		},
		{
			question: '¿Cuánto cuesta el BitBox02?',
			answer:
				'El BitBox02 cuesta $149 USD para la edición Bitcoin-only o multi-moneda, disponible en shiftcrypto.ch. Iguala el precio del Ledger Nano X ($149) pero incluye firmware open source y respaldo MicroSD.'
		},
		{
			question: '¿Puedo usar BitBox02 con BitTasker?',
			answer:
				'Sí. Combina el BitBox02 con Sparrow Wallet o el BitBoxApp para generar direcciones de recepción, luego agrégalas a tu perfil de BitTasker.'
		},
		{
			question: '¿BitBox02 soporta altcoins?',
			answer:
				'La edición multi-moneda soporta Bitcoin, Ethereum y altcoins seleccionadas. La edición Bitcoin-only solo soporta Bitcoin. Para soporte extenso de altcoins, Ledger es mejor.'
		},
		{
			question: '¿BitBox02 es completamente open source?',
			answer:
				'Sí, completamente open source — firmware y diseños de hardware están disponibles públicamente. Ledger es parcialmente open source.'
		},
		{
			question: '¿Qué es el respaldo MicroSD?',
			answer:
				'El BitBox02 puede encriptar y almacenar automáticamente tu seed phrase en una tarjeta MicroSD. Si pierdes el dispositivo, inserta la MicroSD en un nuevo BitBox02 para recuperar tu wallet.'
		},
		{
			question: '¿Dónde puedo comprar un BitBox02 o Ledger?',
			answer:
				'Compra el BitBox02 en shiftcrypto.ch y Ledger en ledger.com. Nunca compres en Amazon, eBay o revendedores no autorizados.'
		}
	],
	bitTaskerCta: {
		heading: 'Protege Tus Ganancias Bitcoin de Freelance',
		body: 'Gana Bitcoin en BitTasker, almacénalo de forma segura en un BitBox02 o Ledger. BitBox02 para transparencia open source, Ledger para flexibilidad multi-moneda.',
		buttonText: 'Empieza Ahora',
		buttonHref: '/auth/signup'
	}
};
