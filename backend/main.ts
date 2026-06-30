// Standalone NestJS entry point for the gasless transaction relay service
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
	const logger = new Logger('Bootstrap');

	const port = process.env.PORT ?? 4000;

	const app = await NestFactory.create(AppModule, {
		logger: ['error', 'warn', 'log', 'debug']
	});

	// CORS — allow the SvelteKit frontend
	app.enableCors({
		origin: process.env.CORS_ORIGIN || '*',
		methods: 'GET,HEAD,POST,OPTIONS',
		allowedHeaders: 'Content-Type,Authorization'
	});

	// Global validation pipe
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true
		})
	);

	// Health check endpoint (not behind auth)
	app.getHttpAdapter().get('/health', (_req, res) => {
		res
			.status(200)
			.json({ status: 'ok', service: 'gasless-relay', timestamp: new Date().toISOString() });
	});

	await app.listen(port, '0.0.0.0');
	logger.log(`Gasless relay service running on port ${port}`);
}

bootstrap();
