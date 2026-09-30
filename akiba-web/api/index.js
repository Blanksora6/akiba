// The single Vercel serverless function. vercel.json rewrites every /api/*
// request here; server/app.js does the routing.
import { handle } from '../server/app.js';

export default handle;
