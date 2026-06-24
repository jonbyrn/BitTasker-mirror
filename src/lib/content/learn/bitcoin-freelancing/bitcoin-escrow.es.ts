import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Escrow en Bitcoin: Cómo los Contratos Inteligentes Protegen a Freelancers',
		subtitle:
			'Los contratos inteligentes de Rootstock reemplazan la confianza corporativa con código. Aprende cómo el escrow en Bitcoin asegura cada proyecto.'
	},
	answerBlock:
		'El escrow en Bitcoin usa contratos inteligentes en Rootstock (una sidechain de Bitcoin) para bloquear los fondos del proyecto en código auditable hasta que tanto el freelancer como el cliente confirmen la finalización. A diferencia del escrow tradicional gestionado por empresas de plataforma, el escrow en Bitcoin es sin necesidad de confianza — ninguna entidad puede congelar, redirigir o manipular los fondos. En BitTasker, los contratos de escrow liberan el pago automáticamente cuando se aprueban los hitos, y las disputas siguen reglas transparentes de resolución en cadena. Esto elimina el riesgo de que los clientes no paguen después de que se entregue el trabajo, o que las plataformas retengan las ganancias de los freelancers.',
	sections: [
		{
			heading: '¿Cómo funciona el escrow en Bitcoin?',
			body: 'El escrow en Bitcoin opera a través de contratos inteligentes — programas autoejecutables desplegados en una blockchain que aplican reglas predefinidas. Cuando un cliente contrata a un freelancer en BitTasker, los fondos del proyecto se depositan en un contrato inteligente de Rootstock. El contrato bloquea estos fondos y especifica las condiciones de liberación: típicamente, confirmación de entrega de ambas partes o resolución de una disputa. Una vez que se cumplen las condiciones, el contrato envía automáticamente Bitcoin al freelancer. Ningún intermediario humano toca los fondos durante este proceso. El código es auditable en la blockchain, así que ambas partes pueden verificar la lógica del contrato antes de comprometerse.'
		},
		{
			heading: 'Escrow tradicional vs escrow en Bitcoin',
			body: 'El escrow tradicional de plataformas depende de que una empresa retenga tus fondos en sus cuentas bancarias. Upwork, Fiverr y Freelancer.com operan sistemas de escrow internos donde la plataforma actúa como custodio y juez. Si la plataforma se cae, congela tu cuenta o cambia sus términos, tus fondos están en riesgo. El escrow en Bitcoin elimina a la empresa de la ecuación. Los fondos se bloquean en un contrato inteligente público que ninguna entidad controla. Las reglas son transparentes, auditables y ejecutadas por código. Si BitTasker desapareciera mañana, los fondos de escrow en Rootstock seguirían siendo accesibles a través de la blockchain.'
		},
		{
			heading: '¿Qué es Rootstock y por qué se usa para escrow?',
			body: 'Rootstock (RSK) es una sidechain de Bitcoin — una red de Capa 2 que trae capacidades de contratos inteligentes a Bitcoin mientras hereda el modelo de seguridad de Bitcoin. A diferencia de los contratos inteligentes de Ethereum, los contratos de Rootstock están respaldados por la tasa de hash de Bitcoin a través de merged mining, convirtiéndolos en algunos de los contratos inteligentes más seguros de la industria. Para escrow, Rootstock ofrece varias ventajas: tarifas de transacción más bajas que Ethereum, seguridad a nivel de Bitcoin, y la capacidad de usar BTC directamente en contratos sin envolver o convertir. BitTasker eligió Rootstock específicamente porque combina la seguridad de Bitcoin con la programabilidad necesaria para escrow complejo y resolución de disputas.'
		},
		{
			heading: '¿Cómo funciona la resolución de disputas en el escrow en Bitcoin?',
			body: 'Cuando ambas partes acuerdan la finalización del proyecto, la resolución es simple — el contrato inteligente libera el pago. Las disputas surgen cuando un freelancer entrega trabajo que el cliente dice está incompleto, o cuando un cliente solicita cambios de alcance que el freelancer considera fuera del acuerdo. En BitTasker, la resolución de disputas sigue un proceso estructurado: ambas partes presentan evidencia a través de la plataforma, y el contrato inteligente ejecuta la resolución basándose en reglas predefinidas. Esto es más lento que un agente de soporte humano cuando ambas partes cooperan, pero es transparente, auditable y libre del sesgo que puede afectar a mediadores humanos.'
		},
		{
			heading: '¿Por qué importa el escrow para los freelancers?',
			body: 'El escrow protege a los freelancers del riesgo más común en el trabajo remoto: completar un proyecto y no recibir pago. Sin escrow, un cliente podría recibir los entregables y simplemente rehusarse a pagar — dejando al freelancer sin recurso. El escrow en Bitcoin resuelve esto al bloquear fondos en un contrato inteligente antes de que comience el trabajo. El freelancer ve confirmación de que los fondos están bloqueados, y sabe que el pago llegará cuando entregue. Esto elimina la ansiedad de pago que plaga las relaciones freelance y crea un ambiente de trabajo más profesional y confiable.'
		},
		{
			heading: '¿Por qué importa el escrow para los clientes?',
			body: 'El escrow también protege a los clientes asegurando que solo paguen por trabajo que cumpla las especificaciones acordadas. Sin escrow, los clientes arriesgan pagar por adelantado y recibir trabajo subestándar — o ningún trabajo. El escrow en Bitcoin retiene fondos hasta que el cliente apruebe la entrega, dándole tiempo para revisar los entregables antes de que se libere el pago. El contrato inteligente asegura que los fondos solo puedan liberarse según los términos acordados, impidiendo que los freelancers reclamen pago sin completar el trabajo.'
		},
		{
			heading: '¿Cómo se compara el escrow de BitTasker con otras plataformas?',
			body: 'El escrow basado en Rootstock de BitTasker difiere del escrow tradicional de plataformas en tres aspectos clave. Primero, es sin necesidad de confianza — ninguna empresa retiene los fondos, lo hace el código. Segundo, es auditable — ambas partes pueden verificar el contrato en la blockchain antes de acordar. Tercero, es portable — los fondos de escrow existen en la blockchain de Rootstock, no en la cuenta bancaria de una plataforma, haciéndolos accesibles incluso si la plataforma se desconecta. Las plataformas tradicionales como Upwork y Fiverr mantienen el escrow interno, sin darte visibilidad de dónde están realmente tus fondos o cómo están protegidos.'
		}
	],
	faq: [
		{
			question: '¿Es seguro el escrow en Bitcoin?',
			answer:
				'Sí. El escrow en Bitcoin en Rootstock está respaldado por el modelo de seguridad de Bitcoin a través de merged mining. Los contratos inteligentes son auditables en la blockchain, lo que significa que ambas partes pueden verificar el código antes de comprometer fondos. El riesgo de manipulación es extremadamente bajo comparado con el escrow centralizado retenido por empresas de plataforma.'
		},
		{
			question: '¿Qué pasa si una disputa no se puede resolver?',
			answer:
				'Si ambas partes no llegan a un acuerdo, la resolución de disputas de BitTasker sigue las reglas predefinidas del contrato inteligente. En casos extremos, los fondos pueden permanecer bloqueados hasta que se alcance una resolución a través del proceso estructurado de presentación de evidencia de la plataforma. El proceso está diseñado para ser justo y transparente, con resultados determinados por el código del contrato en lugar del juicio humano.'
		},
		{
			question: '¿El escrow en Bitcoin cuesta comisiones extra?',
			answer:
				'La tarifa de servicio de BitTasker (5–10%) cubre la gestión de escrow, uso de la plataforma y resolución de disputas. No hay tarifas de escrow separadas encima de la tarifa de servicio. Las tarifas de red de Rootstock para interacciones de contratos inteligentes son mínimas (típicamente menos de $0.01).'
		},
		{
			question: '¿Puedo usar escrow en Bitcoin para cualquier tipo de proyecto freelance?',
			answer:
				'Sí. El escrow en Bitcoin funciona para cualquier tipo de proyecto — precio fijo, por hora o basado en hitos. El contrato inteligente se configura para coincidir con la estructura de pago del proyecto. Desde desarrollo de software hasta diseño hasta consultoría, cualquier compromiso freelance puede usar escrow en Bitcoin para gestión segura de fondos.'
		},
		{
			question: '¿Cómo difiere el escrow de Rootstock del escrow de Ethereum?',
			answer:
				'El escrow de Rootstock está respaldado por la tasa de hash de Bitcoin a través de merged mining, haciéndolo más seguro que las alternativas basadas en Ethereum. Usa BTC directamente sin envolver, tiene tarifas de transacción más bajas, y se beneficia del modelo de seguridad probado de Bitcoin en lugar del mecanismo de consenso separado de Ethereum.'
		},
		{
			question: '¿Qué pasa si BitTasker se desconecta — mis fondos de escrow están seguros?',
			answer:
				'Sí. Los fondos de escrow existen en la blockchain de Rootstock, no en los servidores de BitTasker. Incluso si BitTasker se desconecta, puedes interactuar con el contrato inteligente directamente a través de la blockchain de Rootstock para acceder o gestionar tus fondos. Esta es la ventaja fundamental del escrow en cadena sobre el escrow retenido por plataformas.'
		}
	],
	bitTaskerCta: {
		heading: 'Asegura tu próximo proyecto con escrow en Bitcoin',
		body: 'Los contratos inteligentes de Rootstock de BitTasker protegen tanto a freelancers como a clientes con escrow auditable y sin necesidad de confianza. Ninguna empresa retiene tus fondos — lo hace el código.',
		buttonText: 'Inicia un Proyecto Seguro',
		buttonHref: '/auth/signup'
	}
};
