export interface UserType {
    id: string;
    name: string;
    email: string;
    publicKey: string;
    privateKey?: string;  // Optional because it might not be available until decryption
    avatar?: string;
    bio?: string;
    rating?: number;
    tasksCompleted?: number;
    level?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
}
