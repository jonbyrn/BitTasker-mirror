export interface NotFoundCopy {
	notFoundTitle: string;
	notFoundDescription: string;
	serverTitle: string;
	serverDescription: string;
	badRequestTitle: string;
	badRequestDescription: string;
	genericTitle: string;
	genericDescription: string;
	goHome: string;
	goBack: string;
	help: string;
	contact: string;
}

const EN: NotFoundCopy = {
	notFoundTitle: 'Page Not Found',
	notFoundDescription: "The page you're looking for doesn't exist or has been moved.",
	serverTitle: 'Server Error',
	serverDescription: "Something went wrong on our end. We're working to fix this issue.",
	badRequestTitle: 'Bad Request',
	badRequestDescription: 'There was an issue with your request. Please check your input and try again.',
	genericTitle: 'Something went wrong',
	genericDescription: 'An unexpected error occurred.',
	goHome: 'Go Home',
	goBack: 'Go Back',
	help: 'Need help?',
	contact: 'Contact Support'
};

const ES: NotFoundCopy = {
	notFoundTitle: 'Página no encontrada',
	notFoundDescription: 'La página que buscas no existe o se movió.',
	serverTitle: 'Error del servidor',
	serverDescription: 'Algo salió mal de nuestro lado. Estamos trabajando para corregirlo.',
	badRequestTitle: 'Solicitud incorrecta',
	badRequestDescription: 'Hubo un problema con tu solicitud. Revisa los datos e inténtalo de nuevo.',
	genericTitle: 'Algo salió mal',
	genericDescription: 'Ocurrió un error inesperado.',
	goHome: 'Ir al inicio',
	goBack: 'Volver',
	help: '¿Necesitas ayuda?',
	contact: 'Contactar soporte'
};

export function notFoundCopy(language: string): NotFoundCopy {
	return String(language || '').toLowerCase().startsWith('es') ? ES : EN;
}
