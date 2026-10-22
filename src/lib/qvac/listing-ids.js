/** Buy, sell, and rent categories the listing draft is allowed to pick. */

export const GOODS_LISTING_CATEGORIES = [
	{ id: 'electronics', name: 'Electronics', nameEs: 'Electrónica' },
	{ id: 'phones', name: 'Phones', nameEs: 'Teléfonos' },
	{ id: 'furniture', name: 'Furniture', nameEs: 'Muebles' },
	{ id: 'home', name: 'Home', nameEs: 'Hogar' },
	{ id: 'clothing', name: 'Clothing', nameEs: 'Ropa' },
	{ id: 'vehicles', name: 'Vehicles', nameEs: 'Vehículos' },
	{ id: 'tools', name: 'Tools', nameEs: 'Herramientas' },
	{ id: 'sports', name: 'Sports', nameEs: 'Deportes' },
	{ id: 'kids', name: 'Kids', nameEs: 'Niños' },
	{ id: 'property', name: 'Property and rentals', nameEs: 'Propiedad y alquileres' },
	{ id: 'digital', name: 'Digital goods', nameEs: 'Bienes digitales' },
	{ id: 'other', name: 'Other', nameEs: 'Otro' }
];

export const RENTAL_LISTING_CATEGORIES = [
	{
		id: 'rent-vehicles',
		name: 'Vehicles (cars, motorcycles, pickups)',
		nameEs: 'Vehículos (autos, motos, pickups)'
	},
	{ id: 'rent-tools', name: 'Tools and equipment', nameEs: 'Herramientas y equipo' },
	{ id: 'rent-generators', name: 'Generators and power', nameEs: 'Generadores y energía' },
	{ id: 'rent-sound', name: 'Sound and events', nameEs: 'Sonido y eventos' },
	{ id: 'rent-party', name: 'Party gear', nameEs: 'Artículos para fiestas' },
	{ id: 'rent-cameras', name: 'Cameras and electronics', nameEs: 'Cámaras y electrónica' },
	{ id: 'rent-machinery', name: 'Construction machinery', nameEs: 'Maquinaria de construcción' },
	{ id: 'rent-boats', name: 'Boats and surf', nameEs: 'Botes y surf' }
];

/**
 * @param {'sell' | 'rent' | string} offer
 */
export function listingCatalog(offer) {
	return offer === 'rent' ? RENTAL_LISTING_CATEGORIES : GOODS_LISTING_CATEGORIES;
}

/**
 * @param {'sell' | 'rent' | string} offer
 */
export function listingLines(offer) {
	return listingCatalog(offer).map(
		(category) => `${category.id} | ${category.name} | ${category.nameEs}`
	);
}

/**
 * @param {unknown} id
 * @param {'sell' | 'rent' | string} [offer]
 */
export function listingCategoryId(id, offer = 'sell') {
	const value = String(id || '').trim();
	return listingCatalog(offer).some((category) => category.id === value) ? value : '';
}
