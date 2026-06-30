// Root module for the standalone gasless transaction relay service
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GaslessModule } from './gasless/gasless.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ['.env']
		}),
		ScheduleModule.forRoot(),
		GaslessModule
	]
})
export class AppModule {}
