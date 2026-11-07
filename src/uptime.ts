// Ping helper — used by the dashboard to report whether the bot is online.
// Exported separately so the dashboard server can call it without circular deps.
import os from 'node:os';

export function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}
