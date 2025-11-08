import { WebSocket } from "ws";

class ClientStore {
  devices: Map<string, WebSocket> = new Map();

  registerDevice(id: string, socket: WebSocket) {
    this.devices.set(id, socket);
  }

  removeDevice(id: string) {
    this.devices.delete(id);
  }

  sendToDevice(id: string, data: any) {
    const socket = this.devices.get(id);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event: "from_whatsapp", data }));
    }
  }

  deviceExists(id: string): boolean {
    return this.devices.has(id);
  }
}

export const clientStore = new ClientStore();
