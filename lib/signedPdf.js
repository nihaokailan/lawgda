import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Adds an auditable visual signature page to a PDF.
 * This is an electronic signature record, not a certificate-based digital signature.
 */
export async function addElectronicSignature(pdfBytes, {
  signerName,
  signerEmail,
  signedAt,
  requestId,
  signatureDataUrl,
  previousDocumentHash,
  signaturePageIndex,
  signatureCount = 0,
  verificationQrDataUrl,
}) {
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const sourcePage = pdf.getPages().at(-1);

  if (!sourcePage) {
    throw new Error('The uploaded PDF does not contain any pages.');
  }

  const pages = pdf.getPages();
  const resolvedSignaturePageIndex = Number.isInteger(signaturePageIndex) && signaturePageIndex >= 0 && signaturePageIndex < pages.length
    ? signaturePageIndex
    : pages.length;
  const page = resolvedSignaturePageIndex === pages.length
    ? pdf.addPage([sourcePage.getWidth(), sourcePage.getHeight()])
    : pages[resolvedSignaturePageIndex];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const boxWidth = Math.min(270, width - 48);
  const boxHeight = signatureDataUrl ? 146 : 96;
  const signatureSlot = Math.max(0, Math.floor((height - 48) / (boxHeight + 12)) - 1);
  const existingSignatureCount = Math.max(0, Number(signatureCount) || 0);
  const x = width - boxWidth - 24;
  const y = Math.max(24, height - boxHeight - 24 - Math.min(existingSignatureCount, signatureSlot) * (boxHeight + 12));
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
  page.drawText(`Signed ${signedLabel} UTC`, { x: x + 12, y: y + 28, size: 8, font, color: rgb(0.25, 0.25, 0.25) });
  page.drawText(`Lawgda ref: ${requestId.slice(0, 8)}`, { x: x + 12, y: y + 17, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
  if (previousDocumentHash) {
    page.drawText('Pre-sign SHA-256', {
      x: x + 12,
      y: y + 6,
      size: 7,
      font: boldFont,
      color: rgb(0.25, 0.25, 0.25),
    });
    page.drawText(previousDocumentHash, {
      x: x + 82,
      y: y + 6,
      size: 5.5,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
  }
  if (verificationQrDataUrl) {
    const qrImage = await pdf.embedPng(verificationQrDataUrl);
    const qrSize = 72;
    page.drawImage(qrImage, { x: 24, y: 24, width: qrSize, height: qrSize });
    page.drawText('Scan for audit trail', { x: 24, y: 14, size: 7, font, color: rgb(0.25, 0.25, 0.25) });
  }

  return {
    pdfBytes: await pdf.save(),
    signaturePageIndex: resolvedSignaturePageIndex,
  };
}
