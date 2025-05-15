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
	customClass?: string;
	onChange?: (files: File[]) => void;
	onError?: (message: string) => void;
}

export interface TagsProps {
	options?: { id: number; name: string }[];
	selectedTags?: number[];
	placeholder?: string;
	error?: string;
	onChange?: (tags: number[]) => void;
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
	autoComplete?: 'on' | 'off';
	options?: { label: string; value: string }[];
	onChange?: (option: { label: string; value: string }) => void;
}

export interface LocationProps {
	label?: string;
	placeholder?: string;
	location?: Location;
	defaultLocation?: Location;
	onLocationSelect: (location: Location) => void;
}
