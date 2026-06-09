// Gasless Module — NestJS module for gasless transaction relay

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GaslessService } from './gasless.service';
import { GaslessController } from './gasless.controller';
import { DepositMonitorService } from './deposit-monitor.service';
import { PreflightSimulationService } from './preflight-simulation.service';
import { ChainlinkOracleService } from './chainlink-oracle.service';
import { PaymasterSigningService } from './paymaster-signing.service';

@Global()
@Module({
	imports: [ConfigModule],
	controllers: [GaslessController],
	providers: [
		GaslessService,
		DepositMonitorService,
		PreflightSimulationService,
		ChainlinkOracleService,
		PaymasterSigningService
	],
	exports: [GaslessService, DepositMonitorService, ChainlinkOracleService]
})
export class GaslessModule {}
