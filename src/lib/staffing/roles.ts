import { STAFF_ROLES, type StaffRole } from './types';

export const ROLE_LABELS: Record<StaffRole, { name: string; nameEs: string }> = {
	hospitality: { name: 'Hospitality', nameEs: 'Hostelería' },
	events: { name: 'Events', nameEs: 'Eventos' },
	warehouse: { name: 'Warehouse and logistics', nameEs: 'Almacén' },
	retail: { name: 'Retail', nameEs: 'Tienda' },
	admin: { name: 'Admin', nameEs: 'Admin' },
	cleaning: { name: 'Cleaning', nameEs: 'Limpieza' },
	promo: { name: 'Promo', nameEs: 'Promoción' },
	other: { name: 'Other', nameEs: 'Otro' }
};

export function isStaffRole(value: string): value is StaffRole {
	return (STAFF_ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: string, language: 'en' | 'es'): string {
	if (!isStaffRole(role)) return role;
	const labels = ROLE_LABELS[role];
	return language === 'es' ? labels.nameEs : labels.name;
}
