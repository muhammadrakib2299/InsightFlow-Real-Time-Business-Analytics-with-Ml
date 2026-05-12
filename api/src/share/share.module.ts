import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [ShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
