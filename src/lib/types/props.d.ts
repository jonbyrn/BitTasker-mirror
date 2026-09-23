import type { Location } from '$lib/types/task';

export interface UploaderProps {
	id: string;
	label?: string;
	maxFiles?: number;
	maxFileSize?: number;
	allowedTypes?: string[];
	files?: (File | string)[];
	error?: string;
	width?: number;
	height?: number;
	maxDuration?: number;
	className?: string;
	onChange?: (files: File[]) => void;
	onRemove?: (index: number, file?: File | string) => void;
	onError?: (message: string) => void;
}

export interface TagsProps {
	options?: { id: number | string; name: string }[];
	selectedTags?: (number | string)[];
	placeholder?: string;
	error?: string;
	onChange?: (tags: (number | string)[]) => void;
}

export interface InputProps {
	id?: string;
	label?: string;
	value?: string;
	placeholder?: string;
	error?: string;
	required?: boolean;
	type?:
		| 'text'
		| 'number'
		| 'date'
		| 'time'
		| 'datetime'
		| 'month'
		| 'week'
		| 'email'
		| 'password'
		| 'search'
		| 'tel'
		| 'url'
		| 'color'
		| 'select';
	inputmode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
	autoComplete?: 'on' | 'off';
	options?: { label: string; value: string }[];
	min?: number;
	max?: number;
	step?: number;
	className?: string;
	onChange?: (option: { label: string; value: string }) => void;
}

export interface LocationProps {
	label?: string;
	placeholder?: string;
	location?: Location;
	defaultLocation?: Location;
	onLocationSelect: (location: Location) => void;
	showMap?: boolean;
	mapHeight?: string;
}
