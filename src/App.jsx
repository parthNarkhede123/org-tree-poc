import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Separator } from './components/ui/separator';
import { Loader2, Play, RefreshCcw, Download, FileText, Pause, PlayCircle } from 'lucide-react';

// ------------------------------------------------------------
// Endpoints
// ------------------------------------------------------------
const RUN_URL =
  'https://st5irwf3ld.execute-api.us-east-1.amazonaws.com/Prod/automation-testing/run-script';
const LIST_URL =
  'https://st5irwf3ld.execute-api.us-east-1.amazonaws.com/Prod/automation-testing/list-scripts';
const DOWNLOAD_BASE =
  'https://st5irwf3ld.execute-api.us-east-1.amazonaws.com/Prod/automation-testing/download-url?'; // append "fileKey=<encoded key>" after '?' (use encodeURIComponent on the raw key from list-scripts)

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const statusVariant = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'pass' || s === 'success') return 'bg-green-100 text-green-800';
  if (s === 'running' || s === 'in-progress') return 'bg-yellow-100 text-yellow-800';
  if (s === 'fail' || s === 'failed' || s === 'error') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
};

const fmt = (d) => {
  try {
    if (!d) return '';
    const dt = new Date(d);
    if (String(dt) !== 'Invalid Date') return dt.toLocaleString();
    return d.replace(/_/g, ' ');
  } catch {
    return d || '';
  }
};

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Build the download URL the API expects: /download-url?fileKey=<URL-ENCODED-KEY>
function buildDownloadUrl(fileKey) {
  if (!fileKey) return '';
  const isEncoded = !fileKey.includes('/');
  const keyParam = isEncoded ? fileKey : encodeURIComponent(fileKey);
  return `${DOWNLOAD_BASE}fileKey=${keyParam}`;
}

