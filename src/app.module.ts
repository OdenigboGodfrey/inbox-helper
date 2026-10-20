
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboxModule } from './modules/inbox/inbox.module';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'node:path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AppController } from './app.controller';
import { HealthModule } from './modules/health/health.module';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number(process.env.DATABASE_PORT || 5432),
      username: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'inbox_dev_password',
      database: process.env.DATABASE_NAME || 'postgres',
      retryAttempts: 5,
      retryDelay: 2000,
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
      migrationsRun: false,
      migrationsTableName: 'typeorm_migrations',
      migrationsTransactionMode: 'each',
      
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
      exclude: ['/api/{*path}'],
    }),
    InboxModule,
    AuthModule,
    NotificationModule,
    HealthModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
