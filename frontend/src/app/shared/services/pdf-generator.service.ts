import { Injectable } from '@angular/core';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

import * as pdfMakeLib from 'pdfmake/build/pdfmake';
import * as pdfFontsLib from 'pdfmake/build/vfs_fonts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfMake: any = (pdfMakeLib as any).default || pdfMakeLib;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfFonts: any = (pdfFontsLib as any).default || pdfFontsLib;

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs || pdfFonts;

@Injectable({
  providedIn: 'root',
})
export class PdfGeneratorService {
  /**
   * Genera un PDF a partir de una definición y lo retorna como Blob.
   * @param documentDefinition Definición del documento de pdfMake
   */
  async generatePdfBlob(documentDefinition: TDocumentDefinitions): Promise<Blob> {
    const pdfDocGenerator = pdfMake.createPdf(documentDefinition);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (pdfDocGenerator as any).getBlob();
  }

  async generatePdfBase64(documentDefinition: TDocumentDefinitions): Promise<string> {
    const pdfDocGenerator = pdfMake.createPdf(documentDefinition);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (pdfDocGenerator as any).getBase64();
  }

  async getPdfDataUrl(documentDefinition: TDocumentDefinitions): Promise<string> {
    const pdfDocGenerator = pdfMake.createPdf(documentDefinition);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (pdfDocGenerator as any).getDataUrl();
  }

  /**
   * Abre el PDF generado en una nueva ventana.
   */
  openPdf(documentDefinition: TDocumentDefinitions): void {
    pdfMake.createPdf(documentDefinition).open();
  }

  /**
   * Descarga el PDF generado.
   */
  downloadPdf(documentDefinition: TDocumentDefinitions, fileName: string): void {
    pdfMake.createPdf(documentDefinition).download(fileName);
  }
}
