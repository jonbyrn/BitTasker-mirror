const OPS = require('./bitcoin-ops.cjs')
const REVERSE_OPS = Object.fromEntries(
  Object.entries(OPS).filter(([, v]) => typeof v === 'number').map(([k, v]) => [String(v), k])
)
const mod = Object.assign({ OPS, REVERSE_OPS }, OPS)
mod.default = mod
module.exports = mod
