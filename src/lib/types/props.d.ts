export interface UploaderProps {
    id: string;
    label?: string;
    maxFiles?: number;
    maxFileSize?: number;
    allowedTypes?: string[];
    files?: File[];
    error?: string;
    width?: number;
    height?: number;
    onChange?: (files: File[]) => void;
    onError?: (message: string) => void;
}

export interface TagsProps {
    options?: { id: number, name: string }[];
    selectedTags?: number[];
    placeholder?: string;
    error?: string;
    onChange?: (tags: number[]) => void;
}

export interface InputProps {
    id: string;
    label?: string;
    value?: string;
    placeholder?: string;
    error?: string;
    options?: { label: string; value: string }[];
    onChange?: (option: { label: string; value: string }) => void;
}
