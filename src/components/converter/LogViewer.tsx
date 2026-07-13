import type { DebugLogEntry } from '@/lib/converters/types';
export function LogViewer({ logs }: { logs: DebugLogEntry[] }) { return <div className="log-viewer">{logs.length ? logs.map((log,index)=><div key={`${log.at}-${index}`}><time>{new Date(log.at).toLocaleTimeString('tr-TR')}</time><b>[{log.scope}]</b> {log.message}</div>) : <p>Henüz log yok.</p>}</div>; }
