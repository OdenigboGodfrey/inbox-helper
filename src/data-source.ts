
import 'dotenv/config';
import { DataSource } from 'typeorm';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  username: process.env.DATABASE_USER || 'inbox',
  password: process.env.DATABASE_PASSWORD || 'inbox_dev_password',
  database: process.env.DATABASE_NAME || 'inbox_helper',

  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],

  synchronize: false,
  migrationsRun: false,
  migrationsTableName: 'typeorm_migrations',
  migrationsTransactionMode: 'each',
});

export default dataSource;

