export interface StaffCopy {
	title: string;
	off: string;
	post: string;
	empty: string;
	loadError: string;
	role: string;
	date: string;
	endDate: string;
	start: string;
	end: string;
	days: string;
	location: string;
	people: string;
	rate: string;
	requirements: string;
	chooseRole: string;
	shiftTitle: string;
	invite: string;
	apply: string;
	accept: string;
	pick: string;
	decline: string;
	fund: string;
	checkIn: string;
	checkOut: string;
	hoursWorked: string;
	expected: string;
	approve: string;
	approvedHours: string;
	release: string;
	invoice: string;
	dispute: string;
	disputeNote: string;
	rateWorker: string;
	rateBusiness: string;
	favourite: string;
	rebook: string;
	login: string;
	loginLink: string;
	back: string;
	openTab: string;
	mineTab: string;
	mineEmpty: string;
	loading: string;
	slow: string;
	retry: string;
	anyRole: string;
	maxRate: string;
	onOrAfter: string;
	picked: string;
	status: string;
	showExpired: string;
	you: string;
	save: string;
	sending: string;
	noKyc: string;
	noFee: string;
	asset: string;
	usdt: string;
	bitcoin: string;
	btcPartial: string;
	walletClosed: string;
	escrowPending: string;
	fundFirst: string;
	released: string;
	errors: Record<string, string>;
}

const EN: StaffCopy = {
	title: 'Shifts',
	off: 'Temp staff is not turned on.',
	post: 'Post a shift',
	empty: 'No shifts match.',
	loadError: 'Shifts could not be loaded.',
	role: 'Role',
	date: 'Date',
	endDate: 'End date',
	start: 'Start',
	end: 'End',
	days: 'Days',
	location: 'Location',
	people: 'People needed',
	rate: 'Hourly rate (USD)',
	requirements: 'Requirements',
	chooseRole: 'Choose a role',
	shiftTitle: 'Shift title',
	invite: 'Invite someone you know (optional)',
	apply: 'Apply',
	accept: 'Accept',
	pick: 'Pick',
	decline: 'Decline',
	fund: 'Fund escrow',
	checkIn: 'Check in',
	checkOut: 'Check out',
	hoursWorked: 'Hours worked',
	expected: 'Expected hours',
	approve: 'Approve hours',
	approvedHours: 'Approved hours',
	release: 'Release payment',
	invoice: 'Worker payout invoice',
	dispute: 'Dispute',
	disputeNote: 'What went wrong?',
	rateWorker: 'Rate the worker',
	rateBusiness: 'Rate the business',
	favourite: 'Favourite',
	rebook: 'Rebook this worker',
	login: 'Log in to continue.',
	loginLink: 'Log in',
	back: 'All shifts',
	openTab: 'Open shifts',
	mineTab: 'My shifts',
	mineEmpty: 'You have no shifts yet.',
	loading: 'Loading…',
	slow: 'This is taking too long.',
	retry: 'Try again',
	anyRole: 'Any role',
	maxRate: 'Max hourly rate',
	onOrAfter: 'Date on or after',
	picked: 'Picked',
	status: 'Status',
	showExpired: 'Show expired',
	you: 'You',
	save: 'Publish shift',
	sending: 'Saving…',
	noKyc:
		'No ID check and no agency fee. The business funds the expected hours from the same wallet in USDT or Bitcoin. Pay released is the hourly rate times the approved hours.',
	noFee: 'No agency fee.',
	asset: 'Pay from your wallet',
	usdt: 'USDT',
	bitcoin: 'Bitcoin',
	btcPartial:
		'Bitcoin pays the funded amount. Approve all funded hours, or fund the shift in USDT to pay a shorter time.',
	walletClosed: 'Open your wallet, then fund this shift.',
	escrowPending: 'Payment was sent, but the escrow is not confirmed yet. Check-in stays closed.',
	fundFirst: 'Fund the shift before opening a dispute.',
	released: 'Payment released.',
	errors: {
		'own-job': 'You cannot take your own shift.',
		full: 'This shift already has enough people.',
		closed: 'This shift is closed.',
		'not-invited': 'This invitation is not yours.',
		already: 'You already answered this shift.',
		'not-funded': 'Fund the escrow before check-in.',
		hours: 'Approved hours cannot be more than the hours worked.',
		rating: 'Choose a rating from 1 to 5.',
		dispute: 'Write what went wrong.',
		disputed: 'This shift is in dispute. Payment stays held.',
		'end-time': 'The end time has to be after the start time.',
		clock: 'Enter a valid time.',
		days: 'A shift needs at least one day.',
		title: 'Add a shift title.',
		role: 'Choose a role.',
		requirements: 'Add the requirements for this shift.',
		fields: 'Add a date, times, location, and headcount.',
		login: 'Log in to continue.',
		pubkey: 'Enter a valid public key.',
		favourite: 'Mark the worker as a favourite before rebooking.',
		amount: 'Rate and hours have to be greater than zero.',
		'wallet-closed': 'Open your wallet, then fund this shift.',
		'escrow-pending':
			'Payment was sent, but the escrow is not confirmed yet. Check-in stays closed.',
		'fund-first': 'Fund the shift before opening a dispute.',
		'release-failed': 'The payment was not released.',
		publish: 'The shift could not be saved.',
		price: 'Bitcoin price is unavailable. Fund this shift in USDT.',
		invoice: 'Paste a wallet invoice for the approved amount.',
		'btc-partial':
			'Bitcoin pays the funded amount. Approve all funded hours, or fund the shift in USDT to pay a shorter time.'
	}
};

