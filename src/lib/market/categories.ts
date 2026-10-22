import type {
	GoodsCategory,
	GoodsCondition,
	GoodsFulfillment,
	RentalCategory,
	RentPeriod
} from './types';
import {
	GOODS_CATEGORIES,
	GOODS_CONDITIONS,
	GOODS_FULFILLMENTS,
	RENT_PERIODS,
	RENTAL_CATEGORIES
} from './types';

const CATEGORY_LABELS: Record<GoodsCategory, { name: string; nameEs: string }> = {
	electronics: { name: 'Electronics', nameEs: 'Electrónica' },
	phones: { name: 'Phones', nameEs: 'Teléfonos' },
	furniture: { name: 'Furniture', nameEs: 'Muebles' },
	home: { name: 'Home', nameEs: 'Hogar' },
	clothing: { name: 'Clothing', nameEs: 'Ropa' },
	vehicles: { name: 'Vehicles', nameEs: 'Vehículos' },
	tools: { name: 'Tools', nameEs: 'Herramientas' },
	sports: { name: 'Sports', nameEs: 'Deportes' },
	kids: { name: 'Kids', nameEs: 'Niños' },
	property: { name: 'Property and rentals', nameEs: 'Propiedad y alquileres' },
	digital: { name: 'Digital goods', nameEs: 'Bienes digitales' },
	other: { name: 'Other', nameEs: 'Otro' }
};

const RENTAL_LABELS: Record<RentalCategory, { name: string; nameEs: string }> = {
	'rent-vehicles': {
		name: 'Vehicles (cars, motorcycles, pickups)',
		nameEs: 'Vehículos (autos, motos, pickups)'
	},
	'rent-tools': { name: 'Tools & equipment', nameEs: 'Herramientas y equipo' },
	'rent-generators': { name: 'Generators & power', nameEs: 'Generadores y energía' },
	'rent-sound': { name: 'Sound & events', nameEs: 'Sonido y eventos' },
	'rent-party': { name: 'Party gear', nameEs: 'Artículos para fiestas' },
	'rent-cameras': { name: 'Cameras & electronics', nameEs: 'Cámaras y electrónica' },
	'rent-machinery': { name: 'Construction machinery', nameEs: 'Maquinaria de construcción' },
	'rent-boats': { name: 'Boats & surf', nameEs: 'Botes y surf' }
};

/** Example rates for El Salvador. Placeholders and hints only. Never a real listing. */
const RENT_PRICE_HINTS: Partial<
	Record<RentalCategory, { placeholder: string; period: RentPeriod; en: string; es: string }>
> = {
	'rent-vehicles': {
		placeholder: '50',
		period: 'day',
		en: 'A pickup in El Salvador is often about $40–60 a day.',
		es: 'Una pickup en El Salvador suele costar unos $40–60 al día.'
	},
	'rent-generators': {
		placeholder: '25',
		period: 'day',
		en: 'A generator in El Salvador is often about $25 a day.',
		es: 'Un generador en El Salvador suele costar unos $25 al día.'
	},
	'rent-sound': {
		placeholder: '60',
		period: 'day',
		en: 'A sound system in El Salvador is often about $50–80 per event.',
		es: 'Un equipo de sonido en El Salvador suele costar unos $50–80 por evento.'
	},
	'rent-boats': {
		placeholder: '12',
		period: 'day',
		en: 'A surfboard in El Salvador is often about $10–15 a day.',
		es: 'Una tabla de surf en El Salvador suele costar unos $10–15 al día.'
	}
};

const CONDITION_LABELS: Record<GoodsCondition, { name: string; nameEs: string }> = {
	new: { name: 'New', nameEs: 'Nuevo' },
	'like-new': { name: 'Like new', nameEs: 'Como nuevo' },
	good: { name: 'Good', nameEs: 'Bueno' },
	fair: { name: 'Fair', nameEs: 'Regular' },
	'for-parts': { name: 'For parts', nameEs: 'Para piezas' }
};

const FULFILLMENT_LABELS: Record<GoodsFulfillment, { name: string; nameEs: string }> = {
	pickup: { name: 'Pickup', nameEs: 'Recoger' },
	shipping: { name: 'Shipping', nameEs: 'Envío' },
	both: { name: 'Pickup or shipping', nameEs: 'Recoger o envío' },
	digital: { name: 'Digital delivery', nameEs: 'Entrega digital' }
};

function label(language: string, row: { name: string; nameEs: string }): string {
	return language.startsWith('es') ? row.nameEs : row.name;
}

export function isGoodsCategory(value: string): value is GoodsCategory {
	return (GOODS_CATEGORIES as readonly string[]).includes(value);
}

export function isRentalCategory(value: string): value is RentalCategory {
	return (RENTAL_CATEGORIES as readonly string[]).includes(value);
}

export function isRentPeriod(value: string): value is RentPeriod {
	return (RENT_PERIODS as readonly string[]).includes(value);
}

export function isGoodsCondition(value: string): value is GoodsCondition {
	return (GOODS_CONDITIONS as readonly string[]).includes(value);
}

export function isGoodsFulfillment(value: string): value is GoodsFulfillment {
	return (GOODS_FULFILLMENTS as readonly string[]).includes(value);
}

export function categoryLabel(category: string, language: string): string {
	if (isRentalCategory(category)) return label(language, RENTAL_LABELS[category]);
	if (!isGoodsCategory(category)) return category;
	return label(language, CATEGORY_LABELS[category]);
}

export function rentPeriodLabel(period: string, language: string): string {
	const spanish = language.startsWith('es');
	if (period === 'hour') return spanish ? 'hora' : 'hour';
	if (period === 'week') return spanish ? 'semana' : 'week';
	if (period === 'day') return spanish ? 'día' : 'day';
	return '';
}

export function rentPriceHint(
	category: string,
	language: string
): { placeholder: string; text: string; period: RentPeriod } | null {
	if (!isRentalCategory(category)) return null;
	const hint = RENT_PRICE_HINTS[category];
	if (!hint) return null;
	return {
		placeholder: hint.placeholder,
		period: hint.period,
		text: language.startsWith('es') ? hint.es : hint.en
	};
}

export function conditionLabel(condition: string, language: string): string {
	if (!isGoodsCondition(condition)) return condition;
	return label(language, CONDITION_LABELS[condition]);
}

export function fulfillmentLabel(fulfillment: string, language: string): string {
	if (!isGoodsFulfillment(fulfillment)) return fulfillment;
	return label(language, FULFILLMENT_LABELS[fulfillment]);
}

/** "See shop" is the unset-location placeholder from a market event. */
export function goodsPlaceLabel(location: string, language: string): string {
	if (location === 'See shop') return language.startsWith('es') ? 'Ver tienda' : 'See shop';
	return location;
}
