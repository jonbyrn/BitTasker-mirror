import * as raw from 'buffer-real-impl';

function unwrap(x, depth = 0) {
	if (!x || depth > 8) return null;
	if (typeof x.alloc === 'function') return x;
	return unwrap(x.Buffer, depth + 1) || unwrap(x.default, depth + 1);
}

const Buffer = unwrap(raw);
if (!Buffer) {
	throw new Error('[buffer-pkg] no Buffer.alloc on buffer-real-impl');
}

Buffer.Buffer = Buffer;
Buffer.default = Buffer;
if (typeof globalThis.Buffer === 'undefined') {
	globalThis.Buffer = Buffer;
}

export default Buffer;
export { Buffer };
