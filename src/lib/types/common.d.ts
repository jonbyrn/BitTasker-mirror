export interface ISkill {
    id: number;
    name: string;
    description: string;
    categoryId: number | null;
    isVerifiable: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    isDeleted: boolean;
    category: ICategory | null;
}

export interface ICategory {
    id: number;
    name: string;
    description: string;
    icon: string;
    slug: string;
    parentId: number | null;
    isActive: boolean;
    displayOrder: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    isDeleted: boolean;
    parent?: ICategory;
    children?: ICategory[];
    skills?: ISkill[];
}