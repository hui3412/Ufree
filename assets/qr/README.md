# Local QR generator

`qrcodegen.js` is Project Nayuki's MIT-licensed QR Code generator, compiled from
[qrcodegen.ts](https://github.com/nayuki/QR-Code-generator/blob/master/typescript-javascript/qrcodegen.ts).
The copyright notice and full license are retained in the generated file.

Compiled with TypeScript 5.9.3, targeting ES2017 with no module wrapper and an
explicit `globalThis.qrcodegen` export.
The app loads this file locally and includes it in its offline cache. No schedule
data is sent to a QR service. QR codes use medium error correction and a
four-module white quiet zone.
