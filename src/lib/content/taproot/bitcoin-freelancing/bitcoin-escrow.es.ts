import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Cómo funciona la garantía en BitTasker',
		subtitle:
			'Quien contrata bloquea Bitcoin o Lightning. USDT muy pronto. Paga tu factura después de aprobar el trabajo.'
	},
	answerBlock:
		'La garantía en BitTasker guarda el monto acordado hasta que se aprueba el trabajo. Quien contrata bloquea Bitcoin o un pago Lightning. USDT muy pronto. Quien trabaja entrega el resultado. Quien contrata lo aprueba. Quien trabaja pide el pago. Quien contrata paga esa factura, lo que suele tardar unos minutos. BitTasker no puede gastar el monto bloqueado. Nada se paga por un temporizador y no hay un juez externo. Los mensajes directos se abren solo cuando la garantía está formada. Las reseñas se abren solo después de pagar la factura.',
	sections: [
		{
			heading: '¿Cómo se paga un trabajo?',
			body: 'Regístrate con una llave de acceso en este dispositivo. La misma llave abre tu billetera. Publica una tarea o envía una oferta. Cuando aceptan, bloquean el monto acordado en garantía. Haces el trabajo y lo entregas. Lo aprueban. Pides el pago. Pagan esa factura desde la misma billetera. Puedes fondear la billetera recibiendo Bitcoin o USDT, o comprando bitcoin con tarjeta o transferencia. El proveedor cobra la tarjeta. El bitcoin llega a tu propia dirección. BitTasker no ve la tarjeta.'
		},
		{
			heading: '¿Qué queda bloqueado y quién puede moverlo?',
			body: 'Quien contrata bloquea Bitcoin o Lightning. USDT muy pronto. BitTasker no retiene ese dinero y no puede pagarlo. Quien contrata paga la factura solo después de aprobar el trabajo. Una factura pagada es definitiva. Si no están de acuerdo antes de ese pago, cancelen mientras el contrato siga abierto y sin pagar. Cancelar no envía un reembolso por sí solo.'
		},
		{
			heading: '¿Cuándo pueden escribirse?',
			body: 'Usen la oferta para acordar el trabajo. Los mensajes directos se abren solo cuando la garantía está formada, y solo entre quien contrata y quien trabaja. Teléfono, correo y enlaces externos en una oferta se bloquean.'
		},
		{
			heading: '¿Qué pasa si no están de acuerdo?',
			body: 'No pagues la factura si el trabajo no es aceptable. Cualquiera puede cancelar mientras el contrato siga abierto y sin pagar. No hay un pago automático a los 7 días ni un reembolso automático a los 14 días. BitTasker no decide un reparto. Hablen en la oferta antes de la garantía, o en los mensajes después.'
		},
		{
			heading: '¿Cuándo se deja una reseña?',
			body: 'Una reseña se abre solo después de pagar la garantía. Quien contrata o quien trabaja puede dejar una calificación entonces. No hay reseña mientras el contrato siga sin pagar.'
		},
		{
			heading: '¿En qué se diferencia de pagar directo?',
			body: 'Pagar directo envía el dinero de inmediato. La garantía lo guarda hasta que apruebas el trabajo y pagas la factura. Sigues usando tu propia billetera. La llave de acceso se pide para bloquear y para pagar.'
		}
	],
	faq: [
		{
			question: '¿BitTasker retiene el dinero?',
			answer:
				'No. Quien contrata lo bloquea desde la billetera que abre con su llave de acceso. BitTasker no puede gastarlo.'
		},
		{
			question: '¿Qué pasa si nunca aprueban?',
			answer:
				'Nada se paga por un temporizador. No deben pagar la factura. Cualquiera puede cancelar mientras el contrato siga abierto y sin pagar.'
		},
		{
			question: '¿Puedo pagar con tarjeta?',
			answer:
				'Puedes comprar bitcoin con tarjeta o transferencia. El proveedor cobra la tarjeta. El bitcoin llega a tu propia dirección. La garantía en sí es Bitcoin o Lightning. USDT muy pronto.'
		},
		{
			question: '¿Conecto otra billetera?',
			answer:
				'No. Te registras con una llave de acceso y abres la billetera de BitTasker con esa llave. No hay intercambio dentro de la app ni otra red que conectar.'
		},
		{
			question: '¿Qué monedas puede usar la garantía?',
			answer: 'Bitcoin o Lightning. USDT muy pronto. Lightning en esta billetera es para bitcoin.'
		},
		{
			question: '¿Cuándo se abren las reseñas y los mensajes?',
			answer:
				'Los mensajes se abren cuando la garantía está formada. Las reseñas se abren después de pagar la factura.'
		}
	],
	bitTaskerCta: {
		heading: 'Bloquea el pago y luego haz el trabajo',
		body: 'Regístrate con una llave de acceso. Abre tu billetera. Publica una tarea o envía una oferta. La garantía guarda el monto hasta que se aprueba el trabajo y se paga la factura.',
		buttonText: 'Crea tu cuenta',
		buttonHref: '/auth/signup'
	},
	howTo: {
		name: 'Cómo funciona la garantía en BitTasker',
		description:
			'Del registro con llave de acceso al bloqueo, la entrega, la aprobación y el pago de la factura.',
		totalTime: 'PT10M',
		steps: [
			{
				name: 'Regístrate con una llave de acceso',
				text: 'Crea una cuenta en este dispositivo con una llave de acceso. La misma llave abre tu billetera.'
			},
			{
				name: 'Fondea la billetera',
				text: 'Recibe Bitcoin o USDT, o compra bitcoin con tarjeta o transferencia. Las compras con tarjeta llegan a tu propia dirección.'
			},
			{
				name: 'Acuerden el trabajo',
				text: 'Publica una tarea o envía una oferta. Usen la oferta para describir el trabajo. Los mensajes siguen cerrados hasta que la garantía está formada.'
			},
			{
				name: 'Bloquea la garantía',
				text: 'Quien contrata bloquea Bitcoin o Lightning. USDT muy pronto. BitTasker no puede gastarlo.'
			},
			{
				name: 'Entrega, aprueba y paga',
				text: 'Quien trabaja entrega el resultado. Quien contrata lo aprueba y paga la factura. Las reseñas se abren después de ese pago.'
			}
		]
	}
};
