export interface MarketCopy {
	title: string;
	off: string;
	sell: string;
	search: string;
	empty: string;
	emptyHelp: string;
	catalogEmpty: string;
	loading: string;
	slow: string;
	retry: string;
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
	reserve: string;
	reservePay: string;
	reserveCollect: string;
	deposit: string;
	depositFull: string;
	collectBy: string;
	noShow: string;
	noShowHint: string;
	payWallet: string;
	short: string;
	receive: string;
	buyCard: string;
	showCode: string;
	enterCode: string;
	scan: string;
	refundDeposit: string;
	claimNoShow: string;
	collected: string;
	refunded: string;
	shop: string;
	yourShop: string;
	shopName: string;
	shopAbout: string;
	zones: string;
	zoneName: string;
	zoneCost: string;
	zoneRegions: string;
	zoneService: string;
	addZone: string;
	moreOptions: string;
	unlock: string;
	quantity: string;
	quantityHint: string;
	options: string;
	optionName: string;
	optionPrice: string;
	addOption: string;
	extraShipping: string;
	inStock: string;
	soldOut: string;
	shipping: string;
	address: string;
	addressHint: string;
	total: string;
	orderSent: string;
	unlimited: string;
	errors: Record<string, string>;
}

const EN: MarketCopy = {
	title: 'Buy & Sell',
	off: 'Buy & Sell is not turned on.',
	sell: 'Sell an item',
	search: 'Search items',
	empty: 'Nothing matches these filters.',
	emptyHelp:
		'Sell an item you want to pass on. Pickup, shipping, and digital delivery stay on BitTasker.',
	catalogEmpty: 'No items on the catalog yet.',
	loading: 'Loading…',
	slow: 'This is taking too long.',
	retry: 'Try again',
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
	reserve: 'How the buyer pays',
	reservePay: 'Pay in full on handover',
	reserveCollect: 'Deposit until collected',
	deposit: 'Deposit (USD)',
	depositFull: 'Hold the full price',
	collectBy: 'Collect by',
	noShow: 'If the buyer does not collect, the seller keeps',
	noShowHint: 'Percent of the deposit. The rest goes back to the buyer.',
	payWallet: 'Pay from wallet',
	short: 'Your wallet does not cover this yet.',
	receive: 'Receive',
	buyCard: 'Buy',
	showCode: 'Show this code when you collect the item.',
	enterCode: 'Collection code',
	scan: 'Scan code',
	refundDeposit: 'Refund the deposit',
	claimNoShow: 'Claim the no-show share',
	collected: 'Collected. Payment released.',
	refunded: 'Deposit refunded.',
	shop: 'Shop',
	yourShop: 'Your shop',
	shopName: 'Shop name',
	shopAbout: 'About this shop',
	zones: 'Shipping zones',
	zoneName: 'Zone name',
	zoneCost: 'Cost (USD)',
	zoneRegions: 'Places, separated by commas',
	zoneService: 'How it arrives',
	addZone: 'Add a zone',
	moreOptions: 'More options',
	unlock: 'Unlock wallet',
	quantity: 'Quantity',
	quantityHint: 'Leave blank for unlimited.',
	options: 'Options',
	optionName: 'Option name',
	optionPrice: 'Price (USD)',
	addOption: 'Add an option',
	extraShipping: 'Extra shipping per item (USD)',
	inStock: 'In stock',
	soldOut: 'Sold out',
	shipping: 'Shipping',
	address: 'Shipping address',
	addressHint: 'Sent only to the seller, with the order message.',
	total: 'Total',
	orderSent: 'Order sent to the seller.',
	unlimited: 'Unlimited',
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
		disputed: 'This purchase is in dispute. Payment stays held.',
		deposit: 'Enter a deposit up to the price.',
		date: 'Choose a collection date.',
		code: 'That code does not match.',
		late: 'The collection date has passed.',
		early: 'The collection date has not passed.',
		short: 'Your wallet does not cover this yet.',
		quantity: 'Enter a quantity that is still in stock.',
		option: 'Each option needs a name and a USD price.',
		shipping: 'Add a shipping zone with a name, cost, and places.'
	}
};

const ES: MarketCopy = {
	title: 'Compra y venta',
	off: 'Compra y venta no está activado.',
	sell: 'Vender un artículo',
	search: 'Buscar artículos',
	empty: 'Nada coincide con estos filtros.',
	catalogEmpty: 'Todavía no hay artículos en el catálogo.',
	emptyHelp:
		'Vende un artículo que quieras pasar. Recoger, envío y entrega digital se quedan en BitTasker.',
	loading: 'Cargando…',
	slow: 'Está tardando demasiado.',
	retry: 'Intentar de nuevo',
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
	reserve: 'Cómo paga el comprador',
	reservePay: 'Pagar todo al entregar',
	reserveCollect: 'Depósito hasta recogerlo',
	deposit: 'Depósito (USD)',
	depositFull: 'Retener el precio completo',
	collectBy: 'Recoger antes del',
	noShow: 'Si el comprador no lo recoge, el vendedor se queda',
	noShowHint: 'Porcentaje del depósito. El resto vuelve al comprador.',
	payWallet: 'Pagar desde la billetera',
	short: 'Tu billetera no cubre esto todavía.',
	receive: 'Recibir',
	buyCard: 'Comprar',
	showCode: 'Muestra este código cuando recojas el artículo.',
	enterCode: 'Código de recogida',
	scan: 'Escanear código',
	refundDeposit: 'Devolver el depósito',
	claimNoShow: 'Cobrar la parte por no recoger',
	collected: 'Recogido. Pago liberado.',
	refunded: 'Depósito devuelto.',
	shop: 'Tienda',
	yourShop: 'Tu tienda',
	shopName: 'Nombre de la tienda',
	shopAbout: 'Sobre esta tienda',
	zones: 'Zonas de envío',
	zoneName: 'Nombre de la zona',
	zoneCost: 'Costo (USD)',
	zoneRegions: 'Lugares, separados por comas',
	zoneService: 'Cómo llega',
	addZone: 'Añadir una zona',
	moreOptions: 'Más opciones',
	unlock: 'Abrir billetera',
	quantity: 'Cantidad',
	quantityHint: 'Déjalo vacío si no hay límite.',
	options: 'Opciones',
	optionName: 'Nombre de la opción',
	optionPrice: 'Precio (USD)',
	addOption: 'Añadir una opción',
	extraShipping: 'Envío extra por artículo (USD)',
	inStock: 'En stock',
	soldOut: 'Agotado',
	shipping: 'Envío',
	address: 'Dirección de envío',
	addressHint: 'Se envía solo al vendedor, con el mensaje del pedido.',
	total: 'Total',
	orderSent: 'Pedido enviado al vendedor.',
	unlimited: 'Sin límite',
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
		disputed: 'Esta compra está en disputa. El pago sigue retenido.',
		deposit: 'Escribe un depósito hasta el precio.',
		date: 'Elige la fecha de recogida.',
		code: 'Ese código no coincide.',
		late: 'Pasó la fecha de recogida.',
		early: 'Aún no pasa la fecha de recogida.',
		short: 'Tu billetera no cubre esto todavía.',
		quantity: 'Escribe una cantidad que todavía haya en stock.',
		option: 'Cada opción necesita un nombre y un precio en USD.',
		shipping: 'Añade una zona de envío con nombre, costo y lugares.'
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
