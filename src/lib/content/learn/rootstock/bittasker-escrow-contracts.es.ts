import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Contratos de Escrow de BitTasker: Cómo los Contratos Inteligentes Te Protegen',
		subtitle:
			'Los contratos de escrow de BitTasker en Rootstock bloquean fondos en código auditable. Ninguna plataforma retiene tu dinero — Bitcoin asegura cada transacción.'
	},
	answerBlock:
		'Los contratos de escrow de BitTasker son contratos inteligentes desplegados en Rootstock que manejan automáticamente los pagos de proyectos freelance. Cuando un cliente financia un proyecto, Bitcoin se bloquea en un contrato inteligente auditable — no en la cuenta bancaria de una empresa. El contrato aplica las reglas de pago: los fondos se liberan cuando se aprueban los hitos, y las disputas siguen una resolución transparente en cadena. Ambas partes pueden verificar el código del contrato antes de comprometerse, asegurando que no haya términos ocultos. La seguridad de Rootstock, respaldada por el hash rate de Bitcoin a través de merged mining, significa que los fondos de escrow están protegidos por la capa de seguridad más fuerte en criptomonedas. Esto elimina el riesgo de plataforma — incluso si BitTasker se desconecta, tus fondos de escrow siguen siendo accesibles en la blockchain de Rootstock.',
	sections: [
		{
			heading: '¿Cómo funciona el contrato inteligente de escrow de BitTasker?',
			body: 'Cuando un cliente publica un proyecto en BitTasker, financia el escrow depositando BTC (convertido a RBTC en Rootstock) en un contrato inteligente. El contrato especifica las condiciones de pago — típicamente, entrega basada en hitos con aprobación del cliente. Una vez financiado, el freelancer puede ver que los fondos están bloqueados y verificados en cadena. Cuando el freelancer entrega trabajo y el cliente aprueba, el contrato inteligente libera automáticamente el pago a la billetera del freelancer. Ningún humano en BitTasker toca los fondos en ningún momento. El flujo completo — desde el depósito hasta la liberación — está gobernado por código que ambas partes pueden auditar antes de acordar.'
		},
		{
			heading: '¿Qué garantías proporciona el contrato inteligente?',
			body: 'El contrato inteligente proporciona tres garantías que el escrow tradicional no puede ofrecer. Primero, inmutabilidad — una vez desplegado, las reglas del contrato no pueden ser cambiadas por BitTasker, el cliente o nadie más. El código es la autoridad final. Segundo, ejecución automática — el pago se libera cuando se cumplen las condiciones, sin requerir aprobación humana o intervención de la plataforma. Tercero, transparencia — ambas partes pueden leer el código del contrato en la blockchain de Rootstock y verificar exactamente cómo se manejarán sus fondos. Estas garantías reemplazan la confianza corporativa con certeza matemática. No necesitas confiar en BitTasker — verificas el código tú mismo.'
		},
		{
			heading: '¿Cómo funciona el bloqueo de fondos en el escrow de BitTasker?',
			body: 'El bloqueo de fondos en el escrow de BitTasker funciona a través de la gestión de estado del contrato inteligente. Cuando un cliente deposita fondos, el contrato entra en un estado "bloqueado" donde los fondos solo se pueden liberar bajo las condiciones especificadas. El contrato rastrea el estado del proyecto — de "financiado" a "en progreso" a "completado" o "en disputa". En cada estado, se permiten acciones específicas: el freelancer puede presentar evidencia de entrega, el cliente puede aprobar o disputar, y el contrato puede liberar o retener fondos. Esta máquina de estados asegura que los fondos se muevan solo según las reglas acordadas, con cada transición registrada en cadena para total audibilidad.'
		},
		{
			heading: '¿Cómo funciona la resolución de disputas?',
			body: 'Cuando un cliente y freelancer no están de acuerdo sobre la finalización del proyecto, el contrato de escrow de BitTasker entra en modo de disputa. Ambas partes presentan evidencia a través de la plataforma — el freelancer proporciona prueba de entrega, el cliente proporciona razones de rechazo. El contrato inteligente luego ejecuta la resolución basándose en reglas predefinidas codificadas en el contrato. Esto no es arbitrario — la lógica de resolución es determinista y auditable. En casos donde el contrato no puede determinar un resultado (ambigüedades genuinas), los fondos se retienen hasta que se alcance una resolución a través del proceso estructurado de la plataforma. Ninguna parte puede manipular el resultado una vez que las reglas del contrato están establecidas.'
		},
		{
			heading: '¿Por qué es importante la verificación en cadena?',
			body: 'La verificación en cadena significa que cada acción en el proceso de escrow se registra en la blockchain de Rootstock y puede ser verificada independientemente por cualquiera. Antes de financiar un proyecto, un cliente puede leer el código del contrato inteligente y confirmar exactamente cómo se manejará su dinero. Un freelancer puede verificar que los fondos realmente están bloqueados en el contrato antes de comenzar a trabajar. Después de la finalización del proyecto, ambas partes pueden confirmar la transacción de liberación de pago en la blockchain. Este nivel de transparencia es imposible con el escrow tradicional de plataformas, donde los registros internos de la empresa son la única fuente de verdad. En la blockchain, el código es la única fuente de verdad.'
		},
		{
			heading: '¿Qué pasa si BitTasker se desconecta?',
			body: 'Los fondos de escrow existen en la blockchain de Rootstock, no en los servidores de BitTasker. Si BitTasker se desconecta, los contratos inteligentes continúan funcionando exactamente como fueron diseñados — son programas autónomos ejecutándose en la red de Rootstock. Los usuarios pueden interactuar con los contratos directamente a través de billeteras compatibles con Rootstock o exploradores de bloques. Los fondos se pueden liberar cuando se cumplan las condiciones, o disputar a través de los mecanismos integrados del contrato, independientemente del estado operativo de BitTasker. Esta es la ventaja fundamental del escrow en cadena: tus fondos están protegidos por la blockchain, no por el uptime de una empresa.'
		},
		{
			heading: '¿Cómo asegura BitTasker la seguridad de los contratos?',
			body: 'BitTasker construye sus contratos de escrow usando bibliotecas de contratos inteligentes establecidas y auditadas (OpenZeppelin) y sigue las mejores prácticas de la industria para la seguridad de contratos. El código del contrato se publica en la blockchain de Rootstock para total transparencia y audibilidad. Rootstock mismo proporciona seguridad a nivel de Bitcoin a través de merged mining, protegiendo la red de ataques. BitTasker también implementa rate limiting, validación de entrada y controles de acceso dentro de los contratos para prevenir vectores de ataque comunes. Aunque ningún contrato inteligente es inmune a todos los riesgos, la combinación de código auditable, seguridad respaldada por Bitcoin y bibliotecas establecidas proporciona la protección más fuerte disponible para escrow freelance.'
		}
	],
	faq: [
		{
			question: '¿Cuánto cuesta el escrow de BitTasker?',
			answer:
				'BitTasker cobra una tarifa de servicio del 5–10% dependiendo del tamaño del proyecto, que cubre gestión de escrow, uso de la plataforma y resolución de disputas. Las tarifas de red de Rootstock para interacciones de contratos inteligentes son mínimas (típicamente menos de $0.01). No hay tarifas de escrow separadas encima de la tarifa de servicio.'
		},
		{
			question: '¿Puedo verificar el contrato de escrow antes de financiar?',
			answer:
				'Sí. El código del contrato inteligente de escrow se publica en la blockchain de Rootstock. Puedes leer y auditar el código antes de comprometer cualquier fondo. Esta transparencia asegura que entiendas exactamente cómo se manejará tu dinero.'
		},
		{
			question: '¿Qué pasa si el freelancer no entrega?',
			answer:
				'Si el freelancer no entrega, el cliente puede iniciar una disputa a través del contrato inteligente. El contrato retiene los fondos hasta que la disputa se resuelva según sus reglas predefinidas. Los fondos del cliente no se liberan hasta que se confirme la entrega o se alcance un resultado de resolución de disputa.'
		},
		{
			question: '¿Mis fondos de escrow están seguros de hacks?',
			answer:
				'Los fondos de escrow están protegidos por la red de Rootstock asegurada por Bitcoin a través de merged mining. El código del contrato inteligente es auditable y está construido usando bibliotecas establecidas. Aunque ningún sistema es 100% inmune al riesgo, la combinación de seguridad a nivel de Bitcoin y código auditable proporciona fuerte protección.'
		},
		{
			question: '¿Puedo usar el escrow de BitTasker para cualquier tipo de proyecto?',
			answer:
				'Sí. El escrow de BitTasker funciona para cualquier proyecto freelance — precio fijo, por hora o basado en hitos. El contrato inteligente se configura para coincidir con la estructura y términos de pago del proyecto.'
		},
		{
			question: '¿Cómo es diferente del escrow de Upwork o Fiverr?',
			answer:
				'El escrow tradicional de plataformas retiene tus fondos en las cuentas bancarias de la empresa. El escrow de BitTasker retiene fondos en un contrato inteligente público en la blockchain de Rootstock. Ninguna empresa controla los fondos — lo hace el código. Si BitTasker se desconecta, los fondos de escrow siguen siendo accesibles en cadena.'
		}
	],
	bitTaskerCta: {
		heading: 'Protege tu próximo proyecto con código, no con confianza',
		body: 'Los contratos de escrow de BitTasker en Rootstock reemplazan la confianza corporativa con contratos inteligentes auditables. Tu dinero está asegurado por el hash rate de Bitcoin — no por la cuenta bancaria de una empresa.',
		buttonText: 'Inicia un Proyecto Seguro',
		buttonHref: '/auth/signup'
	}
};