const ES: StaffCopy = {
	title: 'Turnos',
	off: 'El personal temporal no está activado.',
	post: 'Publicar un turno',
	empty: 'Ningún turno coincide.',
	loadError: 'No se pudieron cargar los turnos.',
	role: 'Puesto',
	date: 'Fecha',
	endDate: 'Fecha final',
	start: 'Empieza',
	end: 'Termina',
	days: 'Días',
	location: 'Lugar',
	people: 'Personas',
	rate: 'Pago por hora (USD)',
	requirements: 'Requisitos',
	chooseRole: 'Elige un puesto',
	shiftTitle: 'Título del turno',
	invite: 'Invita a alguien que conozcas (opcional)',
	apply: 'Postularme',
	accept: 'Aceptar',
	pick: 'Elegir',
	decline: 'Rechazar',
	fund: 'Apartar el pago',
	checkIn: 'Entrada',
	checkOut: 'Salida',
	hoursWorked: 'Horas trabajadas',
	expected: 'Horas previstas',
	approve: 'Aprobar horas',
	approvedHours: 'Horas aprobadas',
	release: 'Liberar el pago',
	invoice: 'Factura de cobro de la persona',
	dispute: 'Disputar',
	disputeNote: '¿Qué pasó?',
	rateWorker: 'Calificar a la persona',
	rateBusiness: 'Calificar al negocio',
	favourite: 'Favorito',
	rebook: 'Volver a contratar',
	login: 'Entra para continuar.',
	loginLink: 'Entrar',
	back: 'Todos los turnos',
	openTab: 'Turnos abiertos',
	mineTab: 'Mis turnos',
	mineEmpty: 'Todavía no tienes turnos.',
	loading: 'Cargando…',
	slow: 'Está tardando demasiado.',
	retry: 'Intentar de nuevo',
	anyRole: 'Cualquier puesto',
	maxRate: 'Pago máximo por hora',
	onOrAfter: 'Fecha desde',
	picked: 'Elegidas',
	status: 'Estado',
	showExpired: 'Ver vencidos',
	you: 'Tú',
	save: 'Publicar turno',
	sending: 'Guardando…',
	noKyc:
		'Sin verificación de identidad y sin comisión de agencia. El negocio aparta las horas previstas desde la misma billetera en USDT o Bitcoin. El pago liberado es el pago por hora por las horas aprobadas.',
	noFee: 'Sin comisión de agencia.',
	asset: 'Pagar desde tu billetera',
	usdt: 'USDT',
	bitcoin: 'Bitcoin',
	btcPartial:
		'Bitcoin paga el monto apartado. Aprueba todas las horas apartadas, o aparta el pago en USDT para pagar menos tiempo.',
	walletClosed: 'Abre tu billetera y aparta el pago de este turno.',
	escrowPending:
		'El pago se envió, pero el depósito todavía no está confirmado. La entrada sigue cerrada.',
	fundFirst: 'Aparta el pago antes de abrir una disputa.',
	released: 'Pago liberado.',
	errors: {
		'own-job': 'No puedes tomar tu propio turno.',
		full: 'Este turno ya tiene todas las personas.',
		closed: 'Este turno está cerrado.',
		'not-invited': 'Esta invitación no es tuya.',
		already: 'Ya respondiste a este turno.',
		'not-funded': 'Aparta el pago antes de marcar la entrada.',
		hours: 'Las horas aprobadas no pueden superar las horas trabajadas.',
		rating: 'Elige una calificación del 1 al 5.',
		dispute: 'Escribe qué pasó.',
		disputed: 'Este turno está en disputa. El pago sigue apartado.',
		'end-time': 'La hora de salida tiene que ser después de la de entrada.',
		clock: 'Escribe una hora válida.',
		days: 'Un turno necesita al menos un día.',
		title: 'Agrega un título del turno.',
		role: 'Elige un puesto.',
		requirements: 'Agrega los requisitos de este turno.',
		fields: 'Agrega fecha, horario, lugar y personas.',
		login: 'Entra para continuar.',
		pubkey: 'Escribe una clave pública válida.',
		favourite: 'Marca a la persona como favorita antes de volver a contratarla.',
		amount: 'El pago y las horas tienen que ser mayores que cero.',
		'wallet-closed': 'Abre tu billetera y aparta el pago de este turno.',
		'escrow-pending':
			'El pago se envió, pero el depósito todavía no está confirmado. La entrada sigue cerrada.',
		'fund-first': 'Aparta el pago antes de abrir una disputa.',
		'release-failed': 'El pago no se liberó.',
		publish: 'No se pudo guardar el turno.',
		price: 'No hay precio de Bitcoin. Aparta este turno en USDT.',
		invoice: 'Pega una factura de la billetera por el monto aprobado.',
		'btc-partial':
			'Bitcoin paga el monto apartado. Aprueba todas las horas apartadas, o aparta el pago en USDT para pagar menos tiempo.'
	}
};

