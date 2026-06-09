// Gasless Controller — REST endpoints for gasless relay and fee estimation

import {
	Controller,
	Post,
	Body,
	UseGuards,
	Req,
	HttpCode,
	HttpStatus,
	Logger
} from '@nestjs/common';
import { GaslessService, RelayUserOpDto, EstimateDto, FeeEstimate } from './gasless.service';
import { GaslessAuthGuard } from './guards/gasless-auth.guard';

interface JwtPayload {
	sub: string;
	walletAddress?: string;
}

@Controller('gasless')
export class GaslessController {
	private readonly logger = new Logger(GaslessController.name);

	constructor(private readonly gaslessService: GaslessService) {}

	@Post('relay')
	@UseGuards(GaslessAuthGuard)
	@HttpCode(HttpStatus.OK)
	async relay(
		@Body() dto: RelayUserOpDto,
		@Req() req: { user: JwtPayload }
	): Promise<{ userOpHash: string }> {
		this.logger.log(`Relay endpoint called by user ${req.user.sub}`);
		return this.gaslessService.relay(dto, req.user.sub);
	}

	@Post('estimate')
	@UseGuards(GaslessAuthGuard)
	@HttpCode(HttpStatus.OK)
	async estimate(@Body() dto: EstimateDto, @Req() req: { user: JwtPayload }): Promise<FeeEstimate> {
		this.logger.log(`Estimate endpoint called by user ${req.user.sub}`);
		return this.gaslessService.estimate(dto, req.user.sub);
	}
}
