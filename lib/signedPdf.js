import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Adds an auditable visual signature page to a PDF.
 * This is an electronic signature record, not a certificate-based digital signature.
 */
export async function addElectronicSignature(pdfBytes, { signerName, signerEmail, signedAt, requestId, signatureDataUrl }) {
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const sourcePage = pdf.getPages().at(-1);

  if (!sourcePage) {
    throw new Error('The uploaded PDF does not contain any pages.');
  }

  const page = pdf.addPage([sourcePage.getWidth(), sourcePage.getHeight()]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const boxWidth = Math.min(270, width - 48);
  const boxHeight = signatureDataUrl ? 132 : 82;
  const x = width - boxWidth - 24;
  const y = Math.max(24, height - boxHeight - 24);
  const displayName = signerName || signerEmail;
  const signedLabel = new Date(signedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  page.drawRectangle({
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.42, 0.06, 0.1),
    borderWidth: 1.2,
    opacity: 0.94,
  });
  page.drawText('Electronically signed', { x: x + 12, y: y + boxHeight - 21, size: 11, font: boldFont, color: rgb(0.42, 0.06, 0.1) });
  if (signatureDataUrl) {
    const signatureImage = await pdf.embedPng(signatureDataUrl);
    const imageWidth = Math.min(boxWidth - 24, signatureImage.width);
    const imageHeight = Math.min(46, imageWidth * signatureImage.height / signatureImage.width);
    page.drawImage(signatureImage, { x: x + 12, y: y + boxHeight - 72, width: imageWidth, height: imageHeight });
  }
  const textOffset = signatureDataUrl ? 78 : 39;
  page.drawText(displayName.slice(0, 48), { x: x + 12, y: y + boxHeight - textOffset, size: 12, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(signerEmail.slice(0, 56), { x: x + 12, y: y + boxHeight - textOffset - 15, size: 8, font, color: rgb(0.25, 0.25, 0.25) });
  page.drawText(`Signed ${signedLabel} UTC`, { x: x + 12, y: y + 15, size: 8, font, color: rgb(0.25, 0.25, 0.25) });
  page.drawText(`Lawgda ref: ${requestId.slice(0, 8)}`, { x: x + 12, y: y + 4, size: 7, font, color: rgb(0.4, 0.4, 0.4) });

  return pdf.save();
}
