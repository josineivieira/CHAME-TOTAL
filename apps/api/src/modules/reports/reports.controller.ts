import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  Inject,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { AuthRequest, Require } from '../../common/security';
import { Database } from '../../common/db';
import { audit } from '../../common/operations';
import { ReportsService } from './reports.service';
@Controller('dashboard')
@Require('dashboard.read')
export class DashboardController {
  constructor(@Inject(ReportsService) private service: ReportsService) {}
  @Get() get(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.dashboard(r.actor, q);
  }
}
@Controller('reports')
@Require('reports.read')
export class ReportsController {
  constructor(
    @Inject(ReportsService) private service: ReportsService,
    @Inject(Database) private db: Database,
  ) {}
  @Get() async get(@Req() r: AuthRequest, @Query() q: unknown, @Res() res: Response) {
    const { rows, period: p } = await this.service.rows(r.actor, q);
    if (p.format === 'json')
      return res.json({ data: rows, total: rows.length, from: p.from, to: p.to });
    if (!r.actor.permissions.includes('reports.export'))
      throw new ForbiddenException('Exportacao nao permitida.');
    if (p.format === 'pdf' && rows.length > 500)
      throw new BadRequestException('PDF limitado a 500 linhas; reduza o periodo ou use Excel.');
    await this.db.atomic((tx) =>
      audit(tx, r.actor, 'reports.export', 'Report', p.type, {
        format: p.format,
        count: rows.length,
      }),
    );
    const safe = (v: unknown) => {
      const s = String(v ?? '');
      return /^[=+@-]/.test(s) ? "'" + s : s;
    };
    if (p.format === 'xlsx') {
      const wb = new ExcelJS.Workbook(),
        sheet = wb.addWorksheet('Relatorio');
      const keys = rows[0] ? Object.keys(rows[0]) : ['Sem registros'];
      sheet.columns = keys.map((key) => ({ header: key, key, width: 24 }));
      for (const row of rows)
        sheet.addRow(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, safe(v)])));
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="chame-total-${p.type}.xlsx"`);
      await wb.xlsx.write(res);
      return res.end();
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="chame-total-${p.type}.pdf"`);
    const pdf = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    pdf.pipe(res);
    pdf
      .fontSize(16)
      .text('CHAME TOTAL')
      .fontSize(10)
      .text(`Relatorio ${p.type} | ${p.from} a ${p.to} | ${p.timezone}`)
      .moveDown();
    if (!rows.length) pdf.text('Nenhum registro no periodo.');
    for (const row of rows) {
      if (pdf.y > pdf.page.height - 60) pdf.addPage();
      pdf.fontSize(8).text(
        Object.entries(row)
          .map(([k, v]) => `${k}: ${safe(v)}`)
          .join(' | '),
        { width: pdf.page.width - 72 },
      );
      pdf.moveDown(0.5);
    }
    pdf.end();
  }
}
