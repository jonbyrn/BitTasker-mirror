// Gasless Auth Guard — JWT authentication for gasless endpoints
// Based on plan Section 4.3 (gasless-auth.guard.ts)

import {
	Injectable,
	CanActivate,
	ExecutionContext,
	UnauthorizedException,
	Logger
} from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env['JWT_SECRET'] || 'dev-secret-do-not-use-in-production';

export interface JwtPayload {
	sub: string;
	walletAddress?: string;
	iat?: number;
	exp?: number;
}

@Injectable()
export class GaslessAuthGuard implements CanActivate {
	private readonly logger = new Logger(GaslessAuthGuard.name);

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();
		const authHeader = request.headers.authorization;

		if (!authHeader) {
			throw new UnauthorizedException('Missing Authorization header');
		}

		const [scheme, token] = authHeader.split(' ');
		if (scheme !== 'Bearer' || !token) {
			throw new UnauthorizedException(
				'Invalid Authorization header format (expected: Bearer <token>)'
			);
		}

		try {
			const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
			// Attach payload to request for downstream use
			(request as any).user = payload;
			return true;
		} catch (e) {
			this.logger.warn(`JWT verification failed: ${e.message}`);
			throw new UnauthorizedException('Invalid or expired token');
		}
	}
}