function guessFilenameFromKey(fileKey) {
  try {
    const parts = (fileKey || '').split('/');
    return parts[parts.length - 1] || 'download';
  } catch {
    return 'download';
  }
}
function isTextFile(fileKey) {
  return /\.txt$/i.test((fileKey || '').split('?')[0]);
}
async function forceDownload(presignedUrl, filename) {
  try {
    const r = await fetch(presignedUrl, { method: 'GET' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  } catch (err) {
    const a = document.createElement('a');
    a.href = presignedUrl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function pickCurrentRecord(list, currentRunId, currentRunTimestamp, executedBy, scriptName) {
  if (!Array.isArray(list) || list.length === 0) return null;
  let found;
  if (currentRunId) {
    found = list.find((r) => `${r.id}` === `${currentRunId}`);
  }
  if (!found && currentRunTimestamp) {
    found = list.find((r) => r.timestamp === currentRunTimestamp);
  }
  if (!found) {
    const sameUserScript = list
      .filter(
        (r) =>
          (r.executed_by || '').toLowerCase() === (executedBy || '').toLowerCase() &&
          (r.script_name || '').toLowerCase() === (scriptName || '').toLowerCase()
      )
      .sort((a, b) => {
        const t1 = new Date(a.modified_at || a.created_at || a.timestamp || 0).getTime();
        const t2 = new Date(b.modified_at || b.created_at || b.timestamp || 0).getTime();
        return t2 - t1;
      });
    if (sameUserScript.length) found = sameUserScript[0];
  }
  return found || null;
}

export default function OrgTreeApiTestUI() {
  const [activeMenu, setActiveMenu] = useState('Org tree');

  const [executedBy, setExecutedBy] = useState('Parth Narkhede');
  const [scriptName, setScriptName] = useState('AgentsValidation');
  const [userId, setUserId] = useState('1f259d75-050b-11eb-95a1-85626eddb337');

  const [isRunning, setIsRunning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [currentRunId, setCurrentRunId] = useState(null);
  const [currentRunTimestamp, setCurrentRunTimestamp] = useState(null);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [records, setRecords] = useState([]);
  const [currentStatus, setCurrentStatus] = useState('Running');
  const [currentRunExecutedBy, setCurrentRunExecutedBy] = useState(null);
  const [currentRunScriptName, setCurrentRunScriptName] = useState(null);

  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const pollRef = useRef(null);
  const pollCount = useRef(0);
  const MAX_POLLS = 60;
  const POLL_MS = 3000;

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const d1 = new Date(a.modified_at || a.created_at || a.timestamp || 0).getTime();
      const d2 = new Date(b.modified_at || b.created_at || b.timestamp || 0).getTime();
      return d2 - d1;
    });
  }, [records]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsAutoRefresh(false);
    setIsRunning(false);
  };

  const startPolling = () => {
    stopPolling();
    setIsAutoRefresh(true);
    pollCount.current = 0;
    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      await loadRecords();
      if (pollCount.current >= MAX_POLLS) stopPolling();
    }, POLL_MS);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const payload = { scriptNames: [scriptName] };
      const data = await postJSON(LIST_URL, payload);
      setRecords(Array.isArray(data) ? data : []);

      const list = Array.isArray(data) ? data : [];
      const matchExec = (currentRunExecutedBy ?? executedBy) || '';
      const matchScript = (currentRunScriptName ?? scriptName) || '';
      const mine = list
        .filter(
          (r) =>
            (r.executed_by || '').toLowerCase() === matchExec.toLowerCase() &&
            (r.script_name || '').toLowerCase() === matchScript.toLowerCase()
        )
        .sort((a, b) => {
          const t1 = new Date(a.modified_at || a.created_at || a.timestamp || 0).getTime();
          const t2 = new Date(b.modified_at || b.created_at || b.timestamp || 0).getTime();
          return t2 - t1;
        });

      if (mine.length > 0) {
        const latest = mine[0];
        setCurrentRecord(latest);
        setCurrentStatus(latest.status || 'Running');
        const st = (latest.status || '').toLowerCase();
        if (st === 'pass' || (st && st !== 'running')) {
          stopPolling();
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const runScript = async () => {
    setIsRunning(true);
    setCurrentRecord(null);
    try {
      const body = {
        executedBy,
        scriptPayload: {
          scriptName,
          userId,
        },
      };
      const resp = await postJSON(RUN_URL, body);
      const id = resp?.scriptRecord?.id ?? resp?.id;
      setCurrentRunId(String(id));
      setCurrentRunTimestamp(resp?.scriptRecord?.timestamp ?? null);
      setCurrentRecord(resp?.scriptRecord || null);
      setCurrentStatus(resp?.scriptRecord?.status || 'Running');
      setCurrentRunExecutedBy(executedBy);
      setCurrentRunScriptName(scriptName);
      startPolling();
    } catch (e) {
      console.error(e);
      setIsRunning(false);
      alert('Failed to start the script. Check console for details.');
    }
  };

  const handleDownload = async (fileKey) => {
    if (!fileKey) return;
    try {
      const apiUrl = buildDownloadUrl(fileKey);
      const res = await fetch(apiUrl, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data = null;
      try { data = await res.json(); } catch { data = await res.text(); }
      const presigned = typeof data === 'string' ? data : (data?.downloadUrl || data?.download_url || data?.url);
      if (typeof presigned !== 'string' || !presigned.startsWith('http')) {
        throw new Error('No download URL found in response');
      }
      const filename = guessFilenameFromKey(fileKey);
      if (isTextFile(fileKey) || /\.txt(\?|$)/i.test(presigned)) {
        await forceDownload(presigned, filename);
      } else {
        window.open(presigned, '_blank');
      }
    } catch (e) {
      console.error(e);
      alert('Could not get the download URL. Check console for details.');
    }
  };

  useEffect(() => {
    loadRecords();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="border-b bg-white sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="text-xl font-semibold">Admin Portal</div>
          <div className="text-sm text-slate-500">
            Active Module: <span className="font-medium text-slate-700">Automation Testing</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl grid grid-cols-12 gap-4 p-4">
        <aside className="col-span-12 md:col-span-3 lg:col-span-2">
          <Card className="sticky top-[60px] h-[calc(100vh-60px)] flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Navigation</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-2 overflow-auto">
              <Button
                variant={activeMenu === 'Org tree' ? 'default' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setActiveMenu('Org tree')}
              >
                Org tree
              </Button>
              <Button
                variant={activeMenu === 'Team Module' ? 'default' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setActiveMenu('Team Module')}
              >
                Team Module
              </Button>
            </CardContent>
          </Card>
        </aside>

        <main className="col-span-12 md:col-span-9 lg:col-span-10">
          {activeMenu === 'Org tree' ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Filters & Run</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm">Executed By</Label>
                      <Input value={executedBy} onChange={(e) => setExecutedBy(e.target.value)} placeholder="Your name" />
                    </div>
                    <div>
                      <Label className="text-sm">Script Name</Label>
                      <Input value={scriptName} onChange={(e) => setScriptName(e.target.value)} placeholder="AgentsValidation" />
                    </div>
                    <div>
                      <Label className="text-sm">User ID</Label>
                      <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="UUID" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={runScript} disabled={isRunning}>
                      {isRunning ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting…
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" /> Run Script
                        </>
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setExecutedBy('Parth Narkhede');
                        setScriptName('AgentsValidation');
                        setUserId('');
                      }}
                    >
                      Clear
                    </Button>
                    <Button variant="ghost" onClick={loadRecords} disabled={isRefreshing}>
                      <RefreshCcw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    {isAutoRefresh ? (
                      <Button variant="outline" onClick={stopPolling}>
                        <Pause className="mr-2 h-4 w-4" /> Stop Auto-Refresh
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={startPolling}>
                        <PlayCircle className="mr-2 h-4 w-4" /> Auto-Refresh
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {currentRunId && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Current Run #{currentRunId}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <div>
                        Status:{' '}
                        <span className={`px-2 py-1 rounded-md ${statusVariant(currentStatus)}`}>{currentStatus}</span>
                      </div>
                      <Separator orientation="vertical" className="h-6" />
                      <div>
                        Executed By: <span className="font-medium">{currentRecord?.executed_by || executedBy}</span>
                      </div>
                      <Separator orientation="vertical" className="h-6" />
                      <div>
                        Script: <span className="font-medium">{currentRecord?.script_name || scriptName}</span>
                      </div>
                      {currentRecord?.timestamp && (
                        <>
                          <Separator orientation="vertical" className="h-6" />
                          <div>Started: {fmt(currentRecord.timestamp)}</div>
                        </>
                      )}
                    </div>

                    <div className="rounded-xl border bg-white p-3">
                      <div className="font-medium mb-2">Results</div>
                      {Array.isArray(currentRecord?.script_result) && currentRecord?.script_result?.length > 0 ? (
                        <div className="space-y-2">
                          {currentRecord.script_result.map((it, idx) => (
                            <div key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
                              <div className="text-sm">
                                <div className="font-medium">{it.sub_script || 'Result'}</div>
                                <div className="text-xs text-slate-500">{it.description || it.file_path}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => handleDownload(it.file_path)}>
                                  <Download className="mr-2 h-4 w-4" /> Download
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">
                          No results yet. {currentStatus.toLowerCase() === 'running' ? 'Waiting for the script to finish…' : ''}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border bg-white p-3">
                      <div className="font-medium mb-2">Logs</div>
                      {currentRecord?.log_file_path ? (
                        <Button size="sm" variant="outline" onClick={() => handleDownload(currentRecord.log_file_path)}>
                          <FileText className="mr-2 h-4 w-4" /> Download Log
                        </Button>
                      ) : (
                        <div className="text-sm text-slate-500">Log file not available yet.</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Executions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="py-2 pr-3">#</th>
                          <th className="py-2 pr-3">Executed By</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2 pr-3">Last Modified At</th>
                          <th className="py-2 pr-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRecords.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="py-2 pr-3 font-medium">{r.id}</td>
                            <td className="py-2 pr-3">{r.executed_by || '—'}</td>
                            <td className="py-2 pr-3">
                              <span className={`px-2 py-1 rounded-md ${statusVariant(r.status)}`}>{r.status}</span>
                            </td>
                            <td className="py-2 pr-3">{r.modified_at ? fmt(r.modified_at) : '—'}</td>
                            <td className="py-2 pr-3">
                              <div className="flex flex-wrap gap-2">
                                {Array.isArray(r.script_result) && r.script_result[0]?.file_path && (
                                  <Button size="sm" variant="outline" onClick={() => handleDownload(r.script_result[0].file_path)}>
                                    <Download className="mr-2 h-4 w-4" /> PDF
                                  </Button>
                                )}
                                {r.log_file_path && (
                                  <Button size="sm" variant="ghost" onClick={() => handleDownload(r.log_file_path)}>
                                    <FileText className="mr-2 h-4 w-4" /> Download Log
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Team Module</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-500 text-sm">Placeholder module.</CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}

// Dev-only sanity checks
(function () {
  const __DEV__ = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;
  if (!__DEV__) return;
  try {
    console.assert(statusVariant('Pass').includes('green'), 'statusVariant should map Pass to green style');
    console.assert(statusVariant('Running').includes('yellow'), 'statusVariant should map Running to yellow style');
    console.assert(statusVariant('Error').includes('red'), 'statusVariant should map Error/Fail to red style');
    console.assert(statusVariant('Fail').includes('red'), 'statusVariant should map Fail to red style');

    console.assert(buildDownloadUrl('AgentsValidation/x/log.txt').includes('fileKey=AgentsValidation%2Fx%2Flog.txt'), 'download url should append fileKey=<encoded> param');
    console.assert(buildDownloadUrl('AgentsValidation/x/file.pdf').includes('fileKey=AgentsValidation%2Fx%2Ffile.pdf'), 'download url should work for PDF too');

    console.assert(fmt('2025-09-26T06:24:48.215Z').length > 0, 'fmt should return a non-empty string for ISO dates');
    console.assert(fmt('2025-09-26_06-24-48-214').includes(' '), 'fmt should replace underscores for non-ISO timestamps');

    console.assert(isTextFile('foo/bar/log.txt') === true, 'isTextFile should detect .txt');
    console.assert(isTextFile('foo/bar/file.pdf?x=1') === false, 'isTextFile should be false for .pdf');
    console.assert(guessFilenameFromKey('a/b/c/log.txt') === 'log.txt', 'guessFilenameFromKey should return basename');

    const list = [
      { id: '1', status: 'Running', executed_by: 'User A', script_name: 'S1', timestamp: '2025-09-27T10:00:00Z' },
      { id: '2', status: 'Pass', executed_by: 'User B', script_name: 'S2', timestamp: '2025-09-27T11:00:00Z' },
    ];
    const byId = pickCurrentRecord(list, '2', null, 'User A', 'S1');
    console.assert(byId && byId.id === '2', 'pickCurrentRecord should return the record with matching id when provided');

    const byTs = pickCurrentRecord(list, null, '2025-09-27T10:00:00Z', 'User A', 'S1');
    console.assert(byTs && byTs.id === '1', 'pickCurrentRecord should return matching timestamp when id not provided');

    const list2 = [
      { id: '3', status: 'Running', executed_by: 'parth narkhede', script_name: 'agentsvalidation', timestamp: '2025-09-25T10:00:00Z' },
      { id: '4', status: 'Running', executed_by: 'Parth Narkhede', script_name: 'AgentsValidation', timestamp: '2025-09-28T10:00:00Z' },
    ];
    const byUserScript = pickCurrentRecord(list2, null, null, 'Parth Narkhede', 'AgentsValidation');
    console.assert(byUserScript && byUserScript.id === '4', 'should pick most recent match for same user & script name (case-insensitive)');
  } catch (e) {}
})();