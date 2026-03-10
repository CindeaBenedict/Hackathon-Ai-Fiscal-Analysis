type DataFileSummary = {
  id: string;
  name: string;
  file_type: string;
  rows: number;
  columns: string[];
  sample_rows: Record<string, unknown>[];
  uploaded_at: string;
};

type DataUploadPageProps = {
  files: DataFileSummary[];
  processedByFile: Record<string, { inferred_mapping: Record<string, unknown>; ai_notes?: string }>;
  onUpload: (file: File) => Promise<void>;
  onRefresh: () => Promise<void>;
  onClear: () => Promise<void>;
  onProcessFile: (fileId: string) => Promise<void>;
};

function DataUploadPage({
  files,
  processedByFile,
  onUpload,
  onRefresh,
  onClear,
  onProcessFile,
}: DataUploadPageProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Data Upload</h2>
          <p className="muted">Upload CSV, JSON, or Excel files for AI analysis.</p>
        </div>
        <div className="actions-row">
          <button className="secondary-button" onClick={() => void onRefresh()}>
            Refresh
          </button>
          <button className="secondary-button" onClick={() => void onClear()}>
            Clear Data
          </button>
        </div>
      </div>

      <label className="upload-box">
        <span>Select file</span>
        <input
          type="file"
          accept=".csv,.json,.xlsx,.xlsm,.xltx,.xltm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void onUpload(file);
            }
            event.currentTarget.value = "";
          }}
        />
      </label>

      <div className="logs-list">
        {files.map((file) => (
          <article key={file.id} className="log-item">
            <header>
              <strong>{file.name}</strong>
              <span>{new Date(file.uploaded_at).toLocaleString()}</span>
            </header>
            <p className="muted">
              {file.file_type.toUpperCase()} | {file.rows} rows | columns:{" "}
              {file.columns.join(", ") || "none"}
            </p>
            <div className="actions-row">
              <button className="secondary-button" onClick={() => void onProcessFile(file.id)}>
                Process with AI
              </button>
            </div>
            <details>
              <summary>Sample rows</summary>
              <pre>{JSON.stringify(file.sample_rows, null, 2)}</pre>
            </details>
            {processedByFile[file.id] ? (
              <details>
                <summary>Processed mapping + AI notes</summary>
                <pre>{JSON.stringify(processedByFile[file.id].inferred_mapping, null, 2)}</pre>
                {processedByFile[file.id].ai_notes ? (
                  <p>{processedByFile[file.id].ai_notes}</p>
                ) : null}
              </details>
            ) : null}
          </article>
        ))}
        {files.length === 0 ? <p className="muted">No uploaded data yet.</p> : null}
      </div>
    </section>
  );
}

export type { DataFileSummary };
export default DataUploadPage;
