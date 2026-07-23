import { Module } from '@nestjs/common';
import { ExpenseClaimsController } from './expense-claims.controller';
import { ExpenseClaimsService } from './expense-claims.service';

@Module({
  controllers: [ExpenseClaimsController],
  providers: [ExpenseClaimsService],
})
export class ExpenseClaimsModule {}
