/* CJS interop entry so Vite can named-export Psbt from bitcoinjs-lib v6. */
const bitcoinjs = require('bitcoinjs-lib');
module.exports = bitcoinjs;
module.exports.default = bitcoinjs;
