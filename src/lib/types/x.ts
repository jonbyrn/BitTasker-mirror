export interface XUser {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
}

export interface XAuthResponse {
    oauth_token: string;
    oauth_token_secret: string;
    user_id: string;
    screen_name: string;
}

export interface XError {
    code: number;
    message: string;
}
