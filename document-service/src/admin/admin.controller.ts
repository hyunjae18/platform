import { Controller, Get, Post, Param, Req } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Request } from 'express';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('documents/stats')
  async getDocumentStats() {
    return this.adminService.getDocumentStats();
  }

  @Get('documents/failed')
  async getFailedDocuments() {
    return this.adminService.getFailedDocuments();
  }

  @Post('documents/:id/reprocess')
  async reprocessDocument(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as any).user?.sub || 'admin';
    return this.adminService.reprocessDocument(id, userId);
  }

  @Get('storage')
  async getStorageInfo() {
    return this.adminService.getStorageInfo();
  }
}