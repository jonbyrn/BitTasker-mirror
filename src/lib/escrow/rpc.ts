import { hc } from 'hono/client';

const API_BASE: string = import.meta.env.VITE_ESCROW_API_BASE || 'http://localhost:8787';

// I implemented rpc client but the escrow server is not in the same repo so for now this is not a generic Hono client

export const rpcClient = hc(API_BASE);