export function staffCopy(language: string): StaffCopy {
	return language.startsWith('es') ? ES : EN;
}

export function staffError(language: string, code: string): string {
	const copy = staffCopy(language);
	return copy.errors[code] || code;
}

export function staffErrorFrom(language: string, cause: unknown): string {
	const coded =
		cause && typeof cause === 'object' && 'code' in cause
			? String((cause as { code: unknown }).code)
			: '';
	const message = coded || (cause instanceof Error ? cause.message : 'publish');
	if (/no pubkey|private key/i.test(message)) return staffError(language, 'login');
	if (/wallet is not initialized/i.test(message)) return staffError(language, 'wallet-closed');
	if (/rgb: invoice|lightning invoice|locked sats/i.test(message))
		return staffError(language, 'invoice');
	return staffError(language, message);
}

const STATUS_EN: Record<string, string> = {
	open: 'Open',
	expired: 'Expired',
	filled: 'Filled',
	cancelled: 'Cancelled',
	invited: 'Invited',
	applied: 'Applied',
	picked: 'Picked',
	funded: 'Funded',
	checked_in: 'Checked in',
	checked_out: 'Checked out',
	approved: 'Approved',
	released: 'Released',
	disputed: 'Disputed',
	declined: 'Declined'
};

const STATUS_ES: Record<string, string> = {
	open: 'Abierto',
	expired: 'Vencido',
	filled: 'Completo',
	cancelled: 'Cancelado',
	invited: 'Invitado',
	applied: 'Postulado',
	picked: 'Elegido',
	funded: 'Pago apartado',
	checked_in: 'Entró',
	checked_out: 'Salió',
	approved: 'Horas aprobadas',
	released: 'Pagado',
	disputed: 'En disputa',
	declined: 'Rechazado'
};

export function dayCountLabel(language: string, days: number): string {
	const count = Math.max(0, Math.floor(days));
	if (language.startsWith('es')) return count === 1 ? '1 día' : `${count} días`;
	return count === 1 ? '1 day' : `${count} days`;
}

export function statusLabel(language: string, status: string): string {
	const table = language.startsWith('es') ? STATUS_ES : STATUS_EN;
	return table[status] || status;
}
