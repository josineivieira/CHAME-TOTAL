import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { config } from './config';
@Injectable()
export class Database extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = new URL(config.DATABASE_URL);
    url.searchParams.delete('options');
    super({
      adapter: new PrismaPg(
        {
          connectionString: url.toString(),
          options: '-c search_path=' + config.DATABASE_SCHEMA,
          max: 10,
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 30000,
        },
        { schema: config.DATABASE_SCHEMA },
      ),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  async atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 20000,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
  }
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
export type Tx = Prisma.TransactionClient;
