import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'La billetera de BitTasker',
		subtitle: 'Una billetera con llave de acceso para Bitcoin, USDT en RGB y Lightning'
	},
	answerBlock:
		'La billetera de BitTasker se abre con la misma llave de acceso con la que entras. Guarda bitcoin y USDT en RGB, y puede pagar bitcoin por Lightning. No conectas otra app de billetera para usarla. BitTasker no custodia las monedas. Una compra con tarjeta o banco compra bitcoin a tu propia dirección. El proveedor cobra la tarjeta. No hay intercambio dentro de la app.',
	sections: [
		{
			heading: '¿Cómo la abro?',
			body: 'Regístrate con una llave de acceso en este dispositivo. No hay contraseña para entrar. La misma llave abre la billetera. Firmar cosas de rutina puede reutilizar ese inicio por un tiempo. Enviar, pagar una factura Lightning, bloquear la garantía, pagar una factura de garantía y exportar las palabras de recuperación vuelven a pedir la llave.'
		},
		{
			heading: '¿Qué puede guardar?',
			body: 'Bitcoin y USDT en RGB. Lightning en esta billetera es para bitcoin. El USDT en RGB no necesita un canal de Lightning. Puedes recibir cualquiera de los dos en esta billetera. Un saldo de una billetera vieja no aparece aquí aunque uses las mismas palabras: esta billetera es aparte.'
		},
		{
			heading: '¿Cómo agrego dinero?',
			body: 'Recibe Bitcoin o USDT de otra persona, o compra bitcoin con tarjeta o transferencia. La página de compra es del proveedor. BitTasker no ve tu tarjeta ni tus documentos. El bitcoin llega a tu propia dirección. Una compra con tarjeta no puede entregar USDT en RGB, así que ese botón compra bitcoin.'
		},
		{
			heading: '¿Cómo usa la billetera la garantía?',
			body: 'Publicar un servicio no abre la billetera. Un anuncio es solo una publicación. Cuando aceptan una oferta, bloquean Bitcoin o Lightning en garantía. USDT muy pronto. Quien trabaja entrega el resultado. Quien contrata lo aprueba. Quien trabaja pide el pago. Quien contrata paga esa factura. Suele tardar unos minutos. Nada se paga por un temporizador.'
		},
		{
			heading: '¿Quién puede escribirme?',
			body: 'Los mensajes directos se abren solo cuando la garantía está formada, y solo entre quien contrata y quien trabaja. Hasta entonces, usa la oferta. Las reseñas se abren solo después de pagar la factura.'
		},
		{
			heading: '¿Qué pasa si no estamos de acuerdo?',
			body: 'No pagues la factura. Cancela mientras el contrato siga abierto y sin pagar. No hay juez externo ni reembolso automático. Una factura pagada es definitiva.'
		}
	],
	faq: [
		{
			question: '¿BitTasker guarda mi bitcoin?',
			answer:
				'No. Las monedas están en la billetera que abres con tu llave de acceso. BitTasker no puede gastarlas. La garantía la bloquea quien contrata y la paga esa persona después de aprobar el trabajo.'
		},
		{
			question: '¿Puedo usar otra app de billetera?',
			answer:
				'No para esta billetera. El ingreso y los pagos usan la billetera con llave de acceso de BitTasker. No conectas una extensión del navegador.'
		},
		{
			question: '¿Puedo intercambiar dentro de la app?',
			answer:
				'No. Recibe Bitcoin o USDT, o compra bitcoin con tarjeta o transferencia. No hay intercambio entre redes.'
		},
		{
			question: '¿Qué es USDT en RGB?',
			answer:
				'Es el saldo en dólares de esta billetera. Se queda en esta billetera. Una compra con tarjeta envía bitcoin a tu dirección, porque esa compra no puede entregar estos dólares.'
		},
		{
			question: '¿Cuándo vuelvo a necesitar la llave de acceso?',
			answer:
				'Para entrar, abrir la billetera, enviar, pagar Lightning, bloquear la garantía, pagar una factura de garantía y exportar las palabras de recuperación.'
		},
		{
			question: '¿Puedo dejar una reseña antes de que me paguen?',
			answer: 'No. Las reseñas se abren solo después de pagar la factura de la garantía.'
		}
	],
	bitTaskerCta: {
		heading: 'Abre tu billetera con una llave de acceso',
		body: 'Regístrate, agrega Bitcoin o USDT y bloquea la garantía cuando contrates. Paga la factura después de aprobar el trabajo.',
		buttonText: 'Crea tu cuenta',
		buttonHref: '/auth/signup'
	}
};
