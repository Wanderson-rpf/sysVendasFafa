import { contextBridge, ipcRenderer } from 'electron';

type Resposta = { ok: true; data: unknown } | { ok: false; error: string };

contextBridge.exposeInMainWorld('api', {
  call: async (op: string, args?: unknown) => {
    const r = (await ipcRenderer.invoke('api', op, args)) as Resposta;
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
});
