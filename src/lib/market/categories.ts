import type { GoodsCategory, GoodsCondition, GoodsFulfillment } from './types';
import { GOODS_CATEGORIES, GOODS_CONDITIONS, GOODS_FULFILLMENTS } from './types';

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

export function isGoodsCondition(value: string): value is GoodsCondition {
	return (GOODS_CONDITIONS as readonly string[]).includes(value);
}

export function isGoodsFulfillment(value: string): value is GoodsFulfillment {
	return (GOODS_FULFILLMENTS as readonly string[]).includes(value);
}

export function categoryLabel(category: string, language: string): string {
	if (!isGoodsCategory(category)) return category;
	return label(language, CATEGORY_LABELS[category]);
}

export function conditionLabel(condition: string, language: string): string {
	if (!isGoodsCondition(condition)) return condition;
	return label(language, CONDITION_LABELS[condition]);
}

export function fulfillmentLabel(fulfillment: string, language: string): string {
	if (!isGoodsFulfillment(fulfillment)) return fulfillment;
	return label(language, FULFILLMENT_LABELS[fulfillment]);
}
