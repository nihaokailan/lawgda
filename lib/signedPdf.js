import { PDFDocument, PDFName, PDFNumber, StandardFonts, rgb } from 'pdf-lib';

const CRIMSON = rgb(0.42, 0.06, 0.1);

// Brand mark drawn with vector shapes (no image asset is required).
function drawLawgdaLogo(page, font, boldFont, x, yTop) {
  const radius = 11;
  page.drawCircle({ x: x + radius, y: yTop - radius, size: radius, color: CRIMSON });
  page.drawText('L', { x: x + radius - 3.6, y: yTop - radius - 4.6, size: 13, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText('LAWGDA', { x: x + radius * 2 + 8, y: yTop - 15, size: 15, font: boldFont, color: CRIMSON });
  page.drawText('Electronic signature record', { x: x + radius * 2 + 8, y: yTop - 25, size: 6.5, font, color: rgb(0.4, 0.4, 0.4) });
}

/**
 * Adds an auditable visual signature page to a PDF.
 * Renders public identity details only. Cryptographic verification is stored in
 * the audit trail; this does not embed a PDF/CMS signature or any private key.
 */
export async function addElectronicSignature(pdfBytes, {
  signerName,
  signerEmail,
  signedAt,
  requestId,
  signatureDataUrl,
  certificateSubjectCn,
  certificateDetails,
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
  let resolvedSignaturePageIndex = Number.isInteger(signaturePageIndex) && signaturePageIndex >= 0 && signaturePageIndex < pages.length
    ? signaturePageIndex
    : pages.length;
  let appendedPage = resolvedSignaturePageIndex === pages.length;
  let page = appendedPage
    ? pdf.addPage([sourcePage.getWidth(), sourcePage.getHeight()])
    : pages[resolvedSignaturePageIndex];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const boxWidth = Math.min(270, width - 48);
  const hasVisualMark = Boolean(signatureDataUrl || certificateSubjectCn);
  const headerHeight = 26;
  const certificateLines = [];
  function addCertificateLine(value, size = 9, bold = false) {
    const selectedFont = bold ? boldFont : font;
    // Standard PDF fonts support Latin names; replace unsupported glyphs gracefully.
    const text = Array.from(String(value)).map((character) => {
      try { selectedFont.encodeText(character); return character; } catch { return '?'; }
    }).join('');
    let line = '';
    for (const character of text) {
      if (line && selectedFont.widthOfTextAtSize(line + character, size) > boxWidth - 24) {
        certificateLines.push({ text: line, size, font: selectedFont });
        line = '';
      }
      line += character;
    }
    certificateLines.push({ text: line, size, font: selectedFont });
  }
  const signedLabel = new Date(signedAt).toLocaleString('en-US', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila',
  });
  if (certificateSubjectCn) {
    addCertificateLine('Digitally signed by', 10);
    addCertificateLine(certificateSubjectCn, 12, true);
    addCertificateLine(`Date: ${signedLabel} PHT`, 8);
    addCertificateLine(`Certificate ID: ${certificateDetails?.serialNumber || 'Unavailable'}`, 8);
    addCertificateLine(`Issuer: ${certificateDetails?.issuer || 'Unavailable'}`, 8);
  }
  const boxHeight = certificateSubjectCn
    ? Math.max(146, certificateLines.reduce((sum, line) => sum + line.size + 6, 0) + 46 + headerHeight)
    : hasVisualMark ? 160 : 110;
  // Persist the next position in the PDF so mixed certificate/image blocks
  // remain together without relying on a fixed block height or total signer count.
  const cursorKey = PDFName.of('LawgdaSignatureBottom');
  const previousBottom = page.node.get(cursorKey);
  let top = previousBottom instanceof PDFNumber
    ? previousBottom.asNumber() - 12
    : height - 24;
  if (!(previousBottom instanceof PDFNumber) && Number(signatureCount) > 0 && resolvedSignaturePageIndex < pages.length) {
    // Older PDFs have one block at the top and no saved cursor.
    top -= Math.max(300, boxHeight) + 12;
  }
  if (boxHeight > height - 132) {
    throw new Error('The signature details are too tall to fit on this PDF page.');
  }
  if (top - boxHeight < 108) {
    page = pdf.addPage([width, height]);
    appendedPage = true;
    resolvedSignaturePageIndex = pdf.getPageCount() - 1;
    top = height - 24;
  }
  // Only pages Lawgda appended carry the logo, so the original document's content is never covered.
  const logoKey = PDFName.of('LawgdaLogoDrawn');
  if (appendedPage && !page.node.get(logoKey)) {
    drawLawgdaLogo(page, font, boldFont, 24, height - 24);
    page.node.set(logoKey, PDFNumber.of(1));
  }
  const x = width - boxWidth - 24;
  const y = top - boxHeight;
  page.node.set(cursorKey, PDFNumber.of(y));
  const displayName = signerName || signerEmail;

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
  page.drawRectangle({ x, y: y + boxHeight - headerHeight, width: boxWidth, height: headerHeight, color: CRIMSON });
  page.drawText(certificateSubjectCn ? 'DIGITALLY SIGNED' : 'ELECTRONICALLY SIGNED', {
    x: x + 12, y: y + boxHeight - 17, size: 9, font: boldFont, color: rgb(1, 1, 1),
  });
  if (certificateSubjectCn) {
    let baseline = y + boxHeight - headerHeight - 16;
    for (const line of certificateLines) {
      page.drawText(line.text, { x: x + 12, y: baseline, size: line.size, font: line.font, color: rgb(0.1, 0.1, 0.1) });
      baseline -= line.size + 6;
    }
    page.drawText(`Lawgda ref: ${requestId.slice(0, 8)}`, { x: x + 12, y: y + 17, size: 7, font });
  } else {
    if (signatureDataUrl) {
      const signatureImage = await pdf.embedPng(signatureDataUrl);
      const imageScale = Math.min((boxWidth - 24) / signatureImage.width, 46 / signatureImage.height);
      const imageWidth = signatureImage.width * imageScale;
      const imageHeight = signatureImage.height * imageScale;
      page.drawImage(signatureImage, { x: x + 12, y: y + boxHeight - 80, width: imageWidth, height: imageHeight });
    }
    const textOffset = hasVisualMark ? 96 : 44;
    page.drawText(displayName.slice(0, 48), { x: x + 12, y: y + boxHeight - textOffset, size: 12, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(signerEmail.slice(0, 56), { x: x + 12, y: y + boxHeight - textOffset - 15, size: 8, font, color: rgb(0.25, 0.25, 0.25) });
    page.drawText(`Signed ${signedLabel} PHT`, { x: x + 12, y: y + 28, size: 8, font, color: rgb(0.25, 0.25, 0.25) });
    page.drawText(`Lawgda ref: ${requestId.slice(0, 8)}`, { x: x + 12, y: y + 17, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
  }
  if (previousDocumentHash) {
    page.drawText('Pre-sign SHA-256', {
      x: x + 12,
      y: y + 6,
      size: 7,
      font: boldFont,
      color: rgb(0.25, 0.25, 0.25),
    });
    page.drawText(previousDocumentHash, {
      x: x + 80,
      y: y + 6,
      size: 5,
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
