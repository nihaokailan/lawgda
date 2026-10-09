import forge from 'node-forge';

/**
 * Extracts the first private key + its certificate from a PKCS#12 (.p12/.pfx)
 * file, decrypting it with the provided passphrase. Returns the private key
 * as PKCS8 DER bytes (ready to be wrapped with AES-256 via keyWrapping.js)
 * plus the certificate in PEM form for identity/audit purposes.
 */
export function extractKeyAndCertFromP12(p12Base64, passphrase, now = new Date()) {
  let p12Asn1;
  try {
    const der = forge.util.decode64(p12Base64);
    p12Asn1 = forge.asn1.fromDer(der);
  } catch {
    throw new Error('The uploaded file is not a valid PKCS#12 (.p12) certificate.');
  }

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);
  } catch {
    throw new Error('Unable to open the certificate. Check that the passphrase is correct.');
  }

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const privateKey = keyBags.find((bag) => bag.key)?.key;
  if (!privateKey) {
    throw new Error('No supported RSA private key was found inside the uploaded certificate file.');
  }
  const cert = certBags.find(({ cert }) => cert?.publicKey?.n?.equals(privateKey.n)
    && cert.publicKey.e.equals(privateKey.e))?.cert;
  if (!cert) {
    throw new Error('No certificate matching the private key was found in the uploaded file.');
  }

  // A certificate outside its validity window cannot produce a valid signature.
  const { notBefore, notAfter } = cert.validity;
  const dateLabel = (date) => date.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'Asia/Manila' });
  if (now > notAfter) {
    throw new Error(`This certificate expired on ${dateLabel(notAfter)}. Renew it with DICT PNPKI before signing.`);
  }
  if (now < notBefore) {
    throw new Error(`This certificate is not valid until ${dateLabel(notBefore)}.`);
  }

  const privateKeyDer = Buffer.from(forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(privateKey))).getBytes(), 'binary');

  const certificatePem = forge.pki.certificateToPem(cert);
  const subjectCn = cert.subject.getField('CN')?.value || '';

  const distinguishedName = (name) => name.attributes
    .map((attribute) => `${attribute.shortName || attribute.name || attribute.type}=${attribute.value}`).join(', ');
  const details = {
    holderName: subjectCn || distinguishedName(cert.subject),
    issuer: cert.issuer.getField('CN')?.value || cert.issuer.getField('O')?.value || distinguishedName(cert.issuer),
    subject: distinguishedName(cert.subject),
    issuerDn: distinguishedName(cert.issuer),
    serialNumber: cert.serialNumber.toUpperCase(),
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
  };
  return { privateKeyDer, certificatePem, subjectCn, details };
}
