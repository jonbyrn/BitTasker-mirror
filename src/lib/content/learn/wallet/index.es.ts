import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Guía de Billeteras Bitcoin: Todo lo que Necesitas',
		subtitle:
			'Wallets hardware, wallets software, comparativas y educación — tu referencia completa'
	},
	answerBlock:
		'Elegir la billetera Bitcoin correcta es la decisión más importante que tomarás como usuario de Bitcoin. Esta guía cubre wallets hardware (Coldcard, Trezor, BitBox, Passport) para almacenamiento en frío, wallets software (Sparrow, Electrum) para gestión de escritorio, wallets móviles (Aqua, Blink) para gasto diario y wallets Lightning para pagos instantáneos. Ya sea que estés protegiendo tus primeros $100 o asegurando ahorros que cambian tu vida, la configuración correcta equilibra seguridad, conveniencia y costo. La mayoría de bitcoiners experimentados usan un enfoque de dos niveles: una wallet hardware para ahorros y una wallet móvil para gastos.',
	sections: [
		{
			heading: 'Wallets Hardware: Seguridad de Almacenamiento en Frío',
			body: 'Las wallets hardware son el estándar de oro para proteger Bitcoin. Almacenan tus claves privadas en un chip seguro resistente a la manipulación que nunca expone las claves a internet. Opciones principales: Coldcard Mk4 ($150) — la wallet más enfocada en seguridad, solo Bitcoin, firma air-gapped vía NFC, sin USB, completamente open source con compilaciones reproducibles. Trezor Model T ($219) — interfaz táctil, soporta Bitcoin y altcoins, completamente open source. BitBox02 ($149) — compacta, respaldo microSD, diseño elegante. Foundation Passport ($249) — firma premium basada en QR con pantalla grande. Ledger Nano X ($149) — mayor soporte de criptomonedas pero elemente seguro de código cerrado. Para máxima seguridad Bitcoin, Coldcard es la elección de consenso entre usuarios enfocados en seguridad.'
		},
		{
			heading: 'Wallets Software: Gestión de Bitcoin de Escritorio',
			body: 'Las wallets software corren en tu computadora y ofrecen funciones avanzadas para usuarios expertos. Sparrow Wallet es la wallet de escritorio Bitcoin líder — completa, enfocada en privacidad, soporta multi-signature, CoinJoin e integración con wallets hardware. Electrum es la wallet Bitcoin más longeva (desde 2011), ligera y extensible con plugins. Ambas soportan conectividad con wallets hardware, permitiéndote usar tu Coldcard, Trezor o BitBox con una interfaz de escritorio. Las wallets software son ideales para: gestionar transacciones complejas, configurar wallets multi-signature, CoinJoin para privacidad y análisis detallado de transacciones.'
		},
		{
			heading: 'Wallets Móviles: Gasto Diario de Bitcoin',
			body: 'Las wallets móviles están optimizadas para conveniencia y uso diario. Aqua Wallet es autocustodial, soportando Bitcoin, Liquid Network y Lightning en una app — la opción móvil más versátil para usuarios que quieren control de claves. Blink Wallet es custodial y nativa de Lightning, construida para simplicidad con balance en dólares, ideal para usuarios en El Salvador y Latinoamérica. Ambas son gratuitas. Para autocustodia en móvil, Aqua es la mejor opción. Para simplicidad y conveniencia Lightning, Blink es excelente. Nunca almacenes más que dinero de gasto en una wallet móvil — los teléfonos se pierden, roban y comprometen regularmente.'
		},
		{
			heading: 'Wallets Lightning: Pagos Instantáneos con Bajas Comisiones',
			body: 'La Lightning Network habilita pagos instantáneos de Bitcoin con comisiones insignificantes (típicamente menos de 1 satoshi). Aqua Wallet soporta Lightning junto con on-chain y Liquid. Blink Wallet es nativa de Lightning con la UX más simple para pagos diarios. Phoenix Wallet (Android/iOS) es una wallet Lightning autocustodial popular con gestión automática de canales. Para comerciantes y freelancers, Lightning es el canal de pago preferido — los pagos se liquidan en segundos, no minutos. BitTasker usa Lightning para pagos instantáneos a freelancers, siendo la forma más rápida de recibir Bitcoin por trabajo.'
		},
		{
			heading: 'Comparativas de Wallets Hardware',
			body: 'Coldcard vs Trezor: Coldcard es solo Bitcoin, air-gapped y completamente open source — mejor para puristas de seguridad. Trezor soporta altcoins, tiene pantalla táctil y es más amigable para principiantes. Coldcard vs Ledger: Coldcard es completamente open source; Ledger usa un elemente seguro de código cerrado. Coldcard ofrece firma air-gapped; Ledger requiere USB. Para seguridad solo Bitcoin, Coldcard gana. Trezor vs Ledger: Trezor es completamente open source; Ledger tiene mayor rango de criptomonedas soportadas. La pantalla táctil de Trezor (Model T) es más intuitiva. Passport vs Coldcard: Ambas ofrecen firma air-gapped. Passport usa códigos QR; Coldcard usa NFC. Passport tiene pantalla más grande; Coldcard tiene más trayectoria.'
		},
		{
			heading: 'Cómo elegir la billetera Bitcoin correcta',
			body: 'Pregúntate: ¿Para qué la usarás? Ahorros = wallet hardware. Gasto diario = wallet móvil. ¿Cuánto Bitcoin posees? Menos de $500 en dinero de gasto funciona en móvil. Ahorros significativos pertenecen a hardware. ¿Necesitas Lightning? Si haces pagos pequeños frecuentes, sí — elige Aqua o Blink. ¿Cuál es tu nivel técnico? Principiantes: Blink (más simple) o Aqua (autocustodial pero amigable). Intermedio: Trezor + Sparrow. Avanzado: Coldcard + Sparrow con multisig. La configuración de dos niveles recomendada: Coldcard o BitBox para ahorros, Aqua Wallet para gasto. Esto te da máxima seguridad para tu riqueza y máxima conveniencia para transacciones diarias.'
		}
	],
	faq: [
		{
			question: '¿Cuál es la mejor billetera Bitcoin para principiantes?',
			answer:
				'Blink Wallet para la experiencia más simple con balance en dólares. Aqua Wallet si quieres autocustodia desde el primer día. Ambas son gratuitas en iOS y Android.'
		},
		{
			question: '¿Cuál es la billetera Bitcoin más segura?',
			answer:
				'Coldcard Mk4 — completamente open source, firma air-gapped, sin USB, compilaciones reproducibles. Combinada con respaldo de acero y passphrase BIP39, proporciona seguridad de nivel institucional.'
		},
		{
			question: '¿Cuánto cuesta una billetera Bitcoin?',
			answer:
				'Las wallets móviles (Aqua, Blink) son gratuitas. Las wallets hardware van de $79 a $249. Coldcard ~$150, Trezor Model T ~$219, BitBox02 ~$149, Foundation Passport ~$249.'
		},
		{
			question: '¿Puedo usar múltiples billeteras Bitcoin?',
			answer:
				'Sí, y deberías. La mayoría de usuarios experimentados mantienen ahorros en una wallet hardware y dinero de gasto en una wallet móvil. Este modelo "ahorros + cuenta corriente" equilibra seguridad y conveniencia.'
		},
		{
			question: '¿Cuál es la diferencia entre wallet hot y wallet cold?',
			answer:
				'Una wallet hot (móvil/escritorio) está conectada a internet — conveniente pero vulnerable. Una wallet cold (dispositivo hardware) mantiene claves offline — segura pero menos conveniente. Usa ambas juntas.'
		},
		{
			question: '¿Qué wallet funciona con BitTasker?',
			answer:
				'Cualquier wallet compatible con Lightning funciona para recibir pagos — Blink, Aqua, Phoenix y otras. BitTasker también soporta MetaMask, Ledger, Trezor y WalletConnect.'
		},
		{
			question: '¿Necesito una wallet hardware?',
			answer:
				'Si tus tenencias de Bitcoin son menores a unos cientos de dólares, una wallet móvil autocustodial como Aqua es suficiente. Cuando tus ahorros superen $500–$1000, invertir en una wallet hardware vale la pena.'
		},
		{
			question: '¿Qué pasa si pierdo mi wallet hardware?',
			answer:
				'Tu Bitcoin está seguro si tienes tu respaldo de seed phrase. Compra una nueva wallet hardware y restaura usando tu seed phrase. Por eso los respaldos de acero son críticos.'
		}
	],
	bitTaskerCta: {
		heading: 'Usa Tu Wallet para Ganar en BitTasker',
		body: 'Cualquiera sea tu wallet, BitTasker te permite recibir pagos freelance en Bitcoin vía Lightning, on-chain o vía escrow multi-chain. Recibe directamente en tu wallet — sin intermediario custodial.',
		buttonText: 'Empieza con Bitcoin',
		buttonHref: '/auth/signup'
	}
};
