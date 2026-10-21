export interface MarketCopy {
	title: string;
	off: string;
	sell: string;
	search: string;
	empty: string;
	loading: string;
	category: string;
	condition: string;
	fulfillment: string;
	price: string;
	location: string;
	distance: string;
	any: string;
	photos: string;
	photoLink: string;
	addPhoto: string;
	photoFailed: string;
	description: string;
	itemTitle: string;
	save: string;
	saving: string;
	near: string;
	nearDenied: string;
	message: string;
	buy: string;
	payUsdt: string;
	payBtc: string;
	fund: string;
	handover: string;
	invoice: string;
	received: string;
	dispute: string;
	disputeNote: string;
	sold: string;
	remove: string;
	edit: string;
	back: string;
	login: string;
	loginLink: string;
	noKyc: string;
	walletClosed: string;
	escrowPending: string;
	timeout: string;
	released: string;
	disputed: string;
	rateSeller: string;
	rateBuyer: string;
	yourListing: string;
	unavailable: string;
	noPrice: string;
	errors: Record<string, string>;
}

const EN: MarketCopy = {
	title: 'Buy & Sell',
	off: 'Buy & Sell is not turned on.',
	sell: 'Sell an item',
	search: 'Search items',
	empty: 'Nothing matches.',
	loading: 'Loading…',
	category: 'Category',
	condition: 'Condition',
	fulfillment: 'Pickup or shipping',
	price: 'Price (USD)',
	location: 'Location',
	distance: 'Within km',
	any: 'Any',
	photos: 'Photos',
	photoLink: 'Image link (https)',
	addPhoto: 'Add photo',
	photoFailed: 'That photo did not upload. Paste an image link instead.',
	description: 'Description',
	itemTitle: 'Title',
	save: 'Publish item',
	saving: 'Saving…',
	near: 'Use my location',
	nearDenied: 'Location access was denied.',
	message: 'Message seller',
	buy: 'Buy',
	payUsdt: 'Pay with USDT',
	payBtc: 'Pay with Bitcoin',
	fund: 'Fund escrow',
	handover: 'I handed it over',
	invoice: 'Your payout invoice',
	received: 'I received it. Release payment',
	dispute: 'Open a dispute',
	disputeNote: 'What went wrong?',
	sold: 'Mark sold',
	remove: 'Delete listing',
	edit: 'Edit',
	back: 'All items',
	login: 'Log in to continue.',
	loginLink: 'Log in',
	noKyc:
		'No ID check. The buyer funds escrow. Payment is released when the buyer confirms receipt.',
	walletClosed: 'Open your wallet, then fund this purchase.',
	escrowPending: 'Payment was sent, but the escrow is not confirmed yet.',
	timeout:
		'The 7-day handover window has passed. You can open a dispute. Payment stays held until the buyer confirms receipt.',
	released: 'Payment released.',
	disputed: 'This purchase is in dispute. Payment stays held.',
	rateSeller: 'Rate the seller',
	rateBuyer: 'Rate the buyer',
	yourListing: 'This is your item.',
	unavailable: 'This item is not available.',
	noPrice: 'Bitcoin price is unavailable. Pay with USDT.',
	errors: {
		login: 'Log in to continue.',
		fields: 'Add a title, description, category, condition, and location.',
		price: 'Enter a price in USD.',
		'own-item': 'You cannot buy your own item.',
		closed: 'This item is not available.',
		locked: 'A payment is in progress for this item.',
		invoice: 'Add the payout invoice.',
		dispute: 'Write what went wrong.',
		rating: 'Choose a rating from 1 to 5.',
		publish: 'The listing could not be saved.',
		'wallet-closed': 'Open your wallet, then fund this purchase.',
		'escrow-pending': 'Payment was sent, but the escrow is not confirmed yet.',
		'fund-first': 'Fund the purchase before opening a dispute.',
		disputed: 'This purchase is in dispute. Payment stays held.'
	}
};

const ES: MarketCopy = {
	title: 'Compra y venta',
	off: 'Compra y venta no está activado.',
	sell: 'Vender un artículo',
	search: 'Buscar artículos',
	empty: 'Nada coincide.',
	loading: 'Cargando…',
	category: 'Categoría',
	condition: 'Estado',
	fulfillment: 'Recoger o envío',
	price: 'Precio (USD)',
	location: 'Lugar',
	distance: 'En un radio de km',
	any: 'Cualquiera',
	photos: 'Fotos',
	photoLink: 'Enlace de imagen (https)',
	addPhoto: 'Añadir foto',
	photoFailed: 'La foto no se subió. Pega un enlace de imagen.',
	description: 'Descripción',
	itemTitle: 'Título',
	save: 'Publicar artículo',
	saving: 'Guardando…',
	near: 'Usar mi ubicación',
	nearDenied: 'No se permitió la ubicación.',
	message: 'Escribir al vendedor',
	buy: 'Comprar',
	payUsdt: 'Pagar con USDT',
	payBtc: 'Pagar con Bitcoin',
	fund: 'Depositar en garantía',
	handover: 'Ya lo entregué',
	invoice: 'Tu factura de cobro',
	received: 'Lo recibí. Liberar el pago',
	dispute: 'Abrir una disputa',
	disputeNote: '¿Qué salió mal?',
	sold: 'Marcar como vendido',
	remove: 'Eliminar anuncio',
	edit: 'Editar',
	back: 'Todos los artículos',
	login: 'Entra para continuar.',
	loginLink: 'Entrar',
	noKyc:
		'Sin verificación de identidad. El comprador deposita el pago. Se libera cuando el comprador confirma que lo recibió.',
	walletClosed: 'Abre tu billetera y luego deposita esta compra.',
	escrowPending: 'El pago se envió, pero la garantía aún no está confirmada.',
	timeout:
		'Pasaron 7 días sin entrega. Puedes abrir una disputa. El pago sigue retenido hasta que el comprador confirme.',
	released: 'Pago liberado.',
	disputed: 'Esta compra está en disputa. El pago sigue retenido.',
	rateSeller: 'Calificar al vendedor',
	rateBuyer: 'Calificar al comprador',
	yourListing: 'Este artículo es tuyo.',
	unavailable: 'Este artículo no está disponible.',
	noPrice: 'El precio de Bitcoin no está disponible. Paga con USDT.',
	errors: {
		login: 'Entra para continuar.',
		fields: 'Añade título, descripción, categoría, estado y lugar.',
		price: 'Escribe un precio en USD.',
		'own-item': 'No puedes comprar tu propio artículo.',
		closed: 'Este artículo no está disponible.',
		locked: 'Hay un pago en curso para este artículo.',
		invoice: 'Añade la factura de cobro.',
		dispute: 'Escribe qué salió mal.',
		rating: 'Elige una calificación del 1 al 5.',
		publish: 'No se pudo guardar el anuncio.',
		'wallet-closed': 'Abre tu billetera y luego deposita esta compra.',
		'escrow-pending': 'El pago se envió, pero la garantía aún no está confirmada.',
		'fund-first': 'Deposita la compra antes de abrir una disputa.',
		disputed: 'Esta compra está en disputa. El pago sigue retenido.'
	}
};

export function marketCopy(language: string): MarketCopy {
	return language.startsWith('es') ? ES : EN;
}

export function marketErrorFrom(language: string, error: unknown): string {
	const copy = marketCopy(language);
	const code = error instanceof Error ? error.message : '';
	return copy.errors[code] || copy.errors.publish;
}
